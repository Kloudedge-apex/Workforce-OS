import type { ReactNode } from "react";
import { motion } from "framer-motion";
import {
  staggerContainer,
  staggerItem,
  useReducedMotionSafe,
} from "@/lib/motion";

interface StaggerProps {
  children: ReactNode;
  className?: string;
}

export function Stagger({ children, className }: StaggerProps) {
  const reduced = useReducedMotionSafe();

  if (reduced) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      className={className}
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
      exit="exit"
    >
      {children}
    </motion.div>
  );
}

interface StaggerItemProps {
  children: ReactNode;
  className?: string;
}

export function StaggerItem({ children, className }: StaggerItemProps) {
  const reduced = useReducedMotionSafe();

  if (reduced) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div className={className} variants={staggerItem}>
      {children}
    </motion.div>
  );
}
