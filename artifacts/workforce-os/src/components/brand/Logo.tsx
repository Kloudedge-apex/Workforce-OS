import { cn } from "@/lib/utils";

interface LogoProps {
  /** Pixel size of the square mark. Default 28. */
  size?: number;
  className?: string;
}

/**
 * Nikxius mark — a rust rounded-square app icon enclosing an "N" monogram stroke
 * drawn in paper white. Square, theme-stable, scales by `size`.
 */
export function Logo({ size = 28, className }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      role="img"
      aria-label="Nikxius"
      className={cn("shrink-0", className)}
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Rounded-square plate */}
      <rect
        width="32"
        height="32"
        rx="8"
        className="fill-rust-500"
      />
      {/* "N" monogram: up the left, diagonal down, up the right */}
      <path
        d="M9 23 V9 L23 23 V9"
        className="stroke-ink-0"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

interface WordmarkProps {
  /** Pixel size of the mark; the wordmark text scales with it. Default 28. */
  size?: number;
  className?: string;
}

/**
 * Nikxius wordmark — mark + "Nikxius" set in Lora (the app serif, `font-serif`).
 */
export function Wordmark({ size = 28, className }: WordmarkProps) {
  return (
    <div className={cn("flex items-center gap-2.5 min-w-0", className)}>
      <Logo size={size} />
      <span className="font-serif font-semibold tracking-tight text-ink-900 text-lg leading-none truncate">
        Nikxius
      </span>
    </div>
  );
}
