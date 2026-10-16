"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useInView, usePrefersReducedMotion } from "@/lib/motion";

/** Fades a section up 8px the first time it scrolls into view.
 *  Content is visible in the server HTML; it is only hidden after hydration, and only if it starts below the fold. */
export function Reveal({ children, className = "" }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref);
  const reduced = usePrefersReducedMotion();
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (el && el.getBoundingClientRect().top > window.innerHeight) setArmed(true);
  }, []);

  const hidden = armed && !inView && !reduced;
  return (
    <div ref={ref} className={`reveal ${hidden ? "reveal-hidden" : ""} ${className}`}>
      {children}
    </div>
  );
}
