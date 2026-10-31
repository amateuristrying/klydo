# Klydo AI

Landing page for Klydo AI. Plain HTML, CSS and JS with no build step.

- `public/` is the site.
- `functions/api/signup.js` saves early access sign-ups to Cloudflare KV.

## Deploy to Cloudflare Pages

1. In Cloudflare, go to **Workers & Pages → Create → Pages → Connect to Git** and pick this repo.
2. Use these build settings:
   - Framework preset: **None**
   - Build command: leave empty
   - Build output directory: `public`
3. Deploy, then go to **Storage & Databases → KV** and create a namespace called `klydo-signups`.
4. In the Pages project, go to **Settings → Bindings → Add → KV namespace**. Set the variable name to `SIGNUPS` and pick `klydo-signups`. Add it for Production, and for Preview if you want sign-ups to work on preview links.
5. Retry the latest deployment so the binding takes effect.

Until step 5 is done, the form shows an error instead of saving.

If the site ends up on a different address from `klydo.pages.dev`, update the `og:url` and `og:image` tags in `public/index.html`.

## Read the sign-ups

Each sign-up is a KV entry keyed by email. Browse them in the dashboard under the `klydo-signups` namespace, or list them with:

```bash
npx wrangler kv key list --namespace-id <namespace id> --remote
```

## Run locally

```bash
npx wrangler pages dev public --kv SIGNUPS
```

Sign-ups only work through this command, and they stay in a local test store. A plain static server shows the page, but the form will show an error.
