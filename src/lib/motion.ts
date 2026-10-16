"use client";

// Small motion helpers. Every animation here is skipped when the visitor prefers reduced motion.

import { useEffect, useRef, useState, type RefObject } from "react";

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

/** True once the element has scrolled into view (stays true). */
export function useInView<T extends Element>(ref: RefObject<T | null>, rootMargin = "0px 0px -10% 0px"): boolean {
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || inView) return;
    if (!("IntersectionObserver" in window)) { setInView(true); return; }
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setInView(true); io.disconnect(); }
    }, { rootMargin });
    io.observe(el);
    return () => io.disconnect();
  }, [ref, rootMargin, inView]);
  return inView;
}

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

/** Animate a number from its previous value to `target`. With `from`, the first run starts there instead. */
export function useTweenedNumber(target: number, { duration = 300, from, enabled = true }: { duration?: number; from?: number; enabled?: boolean } = {}): number {
  const reduced = usePrefersReducedMotion();
  const [value, setValue] = useState(from ?? target);
  const current = useRef(from ?? target);

  useEffect(() => {
    if (!enabled) return;
    if (reduced || !Number.isFinite(target)) { current.current = target; setValue(target); return; }
    const start = current.current;
    if (start === target) return;
    const t0 = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / duration);
      const v = start + (target - start) * easeOut(k);
      current.current = v;
      setValue(v);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, duration, reduced, enabled]);

  return value;
}
