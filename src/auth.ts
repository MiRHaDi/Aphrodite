import type { Env } from "./types";
import {validSession} from './admin-session';

async function digest(value: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}

export async function isAdmin(request: Request, env: Env): Promise<boolean> {
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  if (!supplied || !env.ADMIN_TOKEN) return false;
  if(supplied.startsWith('s1.')&&await validSession(supplied,env))return true;
  const [left, right] = await Promise.all([digest(supplied), digest(env.ADMIN_TOKEN)]);
  let difference = 0;
  for (let index = 0; index < left.length; index++) difference |= left[index]! ^ right[index]!;
  return difference === 0;
}
