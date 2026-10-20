// 資料庫錯誤對應：把 Postgres／PostgREST 錯誤轉成可直接顯示的 UserError。
// 本檔不依賴 next 或 supabase，方便單元測試。

/** 可預期的、可直接顯示給使用者的錯誤。 */
export class UserError extends Error {
  constructor(
    message: string,
    public readonly fieldErrors?: Record<string, string>,
  ) {
    super(message);
    this.name = "UserError";
  }
}

export interface PgErrorLike {
  code?: string;
  message?: string;
  hint?: string | null;
}

/** 呼叫端可覆寫的訊息。 */
export interface DbErrorMessages {
  /** 23505 唯一鍵衝突 */
  duplicate?: string;
  /** 23503 仍被使用 */
  inUse?: string;
  /** P0002 找不到 */
  notFound?: string;
  /** 22023 輸入不合法（沒有對到 hint 時） */
  invalid?: string;
  /** 42501 沒有權限 */
  forbidden?: string;
  /** 22023 依資料庫函式的 HINT 對應（例如 last_editor） */
  byHint?: Record<string, string>;
}

/** 未知錯誤：不帶入原始內容，只留錯誤碼供除錯。 */
function unknownError(error: PgErrorLike): never {
  throw new Error(`資料庫操作失敗（${error.code ?? "unknown"}）`);
}

/** 一般資料表操作的錯誤：23505、23503、42501 轉成友善訊息，其餘不外洩內容。 */
export function throwDbError(error: PgErrorLike, messages: DbErrorMessages = {}): never {
  if (error.code === "23505") throw new UserError(messages.duplicate ?? "資料已存在");
  if (error.code === "23503") throw new UserError(messages.inUse ?? "資料仍被使用，無法刪除");
  if (error.code === "42501") throw new UserError(messages.forbidden ?? "沒有權限");
  return unknownError(error);
}

/**
 * rpc（資料庫函式）的錯誤，單一對應器：
 * - 23503、P0002、22023：函式自己的訊息就是給使用者看的，除非呼叫端有覆寫；
 *   22023 先依 HINT（byHint）對應，再用 invalid 覆寫，最後才用函式訊息。
 * - 42501、23505：同 throwDbError，可覆寫。
 */
export function throwRpcError(error: PgErrorLike, messages: DbErrorMessages = {}): never {
  switch (error.code) {
    case "22023": {
      const byHint = error.hint ? messages.byHint?.[error.hint] : undefined;
      const message = byHint ?? messages.invalid ?? error.message;
      if (message) throw new UserError(message);
      break;
    }
    case "23503": {
      const message = messages.inUse ?? error.message;
      if (message) throw new UserError(message);
      break;
    }
    case "P0002": {
      const message = messages.notFound ?? error.message;
      if (message) throw new UserError(message);
      break;
    }
  }
  return throwDbError(error, messages);
}

/** 更新或刪除時沒有命中任何列：不存在，或被 RLS 擋下。 */
export function assertAffected(rows: unknown[] | null): void {
  if (!rows || rows.length === 0) throw new UserError("找不到資料，或沒有權限");
}
