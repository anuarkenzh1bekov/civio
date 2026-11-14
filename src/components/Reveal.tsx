"use client";

import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useEffect, useRef } from "react";

gsap.registerPlugin(ScrollTrigger);

/**
 * Wraps a section. Children marked with `data-reveal` rise in, lightly staggered,
 * when the section scrolls into view. With reduced motion they simply stay visible.
 */
export function Reveal({
  children,
  className,
  immediate = false,
}: {
  children: React.ReactNode;
  className?: string;
  /** Play on mount instead of on scroll (used for the hero). */
  immediate?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const mm = gsap.matchMedia();
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      const items = root.querySelectorAll<HTMLElement>("[data-reveal]");
      if (items.length === 0) return;
      gsap.from(items, {
        opacity: 0,
        y: 18,
        duration: 0.7,
        ease: "power3.out",
        stagger: 0.09,
        clearProps: "opacity,transform",
        scrollTrigger: immediate ? undefined : { trigger: root, start: "top 78%", once: true },
      });
    });
    return () => mm.revert();
  }, [immediate]);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
