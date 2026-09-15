export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  try {
    const body = req.body || {};
    const { prompt, fileData, mimeType } = body;
    if (!prompt) return res.status(400).json({ error: 'Missing prompt' });
    const key = process.env.GEMINI_API_KEY;
    if (!key) return res.status(500).json({ error: 'GEMINI_API_KEY is not configured on the server.' });

    const parts = [{ text: prompt }];
    if (fileData && mimeType) {
      parts.push({ inline_data: { mime_type: mimeType, data: fileData } });
    }

    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({ contents: [{ role: 'user', parts }] })
    });

    const data = await response.json();
    if (!response.ok) return res.status(response.status).json({ error: data?.error?.message || 'Gemini request failed.' });
    const text = data?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '';
    if (!text) return res.status(502).json({ error: 'Gemini returned no text.' });
    return res.status(200).json({ text });
  } catch (e) {
    return res.status(500).json({ error: e?.message || 'Server error.' });
  }
}
