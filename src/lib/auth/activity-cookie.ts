// last_activity cookie 的簽章與驗證。值格式：<timestampMs>.<hex HMAC-SHA256>。
// middleware 跑在 Edge runtime，故只用 Web Crypto（crypto.subtle），不使用 Buffer。
// 簽章金鑰 = HMAC(BLIND_INDEX_KEY, "session-activity")；用以防止使用者自行刪除或竄改 cookie 來躲過閒置登出。

const LABEL = "session-activity";
/** 容許伺服器間的時鐘誤差 */
const FUTURE_SKEW_MS = 60_000;

const encoder = new TextEncoder();

function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

async function hmac(keyBytes: Uint8Array<ArrayBuffer>, message: string): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return crypto.subtle.sign("HMAC", key, encoder.encode(message));
}

async function signature(timestampMs: number, blindIndexKeyB64: string): Promise<string> {
  const derived = new Uint8Array(await hmac(base64ToBytes(blindIndexKeyB64), LABEL));
  return toHex(await hmac(derived, String(timestampMs)));
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function signActivity(timestampMs: number, blindIndexKeyB64: string): Promise<string> {
  return `${timestampMs}.${await signature(timestampMs, blindIndexKeyB64)}`;
}

/** 回傳通過驗證的時間戳；缺漏、格式錯誤、簽章不符或時間在未來皆回傳 null。 */
export async function verifyActivity(
  value: string | undefined,
  nowMs: number,
  blindIndexKeyB64: string,
): Promise<number | null> {
  if (!value) return null;
  const match = /^(\d{1,15})\.([0-9a-f]{64})$/.exec(value);
  if (!match) return null;
  const ts = Number(match[1]);
  if (!Number.isSafeInteger(ts) || ts > nowMs + FUTURE_SKEW_MS) return null;
  const expected = await signature(ts, blindIndexKeyB64);
  return constantTimeEqual(expected, match[2]) ? ts : null;
}
