import { staggerDelay } from "./stagger";

/** 列表項目依序出現（每筆間隔 30ms，只對前 20 筆）。第 21 筆起不帶動畫。 */
export function ListItem({
  as = "li",
  index,
  className,
  children,
}: {
  as?: "li" | "tr";
  index: number;
  className?: string;
  children?: React.ReactNode;
}) {
  const delay = staggerDelay(index);
  const Tag = as;
  return (
    <Tag
      className={[delay === null ? "" : "fade-in", className].filter(Boolean).join(" ") || undefined}
      style={delay === null ? undefined : { animationDelay: `${delay}s` }}
    >
      {children}
    </Tag>
  );
}
