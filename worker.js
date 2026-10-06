const MAX_HTML=2000000;
const HEAD={"Access-Control-Allow-Methods":"POST,OPTIONS","Access-Control-Allow-Headers":"Content-Type","Cache-Control":"no-store"};
const json=(d,s=200,o="*")=>new Response(JSON.stringify(d),{status:s,headers:{"Content-Type":"application/json",...HEAD,"Access-Control-Allow-Origin":o}});
const strip=s=>String(s||"").replace(/<script[\s\S]*?<\/script>/gi," ").replace(/<style[\s\S]*?<\/style>/gi," ").replace(/<noscript[\s\S]*?<\/noscript>/gi," ").replace(/<[^>]+>/g," ").replace(/&nbsp;/gi," ").replace(/&amp;/gi,"&").replace(/&lt;/gi,"<").replace(/&gt;/gi,">").replace(/\s+/g," ").trim();
const attr=(html,tag,name)=>{const re=new RegExp("<"+tag+"\\b[^>]*\\b"+name+"=[\"']([^\"']*)[\"']","i");return html.match(re)?.[1]||""};
const all=(html,tag)=>{const re=new RegExp("<"+tag+"\\b[^>]*>([\\s\\S]*?)</"+tag+">","gi"),a=[];let m;while((m=re.exec(html))&&a.length<100)a.push(strip(m[1]));return a};
function links(html,base){const re=/<a\b[^>]*href=["']([^"']+)["'][^>]*>/gi,a=[];let m;try{const b=new URL(base);while((m=re.exec(html))&&a.length<300){try{const u=new URL(m[1],b);a.push({url:u.href,text:""})}catch{}}}catch{}return a}
function techDetect(html,headers){const t=[],h=html.toLowerCase(),server=(headers.get("server")||"").toLowerCase();if(/_next\//.test(h)||/next\.js/.test(h))t.push("Next.js");if(/react(?:\.production)?(?:\.min)?\.js/.test(h)||/data-reactroot/.test(h))t.push("React");if(/wp-content|wordpress/.test(h))t.push("WordPress");if(/shopify|cdn\.shopify/.test(h))t.push("Shopify");if(/wixstatic|wix\.com/.test(h))t.push("Wix");if(/webflow/.test(h))t.push("Webflow");if(/bolt\.new/.test(h))t.push("Bolt");if(/firebaseapp\.com|firebaseio\.com/.test(h))t.push("Firebase");if(/cloudflare/.test(server))t.push("Cloudflare");if(/vercel/.test(server)||/vercel\.com/.test(h))t.push("Vercel");if(!t.length)t.push("HTML / JavaScript or unknown stack");return [...new Set(t)]}
function audit(html,url,headers){
 const title=all(html,"title")[0]||"";
 const metaDesc=(html.match(/<meta\b[^>]*name=["']description["'][^>]*content=["']([^"']*)["'][^>]*>/i)?.[1])||"";
 const canonical=(html.match(/<link\b[^>]*rel=["'][^"']*canonical[^"']*["'][^>]*href=["']([^"']+)["'][^>]*>/i)?.[1])||"";
 const robots=(html.match(/<meta\b[^>]*name=["']robots["'][^>]*content=["']([^"']*)["'][^>]*>/i)?.[1])||"";
 const ogTitle=(html.match(/<meta\b[^>]*property=["']og:title["'][^>]*content=["']([^"']*)["'][^>]*>/i)?.[1])||"";
 const ogImage=(html.match(/<meta\b[^>]*property=["']og:image["'][^>]*content=["']([^"']*)["'][^>]*>/i)?.[1])||"";
 const hs=all(html,"h1"),h2=all(html,"h2");
 const imgs=[...html.matchAll(/<img\b[^>]*>/gi)].map(x=>x[0]);
 const missingAlt=imgs.filter(x=>!/\balt=["'][^"']*["']/i.test(x)).length;
 const as=links(html,url),host=new URL(url).hostname;
 const internal=as.filter(x=>{try{return new URL(x.url).hostname===host}catch{return false}}).length;
 const external=as.length-internal,text=strip(html),words=text?text.split(/\s+/).length:0;
 const schema=/application\/ld\+json/i.test(html),viewport=/<meta\b[^>]*name=["']viewport["']/i.test(html),lang=/<html\b[^>]*lang=["'][^"']+["']/i.test(html),https=new URL(url).protocol==="https:";
 const checks=[
  {label:"HTTPS",pass:https},{label:"Title length",pass:!!title&&title.length>=20&&title.length<=65},
  {label:"Meta description",pass:metaDesc.length>=70&&metaDesc.length<=170},{label:"Exactly one H1",pass:hs.length===1},
  {label:"Canonical URL",pass:!!canonical},{label:"Robots not blocking",pass:!/(noindex|none)/i.test(robots)},
  {label:"Open Graph title",pass:!!ogTitle},{label:"Open Graph image",pass:!!ogImage},{label:"Structured data",pass:schema},
  {label:"Mobile viewport",pass:viewport},{label:"HTML language",pass:lang},{label:"Image alt attributes",pass:missingAlt===0}
 ];
 const issues=[];const add=(severity,title,message)=>issues.push({severity,title,message});
 if(!title)add("critical","Missing title","No <title> was detected.");else if(title.length<20||title.length>65)add("high","Title length","The title is outside a practical snippet range. Rewrite it around the page intent without keyword stuffing.");
 if(!metaDesc)add("high","Missing meta description","No usable meta description was detected.");else if(metaDesc.length<70||metaDesc.length>170)add("medium","Meta description length","The description is unusually short or long; rewrite it to accurately summarize the page.");
 if(hs.length===0)add("high","Missing H1","No H1 was detected. Add one clear primary heading.");else if(hs.length>1)add("medium","Multiple H1s","More than one H1 was detected. Verify the document outline and page intent.");
 if(!canonical)add("medium","Missing canonical","No canonical link was detected. Add one where canonicalization is relevant.");
 if(/noindex|none/i.test(robots))add("critical","Indexing directive","The page appears to contain a noindex/none directive. Verify this is intentional.");
 if(!schema)add("medium","Structured data","No JSON-LD structured data was detected. Add only schema types the page genuinely qualifies for.");
 if(!ogTitle||!ogImage)add("low","Social sharing metadata","Open Graph title and/or image is missing.");
 if(missingAlt>0)add("medium","Image alt text",missingAlt+" image(s) appear to lack alt attributes. Add accurate descriptions; do not stuff keywords.");
 if(!viewport)add("high","Mobile viewport","No viewport meta tag was detected.");
 if(!lang)add("low","HTML language","No HTML lang attribute was detected.");
 if(words<150)add("medium","Thin visible text","The public HTML contains relatively little extractable text. Verify the page fully satisfies search intent.");
 const score=Math.round(checks.filter(x=>x.pass).length/checks.length*100);
 return {url,score,summary:"This is a deterministic public-page diagnostic, not a Google ranking score.",technology:techDetect(html,headers),metrics:{title_length:title.length,word_count:words,internal_links:internal,external_links:external,images:imgs.length,missing_alt:missingAlt,h1_count:hs.length,canonical:!!canonical,schema,https},metadata:{title,meta_description:metaDesc,canonical,robots,og_title:ogTitle,og_image,h1:hs[0]||"",h1_count:hs.length,h2:h2.slice(0,20),language:lang,schema,viewport},checks,issues,recommendations:["Fix critical/high issues first, then re-crawl.","Align title, H1, visible content and internal links with one clear search intent.","Use structured data only when the page genuinely qualifies.","Improve relevant internal linking and keep important content crawlable.","Connect Search Console separately for real queries, indexing and performance data."]};
}
async function gemini(env,prompt){if(!env.GEMINI_API_KEY)throw Error("GEMINI_API_KEY is not configured on the Worker.");const r=await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",{method:"POST",headers:{"Content-Type":"application/json","x-goog-api-key":env.GEMINI_API_KEY},body:JSON.stringify({contents:[{role:"user",parts:[{text:prompt}]}],generationConfig:{responseMimeType:"application/json",temperature:.2,maxOutputTokens:5000}})});const d=await r.json();if(!r.ok)throw Error(d?.error?.message||"Gemini request failed");return d?.candidates?.[0]?.content?.parts?.map(x=>x.text||"").join("")||"{}"}
async function body(req){try{return await req.json()}catch{return null}}
export default {async fetch(req,env){const origin=req.headers.get("Origin")||"*";if(req.method==="OPTIONS")return new Response(null,{status:204,headers:{...HEAD,"Access-Control-Allow-Origin":origin}});if(req.method!=="POST")return json({error:"POST required"},405,origin);try{const path=new URL(req.url).pathname,b=await body(req);
 if(path==="/audit"){if(!b?.url)throw Error("Website URL is required.");let target;try{target=new URL(b.url)}catch{throw Error("Invalid URL.")}if(!/^https?:$/.test(target.protocol))throw Error("Only HTTP/HTTPS URLs are supported.");const r=await fetch(target.href,{redirect:"follow",headers:{"User-Agent":"ZyvenSEO-AuditBot/1.0"}});if(!r.ok)throw Error("Target website returned HTTP "+r.status+".");const html=(await r.text()).slice(0,MAX_HTML),result=audit(html,r.url||target.href,r.headers);result.fetched_status=r.status;result.final_url=r.url||target.href;result.content_truncated=html.length>=MAX_HTML;return json(result,200,origin)}
 if(path==="/ai"){if(!b?.audit)throw Error("Audit data is required.");const prompt="You are a senior technical SEO consultant. Based ONLY on this observable audit JSON, create a practical optimization plan. Never promise rankings, traffic, search volume, trends, or private Google signals. Separate safe changes from owner-review changes. Return JSON keys: executive_summary, priority_fixes, technical_fixes, on_page_fixes, content_strategy, internal_linking, structured_data, performance_actions, measurement_plan, do_not_do. Search Console and analytics require separate authorization.\\nAUDIT JSON:\\n"+JSON.stringify(b.audit);return json({plan:await gemini(env,prompt)},200,origin)}
 return json({error:"Use /audit or /ai"},404,origin);
 }catch(e){return json({error:e?.message||"Request failed"},500,origin)}}};