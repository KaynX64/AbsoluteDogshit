// desktop/src/app/TitleBar.tsx
//
// App-drawn title strip for the desktop window.
//
// Windows never paints the system backdrop into a native caption, so when the
// main process asks for the custom title bar (Windows 11 22H2+) the caption
// is hidden and this strip takes its place:
//
//   • transparent background  → the acrylic backdrop (wallpaper tint, follows
//                               the system light/dark theme) shows through;
//   • -webkit-app-region:drag → dragging, double-click-to-maximize;
//   • Windows still paints minimize/maximize/close over the right-hand end,
//     which is why the text keeps clear of that area in CSS.
//
// When the native caption is used instead (older Windows), this renders
// nothing and --titlebar-h stays 0.

import { useEffect } from 'react';

export default function TitleBar() {
  const chrome = window.electronAPI?.windowChrome;

  useEffect(() => {
    if (!chrome?.customTitleBar || !window.electronAPI?.onFullScreenChange) return;
    return window.electronAPI.onFullScreenChange((isFullScreen) => {
      document.documentElement.dataset.titlebarFullscreen = isFullScreen ? 'true' : 'false';
    });
  }, [chrome?.customTitleBar]);

  if (!chrome?.customTitleBar) return null;

  return (
    <header className="app-titlebar" aria-hidden="true">
      <span className="app-titlebar-text">{chrome.title}</span>
    </header>
  );
}
