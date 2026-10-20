"use client";

import { motion, useReducedMotion } from "framer-motion";
import { FADE_DURATION } from "./stagger";

/** 內容淡入（150ms）。偏好減少動態時直接顯示，不做任何透明度或位移動畫。 */
export function FadeIn({ children, className }: { children: React.ReactNode; className?: string }) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: FADE_DURATION, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}
