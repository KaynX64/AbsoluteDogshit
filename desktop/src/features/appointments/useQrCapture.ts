import { useEffect, useRef, type RefObject } from 'react';

const scanIntervalMs = 100;
const maxImageSide = 2048;

type Callbacks = {
  onCode: (code: string) => void;
  onActive: (active: boolean) => void;
  onError: (message: string) => void;
  onStatus: (message: string) => void;
};

export function useQrCapture(
  videoRef: RefObject<HTMLVideoElement | null>,
  canvasRef: RefObject<HTMLCanvasElement | null>,
  callbacks: Callbacks,
) {
  const current = useRef(callbacks);
  current.current = callbacks;
  const stream = useRef<MediaStream | null>(null);
  const frame = useRef<number | null>(null);
  const cameraGeneration = useRef(0);
  const fileGeneration = useRef(0);

  function releaseCamera() {
    cameraGeneration.current++;
    stream.current?.getTracks().forEach(track => track.stop());
    stream.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
  }

  useEffect(() => () => {
    releaseCamera();
    fileGeneration.current++;
  }, []);

  function stopCamera() {
    fileGeneration.current++;
    releaseCamera();
    current.current.onActive(false);
  }

  async function startCamera() {
    releaseCamera();
    const generation = cameraGeneration.current;
    current.current.onError('');
    current.current.onActive(true);
    current.current.onStatus('Webcam active. Center the student QR code.');
    try {
      const { default: decode } = await import('jsqr');
      if (generation !== cameraGeneration.current) return;
      const acquired = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
      });
      const video = videoRef.current;
      if (generation !== cameraGeneration.current || !video) {
        acquired.getTracks().forEach(track => track.stop());
        return;
      }
      stream.current = acquired;
      video.srcObject = acquired;
      video.setAttribute('playsinline', 'true');
      await video.play();
      if (generation !== cameraGeneration.current) return;

      let lastScan = -Infinity;
      const tick = (now: number) => {
        if (generation !== cameraGeneration.current) return;
        const canvas = canvasRef.current;
        if (canvas && video.readyState >= video.HAVE_CURRENT_DATA && now - lastScan >= scanIntervalMs) {
          lastScan = now;
          if (canvas.width !== video.videoWidth) canvas.width = video.videoWidth;
          if (canvas.height !== video.videoHeight) canvas.height = video.videoHeight;
          const context = canvas.getContext('2d', { willReadFrequently: true });
          if (context && canvas.width && canvas.height) {
            context.drawImage(video, 0, 0);
            const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
            const code = decode(pixels.data, pixels.width, pixels.height);
            if (code?.data && code.data.length > 20) {
              stopCamera();
              current.current.onCode(code.data);
              return;
            }
          }
        }
        frame.current = requestAnimationFrame(tick);
      };
      frame.current = requestAnimationFrame(tick);
    } catch (error) {
      if (generation !== cameraGeneration.current) return;
      stopCamera();
      current.current.onError('Cannot access webcam: ' + (error instanceof Error ? error.message : String(error)));
    }
  }

  async function readFile(file: File) {
    const generation = ++fileGeneration.current;
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      const [{ default: decode }] = await Promise.all([import('jsqr'), img.decode()]);
      if (generation !== fileGeneration.current) return;
      const canvas = document.createElement('canvas');
      const scale = Math.min(1, maxImageSide / Math.max(img.naturalWidth, img.naturalHeight));
      canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas unavailable');
      context.drawImage(img, 0, 0, canvas.width, canvas.height);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
      const code = decode(pixels.data, pixels.width, pixels.height);
      if (code?.data) current.current.onCode(code.data);
      else current.current.onStatus('No QR code found in the uploaded image.');
    } catch {
      if (generation === fileGeneration.current) current.current.onStatus('Could not read the uploaded QR image.');
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  return { startCamera, stopCamera, readFile };
}
