"use client";

import { ReactLenis, useLenis, type LenisRef } from "lenis/react";
import type { LenisOptions } from "lenis";
import "lenis/dist/lenis.css";
import { useEffect, useRef, type ReactNode } from "react";
import { gsap, ScrollTrigger } from "@/lib/gsap";

const LENIS_OPTIONS: LenisOptions = {
  autoRaf: false,
  lerp: 0.08,
  wheelMultiplier: 0.9,
  touchMultiplier: 1,
  syncTouch: false,
  anchors: true,
  stopInertiaOnNavigate: true,
};

function ScrollTriggerBridge() {
  useLenis(ScrollTrigger.update);
  return null;
}

export function SmoothScroll({ children }: { children: ReactNode }) {
  const lenisRef = useRef<LenisRef>(null);

  useEffect(() => {
    const tick = (time: number) => lenisRef.current?.lenis?.raf(time * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);

    let alive = true;
    const refresh = () => {
      if (!alive) return;
      ScrollTrigger.sort();
      ScrollTrigger.refresh();
    };
    document.fonts.ready.then(refresh);
    const id = window.setTimeout(refresh, 500);

    return () => {
      alive = false;
      window.clearTimeout(id);
      gsap.ticker.remove(tick);
      gsap.ticker.lagSmoothing(500, 33);
    };
  }, []);

  return (
    <ReactLenis root options={LENIS_OPTIONS} ref={lenisRef}>
      <ScrollTriggerBridge />
      {children}
    </ReactLenis>
  );
}
