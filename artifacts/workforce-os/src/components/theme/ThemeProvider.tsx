import * as React from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";

type ThemeProviderProps = React.ComponentProps<typeof NextThemesProvider>;

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="light"
      // Interim: system-following is disabled until the route sweep makes dark
      // mode pixel-coherent, so a dark-OS visitor doesn't first-load into the
      // not-yet-coherent dark state. Re-enable (enableSystem) in §H once all
      // literal bg-paper-* surfaces are dark-aware. The toggle still switches
      // light<->dark explicitly.
      enableSystem={false}
      disableTransitionOnChange
      {...props}
    >
      {children}
    </NextThemesProvider>
  );
}
