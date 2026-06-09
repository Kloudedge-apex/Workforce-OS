import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { fadeSlideUp, useReducedMotionSafe } from "@/lib/motion";

interface PageTransitionProps {
  children: ReactNode;
  /** Stable key so AnimatePresence can crossfade between routes. */
  transitionKey?: string;
  className?: string;
}

export function PageTransition({
  children,
  transitionKey,
  className,
}: PageTransitionProps) {
  const reduced = useReducedMotionSafe();

  if (reduced) {
    return (
      <div key={transitionKey} className={className}>
        {children}
      </div>
    );
  }

  return (
    <motion.div
      key={transitionKey}
      className={className}
      variants={fadeSlideUp}
      initial="hidden"
      animate="visible"
      exit="exit"
    >
      {children}
    </motion.div>
  );
}
