const MAX_HTML=2000000;
const MAX_LINKS=120;
const MAX_REDIRECTS=5;
const HEAD={"Access-Control-Allow-Methods":"POST,OPTIONS","Access-Control-Allow-Headers":"Content-Type","Cache-Control":"no-store"};

const json=(d,s=200,o="*")=>new Response(JSON.stringify(d),{status:s,headers:{"Content-Type":"application/json",...HEAD,"Access-Control-Allow-Origin":o}});
const strip=s=>String(s||"").replace(/<script[\s\S]*?<\/script>/gi," ").replace(/<style[\s\S]*?<\/style>/gi," ").replace(/<noscript[\s\S]*?<\/noscript>/gi," ").replace(/<[^>]+>/g," ").replace(/&nbsp;/gi," ").replace(/&amp;/gi,"&").replace(/&lt;/gi,"<").replace(/&gt;/gi,">").replace(/\s+/g," ").trim();
const all=(html,tag)=>{const re=new RegExp("<"+tag+"\\b[^>]*>([\s\S]*?)</"+tag+">","gi"),a=[];let m;while((m=re.exec(html))&&a.length<100)a.push(strip(m[1]));return a};
const attr=(tag,name)=>{const m=String(tag||"").match(new RegExp("\\b"+name+"=[\\"']([^\\"']*)[\\"']","i"));return m?.[1]||""};
function links(html,base){const re=/<a\b[^>]*href=[\"']([^\"']+)[\"'][^>]*>/gi,a=[];let m;const b=new URL(base);while((m=re.exec(html))&&a.length<MAX_LINKS){try{const u=new URL(m[1],b);if(/^https?:$/.test(u.protocol))a.push({url:u.href,text:""})}catch{}}return a}
function techDetect(html,headers){
 const h=html.toLowerCase(),server=(headers.get("server")||"").toLowerCase(),t=[];
 const tests=[["Next.js",/_next\//],["React",/data-reactroot|react(?:\.production)?(?:\.min)?\.js/],["WordPress",/wp-content|wordpress/],["Shopify",/shopify|cdn\.shopify/],["Wix",/wixstatic|wix\.com/],["Webflow",/webflow/],["Bolt",/bolt\.new/],["Firebase",/firebaseapp\.com|firebaseio\.com/],["Vercel",/vercel\.com/]];
 for(const [n,re] of tests)if(re.test(h))t.push(n);
 if(/cloudflare/.test(server))t.push("Cloudflare");
 return [...new Set(t.length?t:["HTML / JavaScript or unknown stack"])]
}
function safeTarget(raw){
 const u=new URL(raw);
 if(!/^https?:$/.test(u.protocol))throw Error("Only HTTP/HTTPS URLs are supported.");
 const h=u.hostname.toLowerCase();
 if(h==="localhost"||h.endsWith(".localhost")||h==="0.0.0.0"||h==="127.0.0.1"||h==="::1"||h.endsWith(".local")||h.endsWith(".internal"))throw Error("Private/local hosts are not allowed.");
 if(/^(10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(h))throw Error("Private network addresses are not allowed.");
 return u;
}
async function fetchPublic(raw){
 let u=safeTarget(raw),res;
 for(let i=0;i<=MAX_REDIRECTS;i++){
   res=await fetch(u.href,{redirect:"manual",headers:{"User-Agent":"ZyvenSEO-AuditBot/2.0"}});
   if([301,302,303,307,308].includes(res.status)){
     const loc=res.headers.get("location"); if(!loc)break; u=safeTarget(new URL(loc,u.href).href); continue;
   }
   return {res,url:u.href};
 }
 throw Error("Too many redirects.");
}
async function fetchText(raw,max=500000){
 const {res,url}=await fetchPublic(raw);
 if(!res.ok)throw Error("Target returned HTTP "+res.status+".");
 const text=(await res.text()).slice(0,max);
 return {text,url,res};
}
async function audit(html,url,headers){
 const title=all(html,"title")[0]||"";
 const metaDesc=(html.match(/<meta\b[^>]*name=[\"']description[\"'][^>]*content=[\"']([^\"']*)[\"'][^>]*>/i)?.[1])||"";
 const canonical=(html.match(/<link\b[^>]*rel=[\"'][^\"']*canonical[^\"']*[\"'][^>]*href=[\"']([^\"']+)[\"'][^>]*>/i)?.[1])||"";
 const robots=(html.match(/<meta\b[^>]*name=[\"']robots[\"'][^>]*content=[\"']([^\"']*)[\"'][^>]*>/i)?.[1])||"";
 const ogTitle=(html.match(/<meta\b[^>]*property=[\"']og:title[\"'][^>]*content=[\"']([^\"']*)[\"'][^>]*>/i)?.[1])||"";
 const ogImage=(html.match(/<meta\b[^>]*property=[\"']og:image[\"'][^>]*content=[\"']([^\"']*)[\"'][^>]*>/i)?.[1])||"";
 const hs=all(html,"h1"),h2=all(html,"h2"),h3=all(html,"h3");
 const imgs=[...html.matchAll(/<img\b[^>]*>/gi)].map(x=>x[0]);
 const missingAlt=imgs.filter(x=>!/[\s]alt=[\"'][^\"']*[\"']/i.test(x)).length;
 const as=links(html,url),host=new URL(url).hostname;
 const internal=as.filter(x=>new URL(x.url).hostname===host).length;
 const external=as.length-internal,text=strip(html),words=text?text.split(/\s+/).length:0;
 const schemaBlocks=[...html.matchAll(/<script\b[^>]*type=[\"']application\/ld\+json[\"'][^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1].trim());
 let validSchema=0;const schemaTypes=[];
 for(const raw of schemaBlocks){try{const d=JSON.parse(raw);validSchema++;const arr=Array.isArray(d)?d:[d];for(const x of arr){if(x?.["@type"])schemaTypes.push(...(Array.isArray(x["@type"])?x["@type"]:[x["@type"]]))}}catch{}}
 const viewport=/<meta\b[^>]*name=[\"']viewport[\"']/i.test(html),lang=/<html\b[^>]*lang=[\"'][^\"']+[\"']/i.test(html),https=new URL(url).protocol==="https:";
 const ogDesc=/<meta\b[^>]*property=[\"']og:description[\"']/i.test(html),twitterCard=/<meta\b[^>]*name=[\"']twitter:card[\"']/i.test(html);
 const checks=[
  {label:"HTTPS",pass:https},{label:"Practical title",pass:!!title&&title.length>=20&&title.length<=65},
  {label:"Meta description",pass:metaDesc.length>=70&&metaDesc.length<=170},{label:"Exactly one H1",pass:hs.length===1},
  {label:"Canonical URL",pass:!!canonical},{label:"Robots not blocking",pass:!/(noindex|none)/i.test(robots)},
  {label:"Open Graph",pass:!!ogTitle&&!!ogImage},{label:"Valid JSON-LD",pass:schemaBlocks.length===0?false:validSchema===schemaBlocks.length},
  {label:"Mobile viewport",pass:viewport},{label:"HTML language",pass:lang},{label:"Image alt coverage",pass:missingAlt===0},
  {label:"Useful visible content",pass:words>=150},{label:"Social metadata",pass:ogDesc&&twitterCard}
 ];
 const issues=[],add=(severity,title,message,fixable=false,confidence="high")=>issues.push({severity,title,message,auto_fixable:fixable,confidence});
 if(!title)add("critical","Missing title","No <title> was detected.",true);
 else if(title.length<20||title.length>65)add("high","Title length","Title is outside a practical range; rewrite around the actual page intent.",true);
 if(!metaDesc)add("high","Missing meta description","No usable meta description was detected.",true);
 else if(metaDesc.length<70||metaDesc.length>170)add("medium","Meta description length","Rewrite the description to accurately summarize the page.",true);
 if(hs.length===0)add("high","Missing H1","Add one clear primary heading that matches the page topic.",true);
 else if(hs.length>1)add("medium","Multiple H1s","Review the heading hierarchy and keep one primary H1 where appropriate.",false);
 if(!canonical)add("medium","Missing canonical","Add a canonical URL when the page needs explicit canonicalization.",true);
 if(/noindex|none/i.test(robots))add("critical","Indexing directive","The page appears to contain a noindex/none directive; verify this is intentional.",false);
 if(schemaBlocks.length===0)add("medium","Structured data","No JSON-LD was detected. Add schema only when the page genuinely qualifies.",false);
 else if(validSchema!==schemaBlocks.length)add("high","Invalid JSON-LD","One or more JSON-LD blocks could not be parsed.",true);
 if(!ogTitle||!ogImage||!ogDesc||!twitterCard)add("low","Social metadata","Open Graph/Twitter sharing metadata is incomplete.",true);
 if(missingAlt>0)add("medium","Image alt text",missingAlt+" image(s) appear to lack alt attributes.",true);
 if(!viewport)add("high","Mobile viewport","No viewport meta tag was detected.",true);
 if(!lang)add("low","HTML language","No HTML lang attribute was detected.",true);
 if(words<150)add("medium","Thin extractable content","The public HTML contains relatively little extractable text; verify search intent is fully served.",false,"medium");
 const score=Math.round(checks.filter(x=>x.pass).length/checks.length*100);
 let robotsInfo={status:"not_checked"},sitemapInfo={status:"not_checked"};
 try{const rr=await fetchText(new URL("/robots.txt",url).href,200000);robotsInfo={status:"ok",http_status:rr.res.status,content:rr.text.slice(0,12000),sitemaps:[...rr.text.matchAll(/^\s*Sitemap:\s*(.+)\s*$/gim)].map(x=>x[1].trim())}}catch(e){robotsInfo={status:"unavailable",message:e.message}}
 try{const sr=await fetchText(new URL("/sitemap.xml",url).href,500000);sitemapInfo={status:"ok",http_status:sr.res.status,url:sr.url,is_xml:/<\?xml|<urlset|<sitemapindex/i.test(sr.text),url_count:(sr.text.match(/<loc>/gi)||[]).length}}catch(e){sitemapInfo={status:"unavailable",message:e.message}}
 return {url,score,summary:"Deterministic public-page diagnostic. This score is not a Google ranking score.",technology:techDetect(html,headers),metrics:{title_length:title.length,word_count:words,internal_links:internal,external_links:external,images:imgs.length,missing_alt:h3.length?missingAlt:missingAlt,h1_count:hs.length,h2_count:h2.length,h3_count:h3.length,canonical:!!canonical,schema_blocks:schemaBlocks.length,valid_schema_blocks:validSchema,https},metadata:{title,meta_description:metaDesc,canonical,robots,og_title:ogTitle,og_image,h1:hs[0]||"",h1_count:hs.length,h2:h2.slice(0,20),language:lang,schema_types:[...new Set(schemaTypes)],viewport,social:{og_description:ogDesc,twitter_card:twitterCard}},crawl:{robots:robotsInfo,sitemap:sitemapInfo,links:as.map(x=>x.url)},checks,issues,recommendations:["Fix critical/high issues first and re-audit.","Align title, H1, visible content and internal links with one clear search intent.","Use structured data only when the page genuinely qualifies.","Use Search Console/analytics only through explicit authorization.","Automatic source edits require an authorized GitHub/CMS connection."]};
}
async function gemini(env,prompt){
 if(!env.GEMINI_API_KEY)throw Error("GEMINI_API_KEY is not configured on the Worker.");
 const r=await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",{method:"POST",headers:{"Content-Type":"application/json","x-goog-api-key":env.GEMINI_API_KEY},body:JSON.stringify({contents:[{role:"user",parts:[{text:prompt}]}],generationConfig:{responseMimeType:"application/json",temperature:.2,maxOutputTokens:6000}})});
 const d=await r.json();if(!r.ok)throw Error(d?.error?.message||"Gemini request failed");return d?.candidates?.[0]?.content?.parts?.map(x=>x.text||"").join("")||"{}";
}
async function body(req){try{return await req.json()}catch{return null}}
export default {async fetch(req,env){
 const origin=req.headers.get("Origin")||"*";if(req.method==="OPTIONS")return new Response(null,{status:204,headers:{...HEAD,"Access-Control-Allow-Origin":origin}});
 if(req.method!=="POST")return json({error:"POST required"},405,origin);
 try{const path=new URL(req.url).pathname,b=await body(req);
  if(path==="/audit"){if(!b?.url)throw Error("Website URL is required.");const {res,url}=await fetchPublic(b.url);if(!res.ok)throw Error("Target website returned HTTP "+res.status+".");const html=(await res.text()).slice(0,MAX_HTML),result=await audit(html,url,res.headers);result.fetched_status=res.status;result.final_url=url;result.content_truncated=html.length>=MAX_HTML;return json(result,200,origin)}
  if(path==="/ai"){if(!b?.audit)throw Error("Audit data is required.");const prompt="You are ZyvenSEO AI, a senior technical SEO, on-page SEO, content strategy and ethical off-page SEO consultant. Based ONLY on the supplied observable audit JSON, return JSON with executive_summary, search_intelligence_report, priority_fixes, technical_fixes, on_page_fixes, content_strategy, internal_linking, structured_data, performance_actions, off_page_strategy, backlink_opportunities, digital_pr_strategy, outreach_plan, measurement_plan, safe_auto_fixes, manual_review_fixes, do_not_do. The search_intelligence_report must be ONE complete copyable paragraph. When Search Console data is supplied, use its actual query, impression, click, CTR and average-position rows as primary website-specific evidence and identify quick wins, low-CTR opportunities, high-impression queries and positions 5-30. Do not invent missing data. If Search Console data is absent, infer relevant search topics, likely intents, content gaps and keyword opportunities only from observable website evidence and clearly state that exact global search volume is unavailable unless an authorized keyword-data source is connected. Never invent search volume, rankings, traffic, competitors, trends, backlink counts, or private Google signals. Mark unavailable data explicitly. Off-page recommendations must be legitimate and actionable: no purchased/spam links, link farms, PBNs, automated comments, fake reviews, cloaking, hidden text, doorway pages, or artificial traffic. Prioritize relevance, authority, digital PR, useful assets, citations and relationship-based outreach. The goal is to improve real organic visibility, not manufacture ranking signals.\nAUDIT JSON:\n"+JSON.stringify(b.audit)+"\nSEARCH CONSOLE DATA (optional, user-authorized):\n"+JSON.stringify(b.search_console||null);return json({plan:await gemini(env,prompt)},200,origin)}
  return json({error:"Use /audit or /ai"},404,origin);
 }catch(e){return json({error:e?.message||"Request failed"},500,origin)}
}};