import path from "node:path";
import type { NextConfig } from "next";

// 使用者家目錄（C:\Users\User）另有 package-lock.json，Next.js 會誤判為專案根目錄，
// 導致 Turbopack 找不到 Client Manifest 的模組。明確指定為本專案資料夾。
const projectRoot = path.resolve(__dirname);

const nextConfig: NextConfig = {
  turbopack: { root: projectRoot },
  outputFileTracingRoot: projectRoot,
};

export default nextConfig;
