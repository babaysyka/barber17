"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { AdminError, adminFetch } from "@/lib/admin-api";
import styles from "./admin.module.css";

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState("");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError("");
    try {
      await adminFetch("/api/v1/admin/login", {
        method: "POST",
        body: JSON.stringify({ login: form.get("login"), password: form.get("password") }),
      });
      router.replace("/admin");
    } catch (caught) {
      setError(caught instanceof AdminError ? caught.message : "Sign-in failed");
    }
  }

  return (
    <form className={styles.login} onSubmit={onSubmit}>
      <h1>Desk</h1>
      <p className={styles.lead}>Sign in to run the shop.</p>
      <div className={styles.stack}>
        <label>
          Login
          <input name="login" autoComplete="username" required />
        </label>
        <label>
          Password
          <input name="password" type="password" autoComplete="current-password" required />
        </label>
        {error ? <p className={styles.error}>{error}</p> : null}
        <button className={styles.button} type="submit">
          Sign in
        </button>
      </div>
    </form>
  );
}
