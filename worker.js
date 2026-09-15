const MODEL = 'gemini-2.5-flash';
const ALLOWED = new Set(['POST','OPTIONS']);

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-SEO-Prompt, X-SEO-Mime, X-SEO-Filename',
    'Access-Control-Max-Age': '86400',
  };
}
function json(data,status=200,origin='*'){return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8',...corsHeaders(origin)}})}
async function parseResponse(r){const text=await r.text();let data;try{data=JSON.parse(text)}catch{data={raw:text}}if(!r.ok)throw new Error(data?.error?.message||data?.raw||`Gemini request failed (${r.status})`);return data}
async function uploadStream(env,request,mime,filename){
  const start=await fetch('https://generativelanguage.googleapis.com/upload/v1beta/files',{method:'POST',headers:{'x-goog-api-key':env.GEMINI_API_KEY,'X-Goog-Upload-Protocol':'resumable','X-Goog-Upload-Command':'start','X-Goog-Upload-Header-Content-Length':request.headers.get('content-length')||'0','X-Goog-Upload-Header-Content-Type':mime,'Content-Type':'application/json'},body:JSON.stringify({file:{display_name:filename||'seo-upload'}})});
  if(!start.ok)throw new Error((await start.text()).slice(0,800)||`Upload initialization failed (${start.status})`);
  const uploadUrl=start.headers.get('x-goog-upload-url');
  if(!uploadUrl)throw new Error('Gemini did not return the resumable upload URL.');
  const uploaded=await fetch(uploadUrl,{method:'POST',headers:{'Content-Length':request.headers.get('content-length')||'0','X-Goog-Upload-Offset':'0','X-Goog-Upload-Command':'upload, finalize'},body:request.body});
  const data=await parseResponse(uploaded);
  const name=data?.file?.name,uri=data?.file?.uri,returnedMime=data?.file?.mimeType||mime;
  if(!name||!uri)throw new Error('Gemini upload returned no file URI.');
  let state=data?.file?.state;
  for(let i=0;i<48&&state&&state!=='ACTIVE';i++){
    if(state==='FAILED')throw new Error('Gemini could not process the uploaded media.');
    await new Promise(r=>setTimeout(r,2500));
    const status=await fetch(`https://generativelanguage.googleapis.com/v1beta/${name}`,{headers:{'x-goog-api-key':env.GEMINI_API_KEY}});
    const sd=await parseResponse(status);state=sd?.state||sd?.file?.state;
  }
  if(state&&state!=='ACTIVE')throw new Error('Media processing timed out. Try a shorter video.');
  return{uri,mime:returnedMime};
}
export default{async fetch(request,env){
  const origin=request.headers.get('Origin')||'*';
  if(!ALLOWED.has(request.method))return json({error:'Method not allowed.'},405,origin);
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:corsHeaders(origin)});
  if(!env.GEMINI_API_KEY)return json({error:'Server is missing GEMINI_API_KEY. Add it as a Worker secret.'},500,origin);
  const url=new URL(request.url);if(url.pathname!=='/analyze')return json({error:'Use POST /analyze.'},404,origin);
  try{
    const prompt=request.headers.get('X-SEO-Prompt')||'',mime=request.headers.get('X-SEO-Mime')||request.headers.get('Content-Type')||'text/plain',filename=request.headers.get('X-SEO-Filename')||'seo-upload';
    if(!prompt)return json({error:'Missing analysis prompt.'},400,origin);
    const parts=[{text:prompt}],hasBody=!!request.body;
    if(hasBody){
      if(mime.startsWith('text/')){const text=await request.text();parts.push({text:`Uploaded text source:\n${text.slice(0,300000)}`})}
      else{const f=await uploadStream(env,request,mime,filename);parts.push({file_data:{mime_type:f.mime,file_uri:f.uri}})}
    }
    const result=await parseResponse(await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':env.GEMINI_API_KEY},body:JSON.stringify({contents:[{role:'user',parts}],generationConfig:{responseMimeType:'application/json',temperature:.45}})}));
    const text=result?.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join('')||'';if(!text)return json({error:'Gemini returned no analysis.'},502,origin);
    return json({text},200,origin);
  }catch(error){return json({error:error?.message||'Analysis failed.'},500,origin)}
}};
