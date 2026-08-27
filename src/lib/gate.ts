const COOKIE_NAME = "pa_session";
const TOKEN_PREFIX = "plugin-agent-v1:";

export function gateCookieName(): string {
  return COOKIE_NAME;
}

/** The shared password that locks the app, or "" when the gate is off. */
export function gatePassword(): string {
  return (process.env.PLUGIN_AGENT_PASSWORD ?? "").trim();
}

export function gateEnabled(): boolean {
  return gatePassword().length > 0;
}

/** Cookie value for a password. Web Crypto so this also runs inside proxy.ts. */
export async function gateToken(password: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${TOKEN_PREFIX}${password}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function equalsConstantTime(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/** Only same-origin paths are allowed as a post-login destination. */
export function safeNextPath(value: string | null | undefined): string {
  if (!value) return "/";
  if (!value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}
