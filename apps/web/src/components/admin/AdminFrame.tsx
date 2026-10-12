"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { adminFetch } from "@/lib/admin-api";
import styles from "./admin.module.css";

const links = [
  { href: "/admin", label: "Visits" },
  { href: "/admin/analytics", label: "Numbers" },
  { href: "/admin/services", label: "Services" },
  { href: "/admin/barbers", label: "Barbers" },
  { href: "/admin/reviews", label: "Reviews" },
  { href: "/admin/settings", label: "Settings" },
];

export function AdminFrame({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(path === "/admin/login");

  useEffect(() => {
    if (path === "/admin/login") return;
    const sendHome = () => router.replace("/admin/login");
    window.addEventListener("orda-admin-unauthorized", sendHome);
    adminFetch<{ login: string }>("/api/v1/admin/me")
      .then(() => setReady(true))
      .catch(() => sendHome());
    return () => window.removeEventListener("orda-admin-unauthorized", sendHome);
  }, [path, router]);

  if (path === "/admin/login") return <div className={styles.shell}>{children}</div>;
  if (!ready) return <div className={styles.shell} />;

  return (
    <div className={styles.shell}>
      <nav className={styles.nav}>
        <Link className={styles.brand} href="/admin">
          Orda
        </Link>
        {links.map((link) => (
          <Link key={link.href} href={link.href} aria-current={path === link.href ? "page" : undefined}>
            {link.label}
          </Link>
        ))}
        <button
          className={styles.quiet}
          type="button"
          onClick={() => {
            void adminFetch("/api/v1/admin/logout", { method: "POST" }).finally(() => router.replace("/admin/login"));
          }}
        >
          Sign out
        </button>
      </nav>
      <div className={styles.main}>{children}</div>
    </div>
  );
}
