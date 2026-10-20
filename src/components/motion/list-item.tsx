"use client";

import { motion, useReducedMotion } from "framer-motion";
import { FADE_DURATION, staggerDelay } from "./stagger";

/** 列表項目依序出現（每筆間隔 30ms，只對前 20 筆）。偏好減少動態或超過 20 筆時直接顯示。 */
export function ListItem({
  as = "li",
  index,
  className,
  children,
}: {
  as?: "li" | "tr";
  index: number;
  className?: string;
  children: React.ReactNode;
}) {
  const reduce = useReducedMotion();
  const delay = staggerDelay(index);
  const Tag = as === "tr" ? motion.tr : motion.li;
  const Plain = as;
  if (reduce || delay === null) return <Plain className={className}>{children}</Plain>;
  return (
    <Tag
      className={className}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: FADE_DURATION, delay, ease: "easeOut" }}
    >
      {children}
    </Tag>
  );
}
