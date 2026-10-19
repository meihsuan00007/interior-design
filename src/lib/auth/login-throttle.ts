// 登入速率限制的判斷邏輯（純函式）。紀錄的讀寫在 login-throttle-db.ts。

export const THROTTLE_WINDOW_MS = 15 * 60_000;
export const MAX_EMAIL_FAILURES = 5;
export const MAX_IP_ATTEMPTS = 20;
export const THROTTLE_MESSAGE = "嘗試次數過多，請稍後再試";

export interface AttemptRecord {
  emailBidx: string;
  ipHash: string;
  succeeded: boolean;
  attemptedAtMs: number;
}

/** 同一 email 近 15 分鐘失敗 ≥5 次，或同一 IP 近 15 分鐘嘗試 ≥20 次即拒絕。 */
export function isThrottled(
  attempts: AttemptRecord[],
  key: { emailBidx: string; ipHash: string },
  nowMs: number,
): boolean {
  const since = nowMs - THROTTLE_WINDOW_MS;
  let emailFailures = 0;
  let ipAttempts = 0;
  for (const a of attempts) {
    if (a.attemptedAtMs < since) continue;
    if (a.emailBidx === key.emailBidx && !a.succeeded) emailFailures++;
    if (a.ipHash === key.ipHash) ipAttempts++;
  }
  return emailFailures >= MAX_EMAIL_FAILURES || ipAttempts >= MAX_IP_ATTEMPTS;
}
