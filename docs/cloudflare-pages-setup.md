# Cloudflare Pages Setup (UOGA HUNTS)

## Current reality
- This repo is a static site.
- No bundler output directory is required.
- You already use a Cloudflare Worker endpoint in config (`https://json.uoga.workers.dev`), which is separate from Cloudflare Pages hosting.

## Goal
Host the website on Cloudflare Pages with:
- production deploys from `main`
- preview deploys for feature branches
- no custom build complexity

## Recommended Pages project settings

### 1) Create project
1. Cloudflare Dashboard -> `Workers & Pages` -> `Create` -> `Pages` -> `Connect to Git`.
2. Select repo: `UTAHOGA/HUNTS`.
3. Framework preset: `None`.

### 2) Build + output settings
- Build command: *(leave empty)*
- Build output directory: `/` (repo root)
- Root directory: `/` (repo root)

Reason: this project serves static HTML/CSS/JS directly from the repository root.

### 3) Branch rules
- Production branch: `main`
- Preview branches: `*` (all non-main branches)

### 4) Environment variables
For this repo, avoid putting Google Maps keys into Pages env unless you refactor key loading.
Current key handling is client-side in `config.js`/`config.local.js`.

If you later move keys server-side:
- add env vars in Pages settings
- fetch/inject at runtime via Worker/Function

### 5) Custom domain (optional)
1. Add your domain in Pages -> `Custom domains`.
2. Point DNS to Cloudflare per on-screen instructions.
3. Confirm SSL mode is active and cert is issued.

## Validation checklist after first deploy
1. Open production URL and confirm map and data loads.
2. Push a test branch and confirm a preview URL is generated.
3. Verify hash routes work (example: `/#google-maps`).
4. Confirm static assets resolve (`style.css`, `app.js`, logos).
5. Confirm no mixed-content or CSP errors in browser console.

## Common pitfalls for this repo
- Do not set a build output directory like `dist` (none exists).
- Do not assume Worker endpoint means Pages is configured.
- Avoid committing local-only key overrides (`config.local.js` is gitignored, keep it that way).

## Suggested next hardening
1. Add `_headers` for security/cache policy.
2. Add `_redirects` only if you introduce path-based routes.
3. Add a tiny CI check to fail PRs if core static files are missing.

