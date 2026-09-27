import { useEffect, useRef } from "react";
import { useReducedMotion } from "../lib/motion";

type Mote = {
  x: number;
  y: number;
  r: number;
  vx: number;
  vy: number;
  phase: number;
};

/** Drifting motes of warm light, the "afterglow" behind featured stories. */
export function Motes({ count = 26 }: { count?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const reduced = useReducedMotion();
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || reduced) return;
    let frame = 0;
    let visible = true;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const motes: Mote[] = [];
    const resize = () => {
      canvas.width = canvas.clientWidth * dpr;
      canvas.height = canvas.clientHeight * dpr;
    };
    resize();
    for (let i = 0; i < count; i++)
      motes.push({
        x: Math.random(),
        y: Math.random(),
        r: 0.8 + Math.random() * 2.2,
        vx: (Math.random() - 0.5) * 0.00012,
        vy: -0.00008 - Math.random() * 0.00018,
        phase: Math.random() * Math.PI * 2,
      });
    const color = getComputedStyle(canvas).color;
    let last = performance.now();
    const draw = (now: number) => {
      const dt = Math.min(now - last, 50);
      last = now;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const mote of motes) {
        mote.x += mote.vx * dt;
        mote.y += mote.vy * dt;
        mote.phase += dt * 0.0015;
        if (mote.y < -0.05) {
          mote.y = 1.05;
          mote.x = Math.random();
        }
        if (mote.x < -0.05) mote.x = 1.05;
        if (mote.x > 1.05) mote.x = -0.05;
        const alpha = 0.25 + 0.55 * (0.5 + 0.5 * Math.sin(mote.phase));
        const x = mote.x * canvas.width;
        const y = mote.y * canvas.height;
        const r = mote.r * dpr;
        const glow = ctx.createRadialGradient(x, y, 0, x, y, r * 4);
        glow.addColorStop(0, color);
        glow.addColorStop(1, "transparent");
        ctx.globalAlpha = alpha * 0.35;
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(x, y, r * 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      if (visible) frame = requestAnimationFrame(draw);
    };
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting && !document.hidden;
      cancelAnimationFrame(frame);
      if (visible) {
        last = performance.now();
        frame = requestAnimationFrame(draw);
      }
    });
    observer.observe(canvas);
    window.addEventListener("resize", resize);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", resize);
    };
  }, [count, reduced]);
  if (reduced) return null;
  return <canvas ref={ref} className="motes" aria-hidden="true" />;
}
