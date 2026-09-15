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

function json(data, status = 200, origin = '*') {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders(origin) },
  });
}

async function geminiJson(url, init, origin) {
  const r = await fetch(url, init);
  const text = await r.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!r.ok) {
    const message = data?.error?.message || data?.raw || `Gemini request failed (${r.status})`;
    throw new Error(message);
  }
  return data;
}

async function uploadStream(env, request, mime, filename) {
  const start = await geminiJson('https://generativelanguage.googleapis.com/upload/v1beta/files', {
    method: 'POST',
    headers: {
      'x-goog-api-key': env.GEMINI_API_KEY,
      'X-Goog-Upload-Protocol': 'resumable',
      'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Header-Content-Length': request.headers.get('content-length') || '0',
      'X-Goog-Upload-Header-Content-Type': mime,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ file: { display_name: filename || 'seo-upload' } }),
  });

  const uploadUrl = start?.['x-goog-upload-url'];
  if (!uploadUrl) throw new Error('Gemini did not return an upload URL.');

  const uploaded = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Content-Length': request.headers.get('content-length') || '0',
      'X-Goog-Upload-Offset': '0',
      'X-Goog-Upload-Command': 'upload, finalize',
    },
    body: request.body,
  });
  const uploadedText = await uploaded.text();
  let data;
  try { data = JSON.parse(uploadedText); } catch { data = null; }
  if (!uploaded.ok) throw new Error(data?.error?.message || uploadedText.slice(0, 700) || `Media upload failed (${uploaded.status})`);

  const name = data?.file?.name;
  const uri = data?.file?.uri;
  const returnedMime = data?.file?.mimeType || mime;
  if (!name || !uri) throw new Error('Gemini upload returned no file URI.');

  let state = data?.file?.state;
  for (let i = 0; i < 48 && state && state !== 'ACTIVE'; i++) {
    if (state === 'FAILED') throw new Error('Gemini could not process the uploaded media.');
    await new Promise(r => setTimeout(r, 2500));
    const status = await geminiJson(`https://generativelanguage.googleapis.com/v1beta/${name}`, {
      headers: { 'x-goog-api-key': env.GEMINI_API_KEY },
    });
    state = status?.state;
  }
  if (state && state !== 'ACTIVE') throw new Error('Media processing timed out.');
  return { uri, mime: returnedMime };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '*';
    if (!ALLOWED.has(request.method)) return json({ error: 'Method not allowed.' }, 405, origin);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });
    if (!env.GEMINI_API_KEY) return json({ error: 'Server is missing GEMINI_API_KEY.' }, 500, origin);

    const url = new URL(request.url);
    if (url.pathname !== '/analyze') return json({ error: 'Use POST /analyze.' }, 404, origin);

    try {
      const prompt = request.headers.get('X-SEO-Prompt') || '';
      const mime = request.headers.get('X-SEO-Mime') || request.headers.get('Content-Type') || 'text/plain';
      const filename = request.headers.get('X-SEO-Filename') || 'seo-upload';
      if (!prompt) return json({ error: 'Missing analysis prompt.' }, 400, origin);

      const parts = [{ text: prompt }];
      const hasBody = Number(request.headers.get('content-length') || '0') > 0 || request.body;
      if (hasBody) {
        if (mime.startsWith('text/')) {
          const text = await request.text();
          parts.push({ text: `Uploaded text source:\n${text.slice(0, 300000)}` });
        } else {
          const file = await uploadStream(env, request, mime, filename);
          parts.push({ file_data: { mime_type: file.mime, file_uri: file.uri } });
        }
      }

      const result = await geminiJson(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
        body: JSON.stringify({
          contents: [{ role: 'user', parts }],
          generationConfig: { responseMimeType: 'application/json', temperature: 0.45 },
        }),
      }, origin);

      const text = result?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '';
      if (!text) return json({ error: 'Gemini returned no analysis.' }, 502, origin);
      return json({ text }, 200, origin);
    } catch (error) {
      return json({ error: error?.message || 'Analysis failed.' }, 500, origin);
    }
  },
};
