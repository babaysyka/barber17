"use client";

import { FormEvent, useEffect, useState } from "react";
import { AdminError, adminFetch } from "@/lib/admin-api";
import styles from "./admin.module.css";

type Service = {
  id: string;
  name: string;
  description: string;
  durationMin: number;
  price: number;
  isActive: boolean;
};

export function ServicesDesk() {
  const [rows, setRows] = useState<Service[]>([]);
  const [error, setError] = useState("");

  function load() {
    adminFetch<Service[]>("/api/v1/admin/services")
      .then(setRows)
      .catch((caught) => setError(caught instanceof AdminError ? caught.message : "Could not load services"));
  }

  useEffect(() => {
    load();
  }, []);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError("");
    try {
      await adminFetch("/api/v1/admin/services", {
        method: "POST",
        body: JSON.stringify({
          name: form.get("name"),
          description: form.get("description"),
          durationMin: Number(form.get("durationMin")),
          price: Number(form.get("price")),
        }),
      });
      event.currentTarget.reset();
      load();
    } catch (caught) {
      setError(caught instanceof AdminError ? caught.message : "Could not add the service");
    }
  }

  async function save(row: Service, form: FormData) {
    setError("");
    try {
      await adminFetch(`/api/v1/admin/services/${row.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: form.get("name"),
          description: form.get("description"),
          durationMin: Number(form.get("durationMin")),
          price: Number(form.get("price")),
          isActive: form.get("isActive") === "on",
        }),
      });
      load();
    } catch (caught) {
      setError(caught instanceof AdminError ? caught.message : "Could not save the service");
    }
  }

  return (
    <section className={styles.page}>
      <h1>Services</h1>
      <p className={styles.lead}>Prices are in soʻm. Closing a service hides it from booking.</p>
      {error ? <p className={styles.error}>{error}</p> : null}
      <form className={`${styles.card} ${styles.row}`} onSubmit={create}>
        <label>
          Name
          <input name="name" required />
        </label>
        <label>
          Description
          <input name="description" required />
        </label>
        <label>
          Minutes
          <input name="durationMin" type="number" min={5} required />
        </label>
        <label>
          Price
          <input name="price" type="number" min={0} required />
        </label>
        <button className={styles.button} type="submit">
          Add
        </button>
      </form>
      <div className={styles.list}>
        {rows.map((row) => (
          <form
            className={`${styles.card} ${styles.row}`}
            key={row.id}
            onSubmit={(event) => {
              event.preventDefault();
              void save(row, new FormData(event.currentTarget));
            }}
          >
            <label>
              Name
              <input name="name" defaultValue={row.name} required />
            </label>
            <label>
              Description
              <input name="description" defaultValue={row.description} required />
            </label>
            <label>
              Minutes
              <input name="durationMin" type="number" min={5} defaultValue={row.durationMin} required />
            </label>
            <label>
              Price
              <input name="price" type="number" min={0} defaultValue={row.price} required />
            </label>
            <label className={styles.checks}>
              <input name="isActive" type="checkbox" defaultChecked={row.isActive} /> Open
            </label>
            <div className={styles.actions}>
              <button className={styles.button} type="submit">
                Save
              </button>
              <button
                className={styles.quiet}
                type="button"
                onClick={() => {
                  void adminFetch(`/api/v1/admin/services/${row.id}`, { method: "DELETE" }).then(load);
                }}
              >
                Close
              </button>
            </div>
          </form>
        ))}
      </div>
    </section>
  );
}
