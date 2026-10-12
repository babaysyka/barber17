"use client";

import { useRef } from "react";
import { SplitText, gsap, useGSAP } from "@/lib/gsap";
import styles from "./Statement.module.css";

export function Statement() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const target = root.current?.querySelector<HTMLElement>("[data-split]");
      if (!target) return;

      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        SplitText.create(target, {
          type: "words",
          tag: "span",
          aria: "hidden",
          onSplit(self) {
            return gsap.fromTo(
              self.words,
              { color: "#96928a" },
              {
                color: "#e8e1d5",
                ease: "none",
                duration: 0.35,
                stagger: 0.12,
                scrollTrigger: {
                  trigger: root.current,
                  start: "top 72%",
                  end: "bottom 48%",
                  scrub: true,
                },
              },
            );
          },
        });
      });
    },
    { scope: root },
  );

  return (
    <section ref={root} className={styles.section} aria-labelledby="statement-title">
      <h2 id="statement-title" className={styles.title}>
        <span className="sr-only">Not just a haircut. A ritual.</span>
        <span aria-hidden="true" data-split>
          Not just a haircut. <em>A ritual.</em>
        </span>
      </h2>
      <p className={styles.body}>
        We believe grooming is more than maintenance. It is a moment to reset, refine and return sharper.
      </p>
    </section>
  );
}
