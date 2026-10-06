export function generateFixes(audit){
 const fixes=[];
 const m=audit.metadata||{};
 if(!m.title)fixes.push({id:"title",type:"metadata",risk:"safe",description:"Add a descriptive page title.",target:"<title>",value:"[AI-GENERATED TITLE]"});
 if(!m.meta_description)fixes.push({id:"description",type:"metadata",risk:"safe",description:"Add an accurate meta description.",target:"meta[name=description]",value:"[AI-GENERATED DESCRIPTION]"});
 if((m.h1_count||0)===0)fixes.push({id:"h1",type:"content",risk:"review",description:"Add one primary H1 matching page intent.",target:"h1",value:"[AI-GENERATED H1]"});
 if(!m.canonical)fixes.push({id:"canonical",type:"technical",risk:"review",description:"Add a self-referencing canonical when appropriate.",target:"link[rel=canonical]",value:"[CURRENT_PAGE_URL]"});
 if(!m.viewport)fixes.push({id:"viewport",type:"metadata",risk:"safe",description:"Add a mobile viewport declaration.",target:"meta[name=viewport]",value:"width=device-width,initial-scale=1"});
 if(!m.language)fixes.push({id:"lang",type:"html",risk:"review",description:"Add the correct document language.",target:"html[lang]",value:"[TARGET_LANGUAGE]"});
 if((audit.metrics?.missing_alt||0)>0)fixes.push({id:"alt",type:"content",risk:"review",description:"Add accurate alt text to images; do not keyword-stuff.",target:"img[alt]",value:"[AI-GENERATED ALT TEXTS]"});
 return fixes;
}
