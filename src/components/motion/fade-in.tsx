/** 內容淡入（150ms，CSS 動畫）。減少動態時 CSS 不套用動畫，結構與有動畫時完全相同。 */
export function FadeIn({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={["fade-in", className].filter(Boolean).join(" ")}>{children}</div>;
}
