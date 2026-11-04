# ZyvenSEO AI — Universal Website SEO Optimizer

## Workflow
1. Paste a public website URL.
2. Run deterministic technical/on-page crawl diagnostics.
3. Review evidence, severity, confidence, and auto-fix candidates.
4. Generate an evidence-bound Gemini optimization plan.
5. Connect an authorized source repository/CMS to create safe changes.
6. Create a branch and show a diff before production changes.
7. Run build/lint/tests.
8. Re-audit the deployed URL and report what changed.

## Safety
A public URL can be audited but cannot authorize source-code modification. Source edits require explicit owner authorization. The product must never claim Google ranking control or fabricate Search Console, traffic, keyword-volume, competitor, or ranking data.

## Current engine
The Worker checks HTTPS, title, meta description, H1 structure, canonical, robots directives, Open Graph/Twitter metadata, JSON-LD syntax, viewport, language, image alt coverage, visible content, links, robots.txt, and sitemap.xml. It also blocks obvious localhost/private-network targets and limits redirects.

## Auto-fix policy
Only deterministic, low-risk changes may be marked safe. Content, canonical, schema, redirects, indexing directives, and framework-specific source edits require review unless the system has enough verified context to prove the change is safe.

## Architecture
- Frontend: static HTML/JS
- Backend: Cloudflare Worker
- AI: Gemini server-side secret
- Source control: GitHub authorization
- Optional future integrations: Search Console, PageSpeed Insights, CMS APIs, deployment providers
