"use client";

import { useRef, type ReactNode } from "react";
import { gsap, useGSAP } from "@/lib/gsap";
import { FINE_POINTER, REDUCED_MOTION } from "@/lib/interaction";
import styles from "./Magnetic.module.css";

type Props = {
  children: ReactNode;
  strength?: number;
};

export function Magnetic({ children, strength = 0.28 }: Props) {
  const zone = useRef<HTMLSpanElement>(null);
  const target = useRef<HTMLSpanElement>(null);

  useGSAP(
    () => {
      if (!matchMedia(FINE_POINTER).matches || matchMedia(REDUCED_MOTION).matches) return;
      const z = zone.current;
      const t = target.current;
      if (!z || !t) return;

      const xTo = gsap.quickTo(t, "x", { duration: 0.8, ease: "expo.out" });
      const yTo = gsap.quickTo(t, "y", { duration: 0.8, ease: "expo.out" });

      const onMove = (event: PointerEvent) => {
        const rect = z.getBoundingClientRect();
        const dx = event.clientX - (rect.left + rect.width / 2);
        const dy = event.clientY - (rect.top + rect.height / 2);
        xTo(dx * strength);
        yTo(dy * strength);
      };

      const onLeave = () => {
        xTo(0);
        yTo(0);
      };

      z.addEventListener("pointermove", onMove);
      z.addEventListener("pointerleave", onLeave);
      return () => {
        z.removeEventListener("pointermove", onMove);
        z.removeEventListener("pointerleave", onLeave);
      };
    },
    { scope: zone },
  );

  return (
    <span ref={zone} className={styles.zone}>
      <span ref={target} className={styles.target}>
        {children}
      </span>
    </span>
  );
}
