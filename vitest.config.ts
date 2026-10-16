import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
export default defineConfig({ test:{include:['test/**/*.test.ts','test/**/*.test.mjs']}, resolve: { alias: { 'cloudflare:sockets': fileURLToPath(new URL('./test/socket-stub.ts', import.meta.url)) } } });
