# ZyvenSEO AI — Universal Website SEO Optimizer

A platform-independent SEO auditing and optimization interface.

## What it supports

The URL audit does not depend on how a website was built. It can inspect public pages from sites built with or deployed through:

- Bolt.new
- Google AI Studio / Gemini-generated sites
- GitHub
- Vercel
- Firebase
- WordPress
- Shopify
- Wix
- Webflow
- React / Next.js
- Plain HTML/CSS/JavaScript
- Other public HTTP/HTTPS sites

The technology detector is heuristic. It reports what can be observed from the public response; it does not claim perfect framework detection.

## Features

- Deterministic public-page SEO audit
- HTTPS, title, meta description, H1, canonical, robots, Open Graph, JSON-LD, viewport and language checks
- Image alt attribute check
- Visible-text and internal/external-link metrics
- Basic technology detection
- Prioritized SEO issues
- Evidence-based optimization recommendations
- Optional Gemini optimization plan
- No fabricated rankings, search volume, traffic forecasts or “#1 guarantee”

## Architecture

- `index.html` — static dashboard, suitable for GitHub Pages
- `worker.js` — Cloudflare Worker API with `/audit` and optional `/ai`
- `wrangler.toml` — Worker configuration
- `api/gemini.js` — legacy Vercel endpoint retained for compatibility

## Deploy

### Frontend

Enable GitHub Pages for this repository and publish the branch/folder containing `index.html`.

### Backend

Deploy `worker.js` as a Cloudflare Worker. Put the Gemini key in a Worker secret named:

`GEMINI_API_KEY`

The browser never receives the Gemini key.

Then paste the Worker base URL into the dashboard, for example:

`https://YOUR-WORKER.YOUR-SUBDOMAIN.workers.dev`

The frontend calls:

- `POST /audit` for deterministic URL analysis
- `POST /ai` for the optional Gemini optimization plan

## Important limitation

A public URL can be audited, but it cannot legally or technically be used to silently modify another person's source code. Actual code changes require owner-authorized access such as GitHub, a CMS API, or another supported integration.

Likewise, this product cannot control Google's ranking systems or guarantee a #1 position. Search Console, analytics and authenticated repository access should be added as separate authorized integrations for deeper optimization workflows.

## Production hardening

Before opening the Worker as a public SaaS, add authentication, rate limiting, abuse protection, target-URL restrictions/SSRF protections, logging, quotas and billing controls.