import { tunnelConnectTimeoutMs, tunnelCooldownSeconds, tunnelMap, tunnelRaceWidth } from "./config";
import { text } from "./responses";
import type { Env, TunnelTarget } from "./types";

interface TargetHealth { failures: number; retryAt: number; lastSuccess: number }
const targetHealth = new Map<string, TargetHealth>();

function key(target: TunnelTarget): string { return `${target.origin}${target.path}`; }
function health(target: TunnelTarget): TargetHealth { return targetHealth.get(key(target)) || { failures: 0, retryAt: 0, lastSuccess: 0 }; }
function markSuccess(target: TunnelTarget): void { targetHealth.set(key(target), { failures: 0, retryAt: 0, lastSuccess: Date.now() }); }
function markFailure(target: TunnelTarget, cooldownSeconds: number): void {
  const previous = health(target), failures = previous.failures + 1;
  targetHealth.set(key(target), { failures, lastSuccess: previous.lastSuccess, retryAt: failures >= 2 ? Date.now() + cooldownSeconds * 1000 : 0 });
}

export function orderedTargets(targets: TunnelTarget[], now = Date.now()): TunnelTarget[] {
  return [...targets].sort((left, right) => {
    const a = health(left), b = health(right);
    return Number(a.retryAt > now) - Number(b.retryAt > now)
      || (left.priority ?? 100) - (right.priority ?? 100)
      || b.lastSuccess - a.lastSuccess
      || a.failures - b.failures;
  });
}

async function connect(request: Request, target: TunnelTarget, signal: AbortSignal): Promise<Response | null> {
  try {
    const headers = new Headers(request.headers);
    for (const name of ["cf-connecting-ip", "cf-ray", "x-forwarded-for"]) headers.delete(name);
    const response = await fetch(new URL(target.path, target.origin), { method: "GET", headers, signal });
    return response.status === 101 ? response : null;
  } catch { return null; }
}

async function race(request: Request, targets: TunnelTarget[], timeoutMs: number, cooldownSeconds: number): Promise<Response | null> {
  const controllers = targets.map(() => new AbortController());
  return new Promise(resolve => {
    let remaining = targets.length, settled = false;
    const finish = (response: Response | null, winner = -1): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      controllers.forEach((controller, index) => { if (index !== winner) controller.abort(); });
      resolve(response);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    targets.forEach((target, index) => {
      void connect(request, target, controllers[index]!.signal).then(response => {
        if (settled) return;
        if (response) { markSuccess(target); finish(response, index); return; }
        markFailure(target, cooldownSeconds);
        remaining -= 1;
        if (!remaining) finish(null);
      });
    });
  });
}

export async function tunnel(request: Request, env: Env, pathname: string): Promise<Response> {
  if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") return text("Upgrade required", 426, { upgrade: "websocket" });
  const targets = orderedTargets(tunnelMap(env)[pathname] || []);
  const width = tunnelRaceWidth(env), timeout = tunnelConnectTimeoutMs(env), cooldown = tunnelCooldownSeconds(env);
  for (let index = 0; index < targets.length; index += width) {
    const response = await race(request, targets.slice(index, index + width), timeout, cooldown);
    if (response) return response;
  }
  return text("Tunnel unavailable", 503, { "retry-after": "5" });
}
