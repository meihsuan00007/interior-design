// 伺服器啟動時驗證環境變數；缺少或格式錯誤的金鑰會讓伺服器拒絕啟動。
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { getServerEnv } = await import("@/lib/env");
    getServerEnv();
  }
}
