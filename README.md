# SEO Studio AI

Multimodal AI SEO tool for YouTube Shorts, Instagram Reels, TikTok and Facebook Reels.

## Architecture

- `index.html` — frontend UI and source-aware SEO prompt
- `worker.js` — secure Cloudflare Worker backend
- `wrangler.toml` — Worker configuration
- `api/gemini.js` — legacy Vercel endpoint; the current frontend uses `worker.js`

The Gemini API key is kept server-side as the Cloudflare Worker secret `GEMINI_API_KEY`. It is not placed in the browser.

## Deploy the backend

1. Open Cloudflare Dashboard → Workers & Pages → Create → Worker.
2. Create a Worker named `ai-seo-tool-api`.
3. Replace the Worker code with the contents of `worker.js` from this repository and deploy.
4. Open Worker Settings → Variables and Secrets.
5. Add a secret named exactly `GEMINI_API_KEY` and paste your Gemini API key. Do not put the key in GitHub or `index.html`.
6. Deploy again if Cloudflare asks for a new deployment.
7. Copy the Worker URL. The website endpoint must end with `/analyze`, for example:
   `https://YOUR-WORKER.YOUR-SUBDOMAIN.workers.dev/analyze`
8. Open the SEO Studio website, paste that endpoint into **Secure AI connection**, and click **Analyze all 4 platforms**.

## Test order

Start with a small image or text file. Then test a short video. The Worker rejects uploads above 100 MB to stay within the Cloudflare Workers Free request-body limit.

## Security note

The current endpoint is suitable for personal testing. Before making the tool public as a SaaS, add authentication/rate limiting so other people cannot use your Worker to consume your Gemini quota.

## Frontend hosting

The static `index.html` can be hosted with GitHub Pages or another static host. The frontend and backend are separate: GitHub Pages serves the UI, while the Cloudflare Worker calls Gemini securely.
