import { Plug } from "lucide-react";
import { cn } from "@/lib/utils";

interface IntegrationLogoProps {
  provider: string;
  /** Pixel size. Default 28. */
  size?: number;
  className?: string;
}

/**
 * Real brand marks for connectable integrations. Brand-colored, simplified inline
 * SVGs (no external asset fetch). Unknown providers fall back to a neutral plug.
 */
export function IntegrationLogo({ provider, size = 28, className }: IntegrationLogoProps) {
  const common = {
    width: size,
    height: size,
    className: cn("shrink-0", className),
    xmlns: "http://www.w3.org/2000/svg",
    "aria-hidden": true as const,
  };

  switch (provider) {
    case "gmail":
      return (
        <svg viewBox="0 0 48 48" {...common}>
          <path fill="#fff" d="M40 6H8a4 4 0 0 0-4 4v28a4 4 0 0 0 4 4h32a4 4 0 0 0 4-4V10a4 4 0 0 0-4-4Z" />
          <path fill="#e53935" d="M8 42V14l16 12L40 14v28H8Z" opacity="0" />
          <path fill="#4caf50" d="M4 38V12.5L4 38a4 4 0 0 0 4 4h4V22L4 38Z" />
          <path fill="#1e88e5" d="M44 38V12.5L44 38a4 4 0 0 1-4 4h-4V22l8-9.5Z" />
          <path fill="#e53935" d="M12 42V22l12 9 12-9v20" opacity="0" />
          <path fill="#c62828" d="M4 12.5 24 27 44 12.5V10a4 4 0 0 0-4-4h-.6L24 18 8.6 6H8a4 4 0 0 0-4 4v2.5Z" />
          <path fill="#fbc02d" d="M12 42H8a4 4 0 0 1-4-4V12.5L12 18v24Z" />
          <path fill="#1565c0" d="M36 42h4a4 4 0 0 0 4-4V12.5L36 18v24Z" />
        </svg>
      );
    case "outlook":
      return (
        <svg viewBox="0 0 48 48" {...common}>
          <path fill="#1976d2" d="M28 13h16v22a2 2 0 0 1-2 2H28V13Z" />
          <path fill="#fff" d="M44 17H28v-4h16v4Zm0 6H28v-3h16v3Zm0 6H28v-3h16v3Zm0 5h-16v-2h16v2Z" opacity=".7" />
          <path fill="#0d47a1" d="M4 9 28 5v38L4 39V9Z" />
          <path fill="#fff" d="M16 17.5c-3.6 0-6 2.7-6 6.6s2.3 6.4 5.9 6.4 6-2.6 6-6.6-2.3-6.4-5.9-6.4Zm-.1 10.4c-1.9 0-3-1.6-3-3.9 0-2.4 1.2-3.9 3-3.9s3 1.5 3 3.8c0 2.5-1.1 4-3 4Z" />
        </svg>
      );
    case "linkedin":
      return (
        <svg viewBox="0 0 48 48" {...common}>
          <rect width="42" height="42" x="3" y="3" rx="6" fill="#0a66c2" />
          <path fill="#fff" d="M14.4 36V18.7H9.1V36h5.3ZM11.8 16.4a3.1 3.1 0 1 0 0-6.2 3.1 3.1 0 0 0 0 6.2ZM38.9 36v-9.5c0-5.1-2.7-7.4-6.4-7.4-3 0-4.3 1.6-5 2.8v-2.4h-5.3c.07 1.5 0 17.2 0 17.2h5.3v-9.6c0-.5 0-1 .15-1.3.4-1 1.3-2 2.8-2 2 0 2.8 1.5 2.8 3.7V36h5.4Z" />
        </svg>
      );
    case "hubspot":
      return (
        <svg viewBox="0 0 48 48" {...common}>
          <path fill="#ff7a59" d="M33 18.6v-4.4a3.4 3.4 0 1 0-3.3 0v4.4a9.6 9.6 0 0 0-4.6 2l-12-9.4a3.8 3.8 0 1 0-1.8 2.4l11.8 9.2a9.5 9.5 0 0 0 .1 10.8l-3.6 3.6a3.1 3.1 0 1 0 1.7 1.8l3.6-3.6a9.6 9.6 0 1 0 8.1-16.8Zm-2.5 14.4a4.9 4.9 0 1 1 0-9.8 4.9 4.9 0 0 1 0 9.8Z" />
        </svg>
      );
    case "salesforce":
      return (
        <svg viewBox="0 0 48 32" {...common}>
          <path fill="#00a1e0" d="M20 7a7 7 0 0 1 11.6-2.4A8.4 8.4 0 0 1 44 12.6a7.6 7.6 0 0 1-3 14.6 7 7 0 0 1-1.4-.1 7.7 7.7 0 0 1-13.4 1.4 8.7 8.7 0 0 1-3.7.8 8.8 8.8 0 0 1-3.9-.9A8.9 8.9 0 1 1 9.6 12a8.7 8.7 0 0 1 1.7.2A7 7 0 0 1 20 7Z" />
        </svg>
      );
    case "slack":
      return (
        <svg viewBox="0 0 48 48" {...common}>
          <path fill="#36c5f0" d="M19 6a3.5 3.5 0 1 0 0 7h3.5V9.5A3.5 3.5 0 0 0 19 6Z" />
          <path fill="#2eb67d" d="M42 19a3.5 3.5 0 1 0-7 0v3.5h3.5A3.5 3.5 0 0 0 42 19Z" />
          <path fill="#ecb22e" d="M29 42a3.5 3.5 0 1 0 0-7h-3.5v3.5A3.5 3.5 0 0 0 29 42Z" />
          <path fill="#e01e5a" d="M6 29a3.5 3.5 0 1 0 7 0v-3.5H9.5A3.5 3.5 0 0 0 6 29Z" />
          <path fill="#36c5f0" d="M16 19a3.5 3.5 0 0 1 3.5-3.5H29a3.5 3.5 0 0 1 0 7h-9.5A3.5 3.5 0 0 1 16 19Z" opacity="0" />
          <path fill="#2eb67d" d="M22.5 16a3.5 3.5 0 0 1 7 0v9.5a3.5 3.5 0 0 1-7 0V16Z" />
          <path fill="#ecb22e" d="M32 29.5a3.5 3.5 0 0 1-3.5 3.5H19a3.5 3.5 0 0 1 0-7h9.5a3.5 3.5 0 0 1 3.5 3.5Z" />
          <path fill="#e01e5a" d="M25.5 32a3.5 3.5 0 0 1-7 0v-9.5a3.5 3.5 0 0 1 7 0V32Z" />
        </svg>
      );
    default:
      return (
        <div
          className={cn(
            "flex items-center justify-center rounded-md bg-paper-200 text-ink-500",
            className
          )}
          style={{ width: size, height: size }}
          aria-hidden
        >
          <Plug style={{ width: size * 0.55, height: size * 0.55 }} />
        </div>
      );
  }
}
