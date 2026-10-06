/* Universal Source Fix Engine — browser-side, free-first, no server storage. */
(() => {
  const TEXT_EXT = /\.(html?|xhtml|css|scss|less|js|jsx|ts|tsx|json|md|mdx|xml|svg|php|liquid|vue|svelte|astro|yml|yaml|txt)$/i;
  const SKIP = /(^|\/)(node_modules|\.git|dist|build|\.next|coverage|vendor)(\/|$)/i;
  const esc = s => String(s ?? "");
  function detect(files){
    const p = files.map(x=>x.path);
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
    const p=files.map(x=>x.path);
    const out=[];
    const add=x=>{if(x&&!out.includes(x))out.push(x)};
    if(framework.includes("Static")) add(p.find(x=>/^index\.html$/i.test(x))||p.find(x=>/\/index\.html$/i.test(x)));
    if(framework.includes("Next.js / App")) { add(p.find(x=>/^app\/layout\.(tsx|ts|jsx|js)$/i.test(x))); add(p.find(x=>/^app\/page\.(tsx|ts|jsx|js)$/i.test(x))); }
    if(framework.includes("Next.js / Pages")) add(p.find(x=>/^pages\/_app\.(tsx|ts|jsx|js)$/i.test(x)));
    if(framework.includes("Shopify")) add(p.find(x=>/^layout\/theme\.liquid$/i.test(x)));
    if(!out.length) p.filter(x=>/\.(html?|liquid|tsx|jsx|vue|svelte|astro)$/i.test(x)).slice(0,8).forEach(add);
    return out;
  }
  function staticFix(content, path){
    let c=content, changes=[];
    const hasTitle=/<title\b[^>]*>[\s\S]*?<\/title>/i.test(c);
    const hasDesc=/<meta\b[^>]*name=["']description["'][^>]*>/i.test(c);
    const hasViewport=/<meta\b[^>]*name=["']viewport["'][^>]*>/i.test(c);
    const hasLang=/<html\b[^>]*\blang=["'][^"']+["']/i.test(c);
    if(!hasTitle && /<head\b/i.test(c)){ c=c.replace(/<head\b[^>]*>/i, m=>m+"\n  <title>Website — Clear Page Title</title>"); changes.push("Add a title placeholder"); }
    if(!hasDesc && /<head\b/i.test(c)){ c=c.replace(/<head\b[^>]*>/i, m=>m+'\n  <meta name="description" content="Write an accurate 70–170 character summary of this page.">'); changes.push("Add meta description placeholder"); }
    if(!hasViewport && /<head\b/i.test(c)){ c=c.replace(/<head\b[^>]*>/i, m=>m+'\n  <meta name="viewport" content="width=device-width, initial-scale=1">'); changes.push("Add viewport"); }
    if(!hasLang && /<html\b/i.test(c)){ c=c.replace(/<html\b([^>]*)>/i,(m,a)=>'<html'+a+' lang="en">'); changes.push("Add lang=en"); }
    if(!/<link\b[^>]*rel=["'][^"']*canonical[^"']*["']/i.test(c) && /<head\b/i.test(c)){ c=c.replace(/<head\b[^>]*>/i,m=>m+'\n  <link rel="canonical" href="REPLACE_WITH_CANONICAL_URL">'); changes.push("Add canonical placeholder"); }
    return {content:c,changes};
  }
  function nextMetadata(content,path){
    if(!/layout\.(tsx|ts|jsx|js)$/i.test(path)) return {content,changes:[]};
    if(/export\s+(const|default)\s+metadata\b/i.test(content)) return {content,changes:[]};
    if(!/import\s+type\s+\{\s*Metadata/i.test(content) && /export\s+(default\s+)?function|export\s+default\s+function/i.test(content)){
      const c="import type { Metadata } from 'next';\n\nexport const metadata: Metadata = {\n  title: 'Replace with the real page title',\n  description: 'Replace with an accurate page description.'\n};\n\n"+content;
      return {content:c,changes:["Add Next.js Metadata API scaffold (review placeholders)"]};
    }
    return {content,changes:[]};
  }
  async function readZip(file){
    if(!window.JSZip) throw Error("ZIP engine is still loading. Try again.");
    if(file.size>50*1024*1024) throw Error("ZIP is larger than 50 MB. Use a smaller source archive.");
    const zip=await JSZip.loadAsync(file,{checkCRC32:false});
    const files=[];
    for(const name of Object.keys(zip.files)){
      const e=zip.files[name]; if(e.dir||SKIP.test(name)) continue;
      if(!TEXT_EXT.test(name)) continue;
      const blob=await e.async("string");
      if(blob.length>1000000) continue;
      files.push({path:name,content:blob,original:blob});
    }
    if(!files.length) throw Error("No supported text source files were found in the ZIP.");
    return {zip,files};
  }
  async function fixZip(file,selected=true,approvedPaths=null){
    const state=await readZip(file), framework=detect(state.files), entry=findEntrypoints(state.files,framework), changed=[];
    for(const f of state.files){
      let r={content:f.content,changes:[]};
      if(/Static HTML|Webflow/.test(framework) && entry.includes(f.path)) r=staticFix(f.content,f.path);
      if(/Next\.js/.test(framework) && entry.includes(f.path)) r=nextMetadata(f.content,f.path);
      if(r.content!==f.content){f.content=r.content;changed.push({path:f.path,changes:r.changes});}
    }
    if(selected && changed.length){
      for(const f of state.files) if(f.content!==f.original && (!approvedPaths || approvedPaths.has(f.path))) state.zip.file(f.path,f.content);
    }
    return {zip:state.zip,files:state.files,framework,entry,changed};
  }
  window.ZyvenSourceFix={readZip,fixZip,detect};
})();