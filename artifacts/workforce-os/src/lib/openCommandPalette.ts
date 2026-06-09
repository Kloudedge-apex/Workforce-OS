/**
 * Opens the global Command Palette by dispatching the same Cmd/Ctrl+K keydown
 * that CommandPalette listens for. Keeps the palette's open-state private while
 * letting any control (topbar Search, etc.) trigger it without prop drilling.
 */
export function openCommandPalette(): void {
  const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
  const event = new KeyboardEvent("keydown", {
    key: "k",
    code: "KeyK",
    metaKey: isMac,
    ctrlKey: !isMac,
    bubbles: true,
  });
  document.dispatchEvent(event);
}
