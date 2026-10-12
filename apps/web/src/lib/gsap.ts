import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import { useGSAP } from "@gsap/react";

export const EASE = {
  out: "expo.out",
  inOut: "power3.inOut",
  scrub: "none",
} as const;

export const DUR = { fast: 0.35, base: 1.1, slow: 1.4 } as const;

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger, SplitText, useGSAP);
  gsap.defaults({ ease: EASE.out, duration: DUR.base });
  ScrollTrigger.config({ ignoreMobileResize: true });
}

export { gsap, ScrollTrigger, SplitText, useGSAP };
