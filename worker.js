const MODEL = 'gemini-2.5-flash';
const MAX_BYTES = 100 * 1024 * 1024;
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
  const length=Number(request.headers.get('content-length')||0);
  if(length>MAX_BYTES)throw new Error('File is larger than 100 MB. Please upload a shorter/smaller media file.');
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

const QUALITY_GUARDRAIL = `
SERVER-SIDE SEO QUALITY STANDARD — follow this even if the client prompt is weaker:
You are not a generic caption generator. You are a senior multimodal SEO strategist and content analyst. The uploaded media is the primary evidence. For video, inspect the actual visual sequence and any readable on-screen text; for audio, use the spoken content; for images, inspect the visible subject, scene, text and context. Do not merely repeat the user's topic.

Before generating SEO, internally perform this evidence pipeline:
1) Identify the exact subject/topic.
2) Identify concrete visual/audio elements actually supported by the source.
3) Identify the likely viewer search intent.
4) Separate source-supported facts from assumptions.
5) Build natural search phrases from the actual content.
6) Generate platform-specific SEO rather than copying one package four times.
7) Remove irrelevant, duplicated, sensational or keyword-stuffed terms.
8) Score the result only for source-fit/editorial SEO quality, never as a prediction of views or virality.

NEVER invent search volume, rankings, trend percentages, platform secrets, private algorithm signals, people, products, locations, medical/scientific claims, statistics or facts that are not supported by the source or supplied context. If something cannot be verified from the supplied material, mark it as uncertain or omit it. Never guarantee virality.

Keywords must be semantically relevant and useful to a real viewer. Include primary, secondary and long-tail phrases only when supported. Hashtags must be relevant, limited and non-spammy. Do not repeat the same hashtag list across every platform when a better platform-specific selection is possible.

For educational/science/medical content, use accurate neutral terminology and do not turn visualization into a factual medical claim unless the source/context supports it.

Return ONLY the requested JSON object. No markdown fences, no commentary outside JSON. Ensure every required field exists and arrays contain strings.
`;

export default{async fetch(request,env){
  const origin=request.headers.get('Origin')||'*';
  if(!ALLOWED.has(request.method))return json({error:'Method not allowed.'},405,origin);
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:corsHeaders(origin)});
  if(!env.GEMINI_API_KEY)return json({error:'Server is missing GEMINI_API_KEY. Add it as a Worker secret.'},500,origin);
  const url=new URL(request.url);if(url.pathname!=='/analyze')return json({error:'Use POST /analyze.'},404,origin);
  try{
    const clientPrompt=request.headers.get('X-SEO-Prompt')||'',mime=request.headers.get('X-SEO-Mime')||request.headers.get('Content-Type')||'text/plain',filename=request.headers.get('X-SEO-Filename')||'seo-upload';
    if(!clientPrompt)return json({error:'Missing analysis prompt.'},400,origin);
    const prompt=QUALITY_GUARDRAIL+'\nCLIENT REQUEST:\n'+clientPrompt;
    const parts=[{text:prompt}],hasBody=!!request.body;
    if(hasBody){
      const length=Number(request.headers.get('content-length')||0);
      if(length>MAX_BYTES)return json({error:'File is larger than 100 MB. Please upload a shorter/smaller media file.'},413,origin);
      if(mime.startsWith('text/')){const text=await request.text();parts.push({text:`Uploaded text source:\n${text.slice(0,300000)}`})}
      else{const f=await uploadStream(env,request,mime,filename);parts.push({file_data:{mime_type:f.mime,file_uri:f.uri}})}
    }
    const body={contents:[{role:'user',parts}],generationConfig:{responseMimeType:'application/json',temperature:.35,maxOutputTokens:5000}};
    const result=await parseResponse(await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':env.GEMINI_API_KEY},body:JSON.stringify(body)}));
    const text=result?.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join('')||'';if(!text)return json({error:'Gemini returned no analysis.'},502,origin);
    return json({text},200,origin);
  }catch(error){return json({error:error?.message||'Analysis failed.'},500,origin)}
}};
