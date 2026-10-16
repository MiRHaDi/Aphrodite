# Optional stateless relay

This stateless relay is an optional backup origin. Set `PRIMARY_HOST`, `PRIMARY_PORT`, `BACKUP_HOST`, `BACKUP_PORT`, `UPSTREAM_SCHEME`, `UPSTREAM_HOST_HEADER`, and `PORT=8080` in your deployment environment. Use only endpoints you operate or have permission to use.

The HTTP service is suitable for HTTP/WebSocket traffic. Protocols requiring arbitrary TCP use a TCP endpoint and its assigned public host/port; they cannot be exposed by this Nginx HTTP template.
