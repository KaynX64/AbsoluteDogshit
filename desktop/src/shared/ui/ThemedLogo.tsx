// desktop/src/shared/ui/ThemedLogo.tsx
//
// Theme-aware brand mark. Renders the recolored logo variant for the
// active (preset × mode) — see ../theme/themedLogo.ts for the recolor
// engine. While a variant is being prepared (first render per theme)
// it keeps showing the previous image instead of flashing the original,
// and falls back to the untouched PNG on any engine failure.

import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { useTheme } from '../../theme/ThemeProvider';
import {
  getThemedLogoUrl,
  loadThemedLogo,
  originalLogoUrl,
} from '../../theme/themedLogo';

export interface ThemedLogoProps {
  alt?: string;
  className?: string;
  style?: CSSProperties;
}

export default function ThemedLogo({ alt = '', className, style }: ThemedLogoProps) {
  const { mode, preset } = useTheme();
  const [src, setSrc] = useState<string>(() => getThemedLogoUrl(preset, mode));

  useEffect(() => {
    let alive = true;
    const cached = getThemedLogoUrl(preset, mode);
    if (cached !== originalLogoUrl) {
      // Themed variant already cached — swap immediately.
      setSrc(cached);
    } else {
      // Keep the current image visible until the variant is ready.
      void loadThemedLogo(preset, mode).then((url) => {
        if (alive) setSrc(url);
      });
    }
    return () => { alive = false; };
  }, [preset, mode]);

  return <img src={src} alt={alt} className={className} style={style} draggable={false} />;
}
