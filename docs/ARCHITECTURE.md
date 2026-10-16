# Architecture

The Worker is split into five bounded modules: request routing (`index.ts`), subscription delivery and cache (`subscription.ts`), adaptive client routing (`routing.ts`), tunnel failover (`tunnel.ts`), and the protected control-plane adapter (`control-plane.ts`). The panel is a static shell served by the Worker and calls only same-origin protected APIs.

D1 stores route metadata and compact audit events. It never stores subscription bodies, passwords, or traffic logs. Cache API absorbs repeated subscription reads. Each public feed miss performs a single indexed D1 lookup and one successful origin request.

Origin failover is ordered and deterministic. Tunnel targets use bounded concurrent selection, health-based ordering, and cooldown. An optional stateless service can act as a backup HTTP/WebSocket origin; transports using raw TCP require a provider that exposes a TCP endpoint.

The adaptive client header contains explicit Iranian domain rules. It selects `direct` for those domains when Cloudflare identifies the subscriber request as originating in Iran, and `iran` for users outside Iran. The final rule sends other traffic to `proxy`. This design does not require client GeoIP or GeoSite databases.
