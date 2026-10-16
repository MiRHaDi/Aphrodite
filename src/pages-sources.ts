import { json } from "./responses";
import type { Env } from "./types";

export interface PagesSource {
  id: string;
  url: string;
  enabled: boolean;
  label?: string;
}

const defaults: PagesSource[] = Array.from({ length: 6 }, (_, index) => ({
  id: `p${index + 1}`,
  url: `https://p${index + 1}.pages.dev/`,
  enabled: true,
  label: `Pages ${index + 1}`,
}));

export function pagesSources(env: Env): PagesSource[] {
  if (!env.PAGES_SOURCES_JSON) return defaults;
  try {
    const parsed = JSON.parse(env.PAGES_SOURCES_JSON) as unknown;
    if (!Array.isArray(parsed)) return defaults;
    const safe = parsed.filter((item): item is PagesSource => {
      if (!item || typeof item !== "object") return false;
      const value = item as Partial<PagesSource>;
      if (!/^p[1-6]$/.test(value.id || "") || typeof value.url !== "string") return false;
      try {
        const url = new URL(value.url);
        return url.protocol === "https:" && /^p[1-6]\.pages\.dev$/.test(url.hostname) && url.pathname === "/";
      } catch { return false; }
    });
    return safe.length === 6 ? safe : defaults;
  } catch { return defaults; }
}

async function probe(source: PagesSource) {
  const started = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4500);
  try {
    const response = await fetch(source.url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: { "user-agent": "Aphrodite-Pages-Monitor/1.0", accept: "text/html,*/*;q=0.1" },
    });
    const sample = (await response.text()).slice(0, 8192);
    const title = /<title[^>]*>([^<]{0,160})<\/title>/i.exec(sample)?.[1]?.trim() || null;
    return {
      ...source,
      ok: response.ok,
      status: response.status,
      latencyMs: Date.now() - started,
      contentType: response.headers.get("content-type"),
      title,
      usable: source.enabled && response.ok,
    };
  } catch (error) {
    return { ...source, ok: false, status: 0, latencyMs: Date.now() - started, contentType: null, title: null, usable: false, error: error instanceof Error ? error.name : "probe_failed" };
  } finally { clearTimeout(timeout); }
}

export async function pagesStatus(env: Env): Promise<Response> {
  const sources = pagesSources(env);
  const results = await Promise.all(sources.map(probe));
  return json({
    sources: results,
    healthy: results.filter(item => item.usable).length,
    checkedAt: new Date().toISOString(),
    note: "Only healthy deployments are marked usable; static Pages are not treated as tunnel origins.",
  }, 200, { "cache-control": "no-store" });
}
