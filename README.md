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

## Run in the Veklom Docker stack

Veklom runs on Docker Desktop behind a Cloudflare tunnel. Add Studio to the stack that runs
`gnomledger-api` (for example `veklom-capability-os-rc1`), on the same Docker network:

```yaml
  pgl-studio:
    build: ../pgl-studioai          # path to this repository
    restart: unless-stopped
    environment:
      PGL_BACKEND_URL: http://gnomledger-api:8001
      PGL_STUDIO_API_KEY: ${PGL_STUDIO_API_KEY}
      GEMINI_API_KEY: ${GEMINI_API_KEY:-}
```

The image runs `server.ts` on port 3000. It serves the UI and forwards `/api/v1/*`, `/health`
and `/.well-known/*` to Genome Ledger, adding `PGL_STUDIO_API_KEY` on the server so the key
never reaches the browser.

Issue Studio its own key once, with the Capability OS runtime key, so Studio's writes are
attributed to `pgl-studio`:

```sh
curl -X POST https://pgl.veklom.com/api/v1/admin/accounts/1/keys \
  -H "x-api-key: <PGL_LEDGER_API_KEY>" -H "content-type: application/json" \
  -d '{"name":"pgl-studio","role":"admin","scopes":["*"]}'
```

Publish it through the tunnel as a hostname pointing at `http://pgl-studio:3000`, and put
Cloudflare Access in front: Studio has no login, so whoever opens it acts with
`PGL_STUDIO_API_KEY`. Leave `VITE_PGL_BOOTSTRAP_TOKEN` unset in the stack; it is compiled into
the browser bundle and only works against an empty local database.

`api/index.ts` and `vercel.json` run the same server routes as a Vercel Function for the
existing Vercel preview project; they are not part of the Docker deployment.
