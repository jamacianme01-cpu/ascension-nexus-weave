import { useEffect, useRef } from "react";

/**
 * Local 2D speech expression using the exact approved scene's own pixels.
 * This is visual mouth motion synchronized to voice activity, not a phoneme
 * lip-sync system, a separate character rig, or a generated replacement face.
 * The source image is never written, cropped for display, or replaced.
 */
const X = 270, Y = 210, W = 100, H = 102;

export function GroundskeeperExpression({ source, speaking }: { source: string; speaking: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const pixels = useRef<ImageData | null>(null);
  const active = useRef(false);

  useEffect(() => {
    let closed = false;
    const img = new Image();
    img.onload = () => {
      if (closed || img.naturalWidth !== 1672 || img.naturalHeight !== 941) return;
      const context = canvas.current?.getContext("2d", { willReadFrequently: true });
      if (!context) return;
      try {
        context.drawImage(img, X, Y, W, H, 0, 0, W, H);
        pixels.current = context.getImageData(0, 0, W, H);
        active.current = true;
      } catch { pixels.current = null; active.current = false; }
    };
    img.src = source;
    return () => { closed = true; pixels.current = null; active.current = false; };
  }, [source]);

  useEffect(() => {
    const element = canvas.current;
    const context = element?.getContext("2d");
    if (!element || !context || !speaking ||
        window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0;
    let start = 0;
    const output = context.createImageData(W, H);
    function draw(time: number) {
      const original = pixels.current;
      if (!start) start = time;
      if (original && active.current && element && context) {
        const t = (time - start) / 1000;
        // Small, smooth opening and closing of the lower lip and adjacent
        // skin. Zero displacement at the edge preserves the exact background.
        const opening = Math.max(0, Math.sin(t * 19) * .65 + Math.sin(t * 11) * .35);
        for (let y = 0; y < H; y++) {
          for (let x = 0; x < W; x++) {
            const ax = (x - 53) / 42, ay = (y - 55) / 35;
            const envelope = Math.max(0, 1 - ax * ax - ay * ay) ** 2;
            const lowerLip = Math.tanh((y - 53) / 7);
            const sampleY = Math.max(0, Math.min(H - 1, y - opening * 6 * envelope * lowerLip));
            const y0 = Math.floor(sampleY), y1 = Math.min(H - 1, y0 + 1), fraction = sampleY - y0;
            const target = (y * W + x) * 4;
            const a = (y0 * W + x) * 4, b = (y1 * W + x) * 4;
            for (let channel = 0; channel < 4; channel++) {
              output.data[target + channel] = original.data[a + channel]! * (1 - fraction) +
                original.data[b + channel]! * fraction;
            }
          }
        }
        context.putImageData(output, 0, 0);
        element.style.opacity = "1";
        element.dataset.motion = "active";
      }
      frame = requestAnimationFrame(draw);
    }
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      element.style.opacity = "0";
      element.dataset.motion = "idle";
    };
  }, [speaking, source]);

  return <canvas ref={canvas} width={W} height={H}
    className="ascension-groundskeeper-expression" aria-hidden="true"
    data-motion="idle" />;
}
