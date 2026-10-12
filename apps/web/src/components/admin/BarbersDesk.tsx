"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { AdminError, adminFetch, uploadPhoto } from "@/lib/admin-api";
import styles from "./admin.module.css";

type Service = { id: string; name: string };
type Barber = {
  id: string;
  name: string;
  bio: string | null;
  experienceYears: number;
  photoUrl: string | null;
  isActive: boolean;
  services: { serviceId: string }[];
};

export function BarbersDesk() {
  const [rows, setRows] = useState<Barber[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [error, setError] = useState("");

  function load() {
    adminFetch<Barber[]>("/api/v1/admin/barbers")
      .then(setRows)
      .catch((caught) => setError(caught instanceof AdminError ? caught.message : "Could not load barbers"));
  }

  useEffect(() => {
    load();
    adminFetch<Service[]>("/api/v1/admin/services").then(setServices);
  }, []);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const file = form.get("photo");
    setError("");
    try {
      const photo = file instanceof File && file.size ? await uploadPhoto(file) : null;
      await adminFetch("/api/v1/admin/barbers", {
        method: "POST",
        body: JSON.stringify({
          name: form.get("name"),
          bio: form.get("bio"),
          experienceYears: Number(form.get("experienceYears")),
          photoUrl: photo?.url,
        }),
      });
      event.currentTarget.reset();
      load();
    } catch (caught) {
      setError(caught instanceof AdminError ? caught.message : "Could not add the barber");
    }
  }

  return (
    <section className={styles.page}>
      <h1>Barbers</h1>
      <p className={styles.lead}>Chairs, photos, and which services each barber takes.</p>
      {error ? <p className={styles.error}>{error}</p> : null}
      <form className={`${styles.card} ${styles.row}`} onSubmit={create}>
        <label>
          Name
          <input name="name" required />
        </label>
        <label>
          Bio
          <input name="bio" required />
        </label>
        <label>
          Years
          <input name="experienceYears" type="number" min={0} required />
        </label>
        <label>
          Photo
          <input name="photo" type="file" accept="image/jpeg,image/png,image/webp" />
        </label>
        <button className={styles.button} type="submit">
          Add
        </button>
      </form>
      <div className={styles.list}>
        {rows.map((row) => (
          <form
            className={styles.card}
            key={row.id}
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              const serviceIds = services.filter((service) => form.get(`svc-${service.id}`) === "on").map((service) => service.id);
              setError("");
              void adminFetch(`/api/v1/admin/barbers/${row.id}`, {
                method: "PATCH",
                body: JSON.stringify({
                  name: form.get("name"),
                  bio: form.get("bio"),
                  experienceYears: Number(form.get("experienceYears")),
                  isActive: form.get("isActive") === "on",
                }),
              })
                .then(() => adminFetch(`/api/v1/admin/barbers/${row.id}/services`, { method: "PUT", body: JSON.stringify({ serviceIds }) }))
                .then(load)
                .catch((caught) => setError(caught instanceof AdminError ? caught.message : "Could not save the barber"));
            }}
          >
            <div className={styles.row}>
              <label>
                Name
                <input name="name" defaultValue={row.name} required />
              </label>
              <label>
                Bio
                <input name="bio" defaultValue={row.bio ?? ""} required />
              </label>
              <label>
                Years
                <input name="experienceYears" type="number" min={0} defaultValue={row.experienceYears} required />
              </label>
            </div>
            <div className={styles.checks}>
              {services.map((service) => (
                <label key={service.id}>
                  <input name={`svc-${service.id}`} type="checkbox" defaultChecked={row.services.some((item) => item.serviceId === service.id)} />
                  {service.name}
                </label>
              ))}
              <label>
                <input name="isActive" type="checkbox" defaultChecked={row.isActive} /> Open
              </label>
            </div>
            <div className={styles.actions}>
              <button className={styles.button} type="submit">
                Save
              </button>
              <Link className={styles.quiet} href={`/admin/barbers/${row.id}`}>
                Hours and portfolio
              </Link>
              <button
                className={styles.quiet}
                type="button"
                onClick={() => {
                  void adminFetch(`/api/v1/admin/barbers/${row.id}`, { method: "DELETE" }).then(load);
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
