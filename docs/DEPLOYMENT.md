# Production deployment

1. Provision an authorized compatible control plane and configure the inbound tags listed in `src/config.ts` (or change that list to match your installation).
2. Create a D1 database, copy `wrangler.toml.example` to the ignored `wrangler.toml`, and set its database ID.
3. Apply migrations with `npm run db:migrate:remote`.
4. Set `ADMIN_TOKEN` with at least 32 random bytes. Configure either `CONTROL_PLANE_TOKEN` or the username/password pair as Worker secrets.
5. Set `CONTROL_PLANE_ORIGIN`, optional `BACKUP_ORIGINS`, and `TUNNEL_ROUTES_JSON` in `wrangler.toml`.
6. Run `npm run check`, `npm test`, then `npm run deploy`.
7. Add a Worker custom domain in Cloudflare and verify `/healthz`, panel login, a test user, and every configured transport.

Keep old public feed hostnames attached during a migration. Since routes are addressed by username, the backend can change without changing each user's URL. Rotate the admin token after handover and review D1 audit events regularly.

For an optional backup relay, deploy `relay/` and supply its documented environment variables. Use health checks on `/healthz`. Do not put control-plane credentials in build arguments or container images.
