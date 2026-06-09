import { useEffect, useRef, useState } from "react";
import { animate, useMotionValue } from "framer-motion";
import { useReducedMotionSafe } from "@/lib/motion";

/**
 * Pure formatting helper — no React, no framer. Exported for unit testing.
 * Renders `value` with a fixed number of decimals and an optional suffix.
 */
export function formatValue(
  value: number,
  decimals = 0,
  suffix = "",
): string {
  const safe = Number.isFinite(value) ? value : 0;
  return `${safe.toFixed(decimals)}${suffix}`;
}

interface CountUpProps {
  value: number;
  decimals?: number;
  suffix?: string;
  /** Animation duration in seconds. */
  duration?: number;
  className?: string;
}

export function CountUp({
  value,
  decimals = 0,
  suffix = "",
  duration = 0.8,
  className,
}: CountUpProps) {
  const reduced = useReducedMotionSafe();
  const motionValue = useMotionValue(0);
  const [display, setDisplay] = useState<string>(
    formatValue(reduced ? value : 0, decimals, suffix),
  );
  const prev = useRef(0);

  useEffect(() => {
    if (reduced) {
      setDisplay(formatValue(value, decimals, suffix));
      prev.current = value;
      return;
    }

    const controls = animate(motionValue, value, {
      duration,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (latest) => {
        setDisplay(formatValue(latest, decimals, suffix));
      },
    });

    prev.current = value;
    return () => controls.stop();
    // motionValue is stable; intentionally not in deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, decimals, suffix, duration, reduced]);

  return (
    <span className={className} aria-label={formatValue(value, decimals, suffix)}>
      {display}
    </span>
  );
}
