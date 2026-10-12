"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { AdminError, adminFetch, uploadPhoto } from "@/lib/admin-api";
import styles from "./admin.module.css";

const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

type Clock = { weekday: number; start: string; end: string };
type Desk = {
  hours: Clock[];
  breaks: Clock[];
  timeOff: { id: string; barberId: string | null; startsAt: string; endsAt: string; note: string | null }[];
  portfolio: { id: string; imageUrl: string }[];
};

function find(rows: Clock[], weekday: number) {
  return rows.find((row) => row.weekday === weekday);
}

export function BarberDesk({ id }: { id: string }) {
  const [desk, setDesk] = useState<Desk | null>(null);
  const [error, setError] = useState("");
  const [link, setLink] = useState("");

  const load = useCallback(() => {
    adminFetch<Desk>(`/api/v1/admin/barbers/${id}/desk`)
      .then(setDesk)
      .catch((caught) => setError(caught instanceof AdminError ? caught.message : "Could not load the chair"));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function saveClock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const hours: Clock[] = [];
    const breaks: Clock[] = [];
    days.forEach((_, index) => {
      const weekday = index + 1;
      if (form.get(`open-${weekday}`) === "on") {
        hours.push({ weekday, start: String(form.get(`start-${weekday}`)), end: String(form.get(`end-${weekday}`)) });
      }
      const breakStart = String(form.get(`break-start-${weekday}`) ?? "");
      const breakEnd = String(form.get(`break-end-${weekday}`) ?? "");
      if (breakStart && breakEnd) breaks.push({ weekday, start: breakStart, end: breakEnd });
    });
    setError("");
    try {
      await adminFetch(`/api/v1/admin/barbers/${id}/clock`, { method: "PUT", body: JSON.stringify({ hours, breaks }) });
      load();
    } catch (caught) {
      setError(caught instanceof AdminError ? caught.message : "Could not save the week");
    }
  }

  async function addOff(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError("");
    try {
      await adminFetch("/api/v1/admin/time-off", {
        method: "POST",
        body: JSON.stringify({
          barberId: form.get("scope") === "shop" ? null : id,
          startsAt: form.get("startsAt"),
          endsAt: form.get("endsAt"),
          note: form.get("note"),
        }),
      });
      event.currentTarget.reset();
      load();
    } catch (caught) {
      setError(caught instanceof AdminError ? caught.message : "Could not add the day off");
    }
  }

  async function addPhoto(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const file = new FormData(event.currentTarget).get("photo");
    if (!(file instanceof File) || !file.size) return;
    setError("");
    try {
      const uploaded = await uploadPhoto(file);
      if (new FormData(event.currentTarget).get("kind") === "portrait") {
        await adminFetch(`/api/v1/admin/barbers/${id}`, { method: "PATCH", body: JSON.stringify({ photoUrl: uploaded.url }) });
      } else {
        await adminFetch(`/api/v1/admin/barbers/${id}/portfolio`, { method: "POST", body: JSON.stringify({ imageUrl: uploaded.url }) });
      }
      event.currentTarget.reset();
      load();
    } catch (caught) {
      setError(caught instanceof AdminError ? caught.message : "Could not upload the photo");
    }
  }

  if (!desk) return error ? <p className={styles.error}>{error}</p> : null;

  return (
    <section className={styles.page}>
      <h1>Chair</h1>
      <p className={styles.lead}>Week, lunch, days off, portrait, and portfolio. Monday is closed unless you open it.</p>
      {error ? <p className={styles.error}>{error}</p> : null}
      <div className={styles.actions}>
        <button
          className={styles.quiet}
          type="button"
          onClick={() => {
            setError("");
            void adminFetch<{ url: string }>(`/api/v1/admin/barbers/${id}/link`, { method: "POST" })
              .then((result) => setLink(result.url))
              .catch((caught) => setError(caught instanceof AdminError ? caught.message : "Could not make the link"));
          }}
        >
          Telegram link, 30 min
        </button>
      </div>
      {link ? <p className={styles.meta}>{link}</p> : null}
      <form className={styles.stack} onSubmit={saveClock}>
        {days.map((day, index) => {
          const weekday = index + 1;
          const hour = find(desk.hours, weekday);
          const pause = find(desk.breaks, weekday);
          return (
            <div className={`${styles.card} ${styles.row}`} key={day}>
              <label>
                <input name={`open-${weekday}`} type="checkbox" defaultChecked={Boolean(hour)} /> {day}
              </label>
              <label>
                Start
                <input name={`start-${weekday}`} type="time" defaultValue={hour?.start ?? "11:00"} />
              </label>
              <label>
                End
                <input name={`end-${weekday}`} type="time" defaultValue={hour?.end ?? "21:00"} />
              </label>
              <label>
                Lunch from
                <input name={`break-start-${weekday}`} type="time" defaultValue={pause?.start ?? ""} />
              </label>
              <label>
                Lunch to
                <input name={`break-end-${weekday}`} type="time" defaultValue={pause?.end ?? ""} />
              </label>
            </div>
          );
        })}
        <button className={styles.button} type="submit">
          Save week
        </button>
      </form>
      <form className={`${styles.card} ${styles.row}`} onSubmit={addOff}>
        <label>
          From
          <input name="startsAt" type="datetime-local" required />
        </label>
        <label>
          To
          <input name="endsAt" type="datetime-local" required />
        </label>
        <label>
          Note
          <input name="note" />
        </label>
        <label>
          Applies to
          <select name="scope" defaultValue="barber">
            <option value="barber">This barber</option>
            <option value="shop">Whole shop</option>
          </select>
        </label>
        <button className={styles.button} type="submit">
          Add time off
        </button>
      </form>
      <div className={styles.list}>
        {desk.timeOff.map((row) => (
          <article className={styles.card} key={row.id}>
            <p>
              {row.startsAt.slice(0, 16).replace("T", " ")} – {row.endsAt.slice(0, 16).replace("T", " ")} · {row.barberId ? "Barber" : "Shop"} · {row.note}
            </p>
            <button
              className={styles.quiet}
              type="button"
              onClick={() => {
                void adminFetch(`/api/v1/admin/time-off/${row.id}`, { method: "DELETE" }).then(load);
              }}
            >
              Remove
            </button>
          </article>
        ))}
      </div>
      <form className={`${styles.card} ${styles.row}`} onSubmit={addPhoto}>
        <label>
          Photo
          <input name="photo" type="file" accept="image/jpeg,image/png,image/webp" required />
        </label>
        <label>
          Use as
          <select name="kind" defaultValue="portfolio">
            <option value="portrait">Portrait</option>
            <option value="portfolio">Portfolio</option>
          </select>
        </label>
        <button className={styles.button} type="submit">
          Upload
        </button>
      </form>
      <div className={styles.photos}>
        {desk.portfolio.map((photo) => (
          <figure key={photo.id}>
            <Image src={photo.imageUrl} alt="" width={160} height={160} />
            <button
              className={styles.quiet}
              type="button"
              onClick={() => {
                void adminFetch(`/api/v1/admin/portfolio/${photo.id}`, { method: "DELETE" }).then(load);
              }}
            >
              Remove
            </button>
          </figure>
        ))}
      </div>
    </section>
  );
}
