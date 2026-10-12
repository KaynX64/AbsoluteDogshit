// desktop/src/components/SignaturePad.tsx
// Canvas pad for stylus / finger / mouse. Exports a TRIMMED, TRANSPARENT PNG.
// npm i signature_pad
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from 'react';
import SigPad from 'signature_pad';
import { T } from '../theme';

export interface SignaturePadHandle {
  clear: () => void;
  isEmpty: () => boolean;
  toPngBlob: () => Promise<Blob | null>;
}

const INK = '#0B1F3A';
const OUT_MAX_W = 600; // exported width cap (px)
const PAD = 8;         // transparent margin around the ink

const SignaturePad = forwardRef<SignaturePadHandle, { height?: number; onChange?: (empty: boolean) => void }>(
  ({ height = 220, onChange }, ref) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const padRef = useRef<SigPad | null>(null);

    const fit = useCallback(() => {
      const canvas = canvasRef.current;
      const pad = padRef.current;
      if (!canvas || !pad) return;
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      const data = pad.toData(); // keep strokes across tablet rotation / resize
      canvas.width = canvas.offsetWidth * ratio;
      canvas.height = canvas.offsetHeight * ratio;
      canvas.getContext('2d')!.scale(ratio, ratio);
      pad.clear();
      pad.fromData(data);
    }, []);

    useEffect(() => {
      const canvas = canvasRef.current!;
      const pad = new SigPad(canvas, {
        penColor: INK,
        minWidth: 0.8,
        maxWidth: 2.6,
        backgroundColor: 'rgba(0,0,0,0)', // transparent
      });
      pad.addEventListener('endStroke', () => onChange?.(pad.isEmpty()));
      padRef.current = pad;
      fit();
      window.addEventListener('resize', fit);
      return () => {
        window.removeEventListener('resize', fit);
        pad.off();
      };
    }, [fit, onChange]);

    useImperativeHandle(ref, () => ({
      clear: () => {
        padRef.current?.clear();
        onChange?.(true);
      },
      isEmpty: () => padRef.current?.isEmpty() ?? true,
      toPngBlob: async () => {
        const src = canvasRef.current;
        if (!src || padRef.current?.isEmpty()) return null;
        const ctx = src.getContext('2d')!;
        const { width: w, height: h } = src;
        const px = ctx.getImageData(0, 0, w, h).data;

        // Find the bounding box of non-transparent pixels.
        let x0 = w, y0 = h, x1 = 0, y1 = 0;
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            if (px[(y * w + x) * 4 + 3] > 8) {
              if (x < x0) x0 = x;
              if (x > x1) x1 = x;
              if (y < y0) y0 = y;
              if (y > y1) y1 = y;
            }
          }
        }
        if (x1 <= x0 || y1 <= y0) return null;

        const cropW = x1 - x0 + 1;
        const cropH = y1 - y0 + 1;
        const scale = Math.min(1, (OUT_MAX_W - PAD * 2) / cropW);
        const outW = Math.max(40, Math.round(cropW * scale) + PAD * 2);
        const outH = Math.max(20, Math.round(cropH * scale) + PAD * 2);

        const out = document.createElement('canvas');
        out.width = outW;
        out.height = outH;
        out.getContext('2d')!.drawImage(
          src, x0, y0, cropW, cropH, PAD, PAD, outW - PAD * 2, outH - PAD * 2
        );
        return new Promise((resolve) => out.toBlob(resolve, 'image/png'));
      },
    }));

    return (
      <div
        style={{
          position: 'relative',
          border: `1.5px dashed ${T.sage400}`,
          borderRadius: T.radius.md,
          background: T.surfaceMuted,
          height,
        }}
      >
        <canvas
          ref={canvasRef}
          style={{ width: '100%', height: '100%', touchAction: 'none', display: 'block' }}
        />
        <div
          style={{
            position: 'absolute', left: 24, right: 24, bottom: 36,
            borderBottom: `1px solid ${T.sage300}`, pointerEvents: 'none',
          }}
        />
        <span
          style={{
            position: 'absolute', left: 24, bottom: 14, fontSize: 11,
            color: T.textMuted, pointerEvents: 'none', letterSpacing: 1,
          }}
        >
          SIGN ABOVE THE LINE
        </span>
      </div>
    );
  }
);

export default SignaturePad;