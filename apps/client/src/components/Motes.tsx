import { useEffect, useRef } from "react";
import { useReducedMotion } from "../lib/motion";
import { pageCovered } from "../useModal";

type Mote = {
  x: number;
  y: number;
  size: number;
  vx: number;
  vy: number;
  phase: number;
  spin: number;
};

/**
 * Ambient particles behind featured stories. The theme picks the kind through
 * the `--motes` custom property: drifting sakura petals by day, rising motes of
 * warm light by night.
 */
export function Motes({ count = 22 }: { count?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const reduced = useReducedMotion();
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || reduced) return;
    let frame = 0;
    let visible = true;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      canvas.width = canvas.clientWidth * dpr;
      canvas.height = canvas.clientHeight * dpr;
    };
    resize();
    const motes: Mote[] = Array.from({ length: count }, () => ({
      x: Math.random(),
      y: Math.random(),
      size: 0.6 + Math.random(),
      vx: (Math.random() - 0.5) * 0.00012,
      vy: 0.00006 + Math.random() * 0.00012,
      phase: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 0.002,
    }));
    // Re-read the theme's particle style now and then, so switching themes follows along.
    let style = { petals: false, color: "" };
    const readStyle = () => {
      const computed = getComputedStyle(canvas);
      style = {
        petals: computed.getPropertyValue("--motes").trim() === "petals",
        color: computed.color,
      };
    };
    readStyle();
    let sinceStyle = 0;
    let last = performance.now();
    const draw = (now: number) => {
      const dt = Math.min(now - last, 50);
      last = now;
      // Hold still under a dialog or transition: repainting the canvas there
      // only competes with the animation on top.
      if (pageCovered()) {
        if (visible) frame = requestAnimationFrame(draw);
        return;
      }
      sinceStyle += dt;
      if (sinceStyle > 500) {
        sinceStyle = 0;
        readStyle();
      }
      const { petals, color } = style;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = color;
      for (const mote of motes) {
        mote.phase += dt * 0.0012;
        // Petals fall and sway; light motes rise.
        mote.x +=
          (mote.vx + (petals ? Math.sin(mote.phase) * 0.00008 : 0)) * dt;
        mote.y += (petals ? mote.vy : -mote.vy * 1.3) * dt;
        if (mote.y > 1.08) mote.y = -0.08;
        if (mote.y < -0.08) mote.y = 1.08;
        if (mote.x < -0.08) mote.x = 1.08;
        if (mote.x > 1.08) mote.x = -0.08;
        const x = mote.x * canvas.width;
        const y = mote.y * canvas.height;
        if (petals) {
          const r = (4 + mote.size * 3) * dpr;
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(mote.phase * 0.6 + mote.spin * now);
          ctx.scale(1, 0.55 + 0.35 * Math.abs(Math.sin(mote.phase)));
          ctx.globalAlpha = 0.55;
          ctx.beginPath();
          // A five-sided petal: rounded body with a notch at the tip.
          ctx.moveTo(0, -r);
          ctx.quadraticCurveTo(r * 0.9, -r * 0.4, 0, r);
          ctx.quadraticCurveTo(-r * 0.9, -r * 0.4, 0, -r);
          ctx.fill();
          ctx.restore();
        } else {
          const r = (0.8 + mote.size * 1.4) * dpr;
          const alpha = 0.25 + 0.55 * (0.5 + 0.5 * Math.sin(mote.phase * 1.4));
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
