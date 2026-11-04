/* Universal Source Fix Engine — browser-side, free-first, no server storage. */
(() => {
  const TEXT_EXT = /\.(html?|xhtml|css|scss|less|js|jsx|ts|tsx|json|md|mdx|xml|svg|php|liquid|vue|svelte|astro|yml|yaml|txt)$/i;
  const SKIP = /(^|\/)(node_modules|\.git|dist|build|\.next|coverage|vendor)(\/|$)/i;
  const MAX_ZIP_BYTES=50*1024*1024;
  const MAX_FILE_BYTES=1000000;
  const MAX_FILES=5000;
  const MAX_UNCOMPRESSED_BYTES=200*1024*1024;
  const esc = s => String(s ?? "");
  function unsafePath(name){
    if(!name||name.startsWith("/")||/^[A-Za-z]:[\\/]/.test(name))return true;
    const parts=name.replaceAll("\\","/").split("/");
    return parts.some(p=>p===".."||p==="");
  }
  function detect(files){
    const p=files.map(x=>x.path);
    if(p.some(x=>/(^|\/)app\/.*\.(tsx|ts|jsx|js)$/i.test(x))) return "Next.js / App Router";
    if(p.some(x=>/(^|\/)pages\/.*\.(tsx|ts|jsx|js)$/i.test(x)) && p.some(x=>/next\.config\./i.test(x))) return "Next.js / Pages Router";
    if(p.some(x=>/next\.config\./i.test(x))) return "Next.js";
    if(p.some(x=>/vite\.config\./i.test(x))) return "Vite / React or frontend SPA";
    if(p.some(x=>/shopify|theme\.liquid|config\/settings_schema\.json/i.test(x))) return "Shopify theme";
    if(p.some(x=>/wp-content|wp-config\.php|functions\.php/i.test(x))) return "WordPress source";
    if(p.some(x=>/webflow/i.test(x))) return "Webflow export";
    if(p.some(x=>/index\.html$/i.test(x))) return "Static HTML";
    return "Unknown / mixed source";
  }
  function findEntrypoints(files,framework){
    const p=files.map(x=>x.path),out=[];const add=x=>{if(x&&!out.includes(x))out.push(x)};
    if(framework.includes("Static")) add(p.find(x=>/^index\.html$/i.test(x))||p.find(x=>/\/index\.html$/i.test(x)));
    if(framework.includes("Next.js / App")){add(p.find(x=>/^app\/layout\.(tsx|ts|jsx|js)$/i.test(x)));add(p.find(x=>/^app\/page\.(tsx|ts|jsx|js)$/i.test(x)))}
    if(framework.includes("Next.js / Pages"))add(p.find(x=>/^pages\/_app\.(tsx|ts|jsx|js)$/i.test(x)));
    if(framework.includes("Shopify"))add(p.find(x=>/^layout\/theme\.liquid$/i.test(x)));
    if(!out.length)p.filter(x=>/\.(html?|liquid|tsx|jsx|vue|svelte|astro)$/i.test(x)).slice(0,8).forEach(add);
    return out;
  }
  function staticFix(content){
    let c=content,changes=[];
    if(!/<title\b[^>]*>[\s\S]*?<\/title>/i.test(c)&&/<head\b/i.test(c)){c=c.replace(/<head\b[^>]*>/i,m=>m+"\n  <title>Website — Clear Page Title</title>");changes.push("Add title placeholder")}
    if(!/<meta\b[^>]*name=["']description["'][^>]*>/i.test(c)&&/<head\b/i.test(c)){c=c.replace(/<head\b[^>]*>/i,m=>m+'\n  <meta name="description" content="Write an accurate 70–170 character summary of this page.">');changes.push("Add meta description placeholder")}
    if(!/<meta\b[^>]*name=["']viewport["'][^>]*>/i.test(c)&&/<head\b/i.test(c)){c=c.replace(/<head\b[^>]*>/i,m=>m+'\n  <meta name="viewport" content="width=device-width, initial-scale=1">');changes.push("Add viewport")}
    if(!/<html\b[^>]*\blang=["'][^"']+["']/i.test(c)&&/<html\b/i.test(c)){c=c.replace(/<html\b([^>]*)>/i,(m,a)=>'<html'+a+' lang="en">');changes.push("Add lang=en")}
    if(!/<link\b[^>]*rel=["'][^"']*canonical[^"']*["']/i.test(c)&&/<head\b/i.test(c)){c=c.replace(/<head\b[^>]*>/i,m=>m+'\n  <link rel="canonical" href="REPLACE_WITH_CANONICAL_URL">');changes.push("Add canonical placeholder")}
    return {content:c,changes};
  }
  function nextMetadata(content,path){
    if(!/layout\.(tsx|ts|jsx|js)$/i.test(path)||/export\s+(const|default)\s+metadata\b/i.test(content))return {content,changes:[]};
    if(/export\s+(default\s+)?function/i.test(content)){
      return {content:"import type { Metadata } from 'next';\n\nexport const metadata: Metadata = { title: 'Replace with the real page title', description: 'Replace with an accurate page description.' };\n\n"+content,changes:["Add Next.js Metadata API scaffold (review placeholders)"]};
    }
    return {content,changes:[]};
  }
  async function readZip(file){
    if(!window.JSZip)throw Error("ZIP engine is still loading. Try again.");
    if(file.size>MAX_ZIP_BYTES)throw Error("ZIP is larger than 50 MB.");
    const zip=await JSZip.loadAsync(file,{checkCRC32:true});
    const names=Object.keys(zip.files);
    if(names.length>MAX_FILES)throw Error("ZIP contains too many entries.");
    let total=0;const files=[];
    for(const name of names){
      const e=zip.files[name];if(e.dir)continue;
      if(unsafePath(name))throw Error("ZIP contains an unsafe path: "+name);
      if(SKIP.test(name)||!TEXT_EXT.test(name))continue;
      const blob=await e.async("string");total+=blob.length;
      if(total>MAX_UNCOMPRESSED_BYTES)throw Error("ZIP uncompressed content exceeds the safety limit.");
      if(blob.length>MAX_FILE_BYTES)continue;
      files.push({path:name,content:blob,original:blob});
    }
    if(!files.length)throw Error("No supported text source files were found in the ZIP.");
    return {zip,files};
  }
  async function fixZip(file,selected=true,approvedPaths=null){
    const state=await readZip(file),framework=detect(state.files),entry=findEntrypoints(state.files,framework),changed=[];
    for(const f of state.files){
      let r={content:f.content,changes:[]};
      if(/Static HTML|Webflow/.test(framework)&&entry.includes(f.path))r=staticFix(f.content,f.path);
      if(/Next\.js/.test(framework)&&entry.includes(f.path))r=nextMetadata(f.content,f.path);
      if(r.content!==f.content){f.content=r.content;changed.push({path:f.path,changes:r.changes});}
    }
    if(selected&&changed.length){
      for(const f of state.files)if(f.content!==f.original&&(!approvedPaths||approvedPaths.has(f.path)))state.zip.file(f.path,f.content);
    }
    return {zip:state.zip,files:state.files,framework,entry,changed};
  }
  function setupAdvancedEndpoint(){
    const boot=()=>{
      const ep=document.querySelector("#ep");
      if(!ep||document.querySelector("#zyven-advanced"))return;
      const row=ep.closest(".field"); if(row)row.style.display="none";
      const box=document.createElement("div"); box.id="zyven-advanced"; box.style.marginTop="10px";
      const saved=localStorage.getItem("zyvenseo_worker_url")||"";
      if(saved)ep.value=saved;
      box.innerHTML='<button type="button" class="secondary" id="zyvenAdvancedBtn">Advanced Settings</button><div id="zyvenAdvancedPanel" style="display:none;margin-top:8px;padding:10px;border:1px solid #263a55;border-radius:10px;background:#091321"><div class="small" style="margin-bottom:6px">Backend configuration is hidden from normal users.</div><input id="zyvenWorkerSetting" style="width:100%;padding:10px;background:#08111e;border:1px solid #293a54;border-radius:10px;color:#fff" placeholder="https://your-worker.workers.dev" value="'+esc(saved)+'"><button type="button" class="secondary" id="zyvenSaveWorker">Save backend</button><div id="zyvenWorkerStatus" class="small" style="margin-top:6px"></div></div>';
      row?.parentElement?.insertBefore(box,row.nextSibling);
      document.querySelector("#zyvenAdvancedBtn").onclick=()=>{const p=document.querySelector("#zyvenAdvancedPanel");p.style.display=p.style.display==="none"?"block":"none"};
      document.querySelector("#zyvenSaveWorker").onclick=()=>{
        const v=document.querySelector("#zyvenWorkerSetting").value.trim().replace(/\/$/,"");
        try{if(v)new URL(v);else throw Error("Enter a valid Worker URL.");localStorage.setItem("zyvenseo_worker_url",v);ep.value=v;document.querySelector("#zyvenWorkerStatus").textContent="Saved ✓"}catch(e){document.querySelector("#zyvenWorkerStatus").textContent=e.message}
      };
    };
    if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot,{once:true});else boot();
  }
  window.ZyvenSourceFix={readZip,fixZip,detect};
})();