/** 轉義 ilike 的萬用字元，避免使用者輸入 % 或 _ 時比對到所有資料。 */
export function escapeLike(q: string): string {
  return q.replace(/[\\%_]/g, (c) => `\\${c}`);
}
