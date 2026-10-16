# Cloudflare Pages deployment

Pages Functions can run the same Aphrodite request handler. Create a Pages project from this repository, use `public` as the output directory, and leave the build command empty. Then add the D1 binding named `DB`, the plain variables from `wrangler.pages.toml.example`, and encrypted secrets `ADMIN_TOKEN` plus either `CONTROL_PLANE_TOKEN` or the control-plane username/password pair.

For CLI deployment:

```bash
cp wrangler.pages.toml.example wrangler.toml
npm ci
npm run db:migrate:remote
npx wrangler pages secret put ADMIN_TOKEN --project-name aphrodite-pages
npx wrangler pages secret put CONTROL_PLANE_TOKEN --project-name aphrodite-pages
npm run pages:deploy -- --project-name aphrodite-pages
```

The Pages adapter delegates every route to the tested Worker handler, so `/panel`, `/feed/:username`, `/healthz`, and the admin API have identical behavior. Cloudflare Pages and Workers have separate binding configuration even when they share the same D1 database.
