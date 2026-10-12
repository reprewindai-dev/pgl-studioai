<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/0d539274-86cf-4bb5-9d92-8e95480414c1

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

To work against a local Genome Ledger, run gnomledger on port 8001 and set
`PGL_BACKEND_URL=http://127.0.0.1:8001` (the default). `npm run dev` forwards `/api/v1`,
`/health` and `/.well-known/*` to it.

## Deploy on Vercel

Studio's server routes live in `lib/studioServer.ts`. `api/index.ts` runs them as one Vercel
Function, and `vercel.json` routes `/api/v1/*`, `/health`, `/.well-known/pgl-signing-key`,
`/.well-known/x402.json`, `/api/chat`, `/api/analyze-genome` and `/api/health` to it. The UI is
the static Vite build.

Set these in the Vercel project (Settings → Environment Variables):

| Variable | Value |
|---|---|
| `PGL_BACKEND_URL` | The Genome Ledger API, e.g. `https://pgl.veklom.com` |
| `PGL_STUDIO_API_KEY` | A key issued to Studio on the gnomledger account (see gnomledger `docs/vercel-deploy.md`) |
| `GEMINI_API_KEY` | Optional: the "analyze genome" and chat helpers |

Leave `VITE_PGL_BOOTSTRAP_TOKEN` unset in deployed environments. It is compiled into the
browser bundle and only works against an empty local database.

Studio has no login: whoever can open it acts with `PGL_STUDIO_API_KEY`. Protect the
deployment (Vercel Deployment Protection, or Cloudflare Access in front of the domain).
