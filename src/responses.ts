export const securityHeaders = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
};

export function json(data: unknown, status = 200, headers: HeadersInit = {}): Response {
  return Response.json(data, { status, headers: { ...securityHeaders, "cache-control": "no-store", ...headers } });
}

export function text(body: string, status = 200, headers: HeadersInit = {}): Response {
  return new Response(body, { status, headers: { ...securityHeaders, "content-type": "text/plain; charset=utf-8", ...headers } });
}

export function error(message: string, status: number): Response {
  return json({ ok: false, error: message }, status);
}
