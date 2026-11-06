"use client";

import { motion, useReducedMotion } from "motion/react";

/**
 * Lives inside the app shell so only the content column animates on
 * navigation; the sidebar and frame persist. Opacity only, no movement.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <motion.div initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.12, ease: "easeOut" }} className="min-w-0">
      {children}
    </motion.div>
  );
}
