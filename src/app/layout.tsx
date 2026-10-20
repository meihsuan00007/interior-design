import type { Metadata } from "next";
import { Noto_Sans_TC, Geist_Mono } from "next/font/google";
import "./globals.css";

// 內文字型：Noto Sans TC；變數名稱對應 globals.css 的 --font-sans
const notoSansTC = Noto_Sans_TC({
  variable: "--font-sans",
  weight: ["400", "500", "700"],
  display: "swap",
  // 中文字型沒有可預先載入的子集（只有 latin 等），必須關閉 preload
  preload: false,
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "室內設計報價管理系統",
  description: "室內設計報價與成本管理系統",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-Hant-TW">
      <body
        className={`${notoSansTC.variable} ${geistMono.variable} font-sans antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
