/**
 * 判斷 Session 是否已閒置逾時。
 * lastActivityMs 為 null（尚無 cookie）時不算逾時，由 middleware 寫入第一筆活動時間。
 * 閒置時間恰為 idleMinutes 時仍視為未逾時，超過才算。
 */
export function isSessionIdle(
  lastActivityMs: number | null,
  nowMs: number,
  idleMinutes: number,
): boolean {
  if (lastActivityMs === null) return false;
  return nowMs - lastActivityMs > idleMinutes * 60_000;
}

export const LAST_ACTIVITY_COOKIE = "last_activity";

export const DEFAULT_IDLE_MINUTES = 120;
export const MAX_IDLE_MINUTES = 7 * 24 * 60;

/** 解析 SESSION_IDLE_MINUTES：正整數，上限 7 天；無法解析時用預設 120 分鐘。 */
export function parseIdleMinutes(raw: string | undefined): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_IDLE_MINUTES;
  return Math.min(Math.floor(n), MAX_IDLE_MINUTES);
}
