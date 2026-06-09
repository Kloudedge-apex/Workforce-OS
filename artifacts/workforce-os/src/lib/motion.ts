import { useReducedMotion, type Variants, type Transition } from "framer-motion";

/**
 * Shared motion language for Workforce-OS.
 *
 * Timing is deliberately calm and editorial: short fades, small upward slides,
 * gentle springs. Every consumer must gate animation through
 * `useReducedMotionSafe()` so the whole app collapses to instant state when the
 * user has `prefers-reduced-motion: reduce`.
 */

const EASE_OUT: Transition["ease"] = [0.16, 1, 0.3, 1]; // editorial ease-out

/** Simple opacity fade. Use for overlays, tooltips, inline reveals. */
export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { duration: 0.24, ease: EASE_OUT },
  },
  exit: {
    opacity: 0,
    transition: { duration: 0.16, ease: EASE_OUT },
  },
};

/** Fade + small upward slide. The default page/section entrance. */
export const fadeSlideUp: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.32, ease: EASE_OUT },
  },
  exit: {
    opacity: 0,
    y: -8,
    transition: { duration: 0.2, ease: EASE_OUT },
  },
};

/** Parent container that staggers its children in. Pair with `staggerItem`. */
export const staggerContainer: Variants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.06,
      delayChildren: 0.04,
    },
  },
  exit: {},
};

/** Child of `staggerContainer`. Each item fades + slides up in sequence. */
export const staggerItem: Variants = {
  hidden: { opacity: 0, y: 10 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, ease: EASE_OUT },
  },
  exit: { opacity: 0, y: 6, transition: { duration: 0.18, ease: EASE_OUT } },
};

/** Card mount: fade + slight scale + slide. For KPI tiles, list cards. */
export const cardEnter: Variants = {
  hidden: { opacity: 0, y: 12, scale: 0.98 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.34, ease: EASE_OUT },
  },
  exit: { opacity: 0, scale: 0.98, transition: { duration: 0.18, ease: EASE_OUT } },
};

/** Hover lift used on interactive cards/buttons. Apply via `whileHover`. */
export const springHover: Variants = {
  rest: { y: 0, scale: 1 },
  hover: {
    y: -2,
    scale: 1.01,
    transition: { type: "spring", stiffness: 320, damping: 22, mass: 0.6 },
  },
  tap: { scale: 0.99, transition: { type: "spring", stiffness: 400, damping: 28 } },
};

/**
 * Returns `true` when motion should be suppressed (user prefers reduced motion).
 * Consumers should branch their `variants`/`animate` props on this so the app
 * renders the final state instantly with no transition.
 *
 * SSR-safe: framer's `useReducedMotion()` returns `null` before hydration, which
 * we coerce to `false` (animate by default) to avoid a flash of un-animated content.
 */
export function useReducedMotionSafe(): boolean {
  const prefersReduced = useReducedMotion();
  return prefersReduced === true;
}
