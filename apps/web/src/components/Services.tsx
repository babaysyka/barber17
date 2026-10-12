"use client";

import Image from "next/image";
import { useState } from "react";
import { CatalogNote } from "@/components/CatalogNote";
import type { ServiceView } from "@/lib/catalog";
import styles from "./Services.module.css";

export function Services({ services }: { services: ServiceView[] | null }) {
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState<number | null>(null);
  const current = services?.[active];

  return (
    <section id="services" className={styles.section} aria-labelledby="services-title">
      {services === null || services.length === 0 || !current ? (
        <div>
          <h2 id="services-title" className={styles.label}>
            Services
          </h2>
          <CatalogNote>
            {services === null ? "The service list did not load." : "No services are open."}
          </CatalogNote>
        </div>
      ) : (
        <>
          <div>
            <h2 id="services-title" className={styles.label}>
              Services
            </h2>
            <ul className={styles.list}>
              {services.map((service, index) => {
                const isActive = index === active;
                const isOpen = open === index;
                return (
                  <li key={service.id} className={isActive ? styles.active : undefined}>
                    <button
                      type="button"
                      className={styles.row}
                      aria-expanded={isOpen}
                      onPointerEnter={(event) => {
                        if (event.pointerType === "mouse") setActive(index);
                      }}
                      onFocus={() => setActive(index)}
                      onClick={() => {
                        setActive(index);
                        setOpen((value) => (value === index ? null : index));
                      }}
                    >
                      <span className={styles.index}>{service.index}</span>
                      <span className={styles.name}>{service.name}</span>
                    </button>
                    {isOpen ? (
                      <div className={styles.panel}>
                        <div className={styles.panelMedia}>
                          <Image src={service.image} alt="" fill sizes="100vw" />
                        </div>
                        <p>{service.description}</p>
                        <p className={styles.meta}>{service.meta}</p>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>
          <aside className={styles.aside} aria-hidden="true">
            <div className={styles.stage}>
              {services.map((service, index) => (
                <Image
                  key={service.id}
                  src={service.image}
                  alt=""
                  fill
                  sizes="40vw"
                  className={index === active ? styles.shown : styles.hidden}
                />
              ))}
            </div>
            <p className={styles.asideCopy}>{current.description}</p>
            <p className={styles.meta}>{current.meta}</p>
          </aside>
        </>
      )}
    </section>
  );
}
