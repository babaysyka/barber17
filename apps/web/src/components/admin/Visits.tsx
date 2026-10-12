"use client";

import { FormEvent, useEffect, useState } from "react";
import { AdminError, adminFetch } from "@/lib/admin-api";
import styles from "./admin.module.css";

type Visit = {
  id: string;
  status: string;
  source: string;
  startsAt: string;
  clientName: string;
  clientPhone: string;
  barberName: string;
  services: string[];
};

type Option = { id: string; name: string };
type CatalogService = Option & { isActive: boolean };

const statuses = ["confirmed", "completed", "cancelled", "no_show"];

function today() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tashkent" }).format(new Date());
}

function localInput(iso: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tashkent",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const pick = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${pick("year")}-${pick("month")}-${pick("day")}T${pick("hour")}:${pick("minute")}`;
}

export function Visits() {
  const [date, setDate] = useState(today);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [services, setServices] = useState<CatalogService[]>([]);
  const [barbers, setBarbers] = useState<Option[]>([]);
  const [error, setError] = useState("");

  function load(next = date) {
    adminFetch<Visit[]>(`/api/v1/admin/bookings?date=${next}`)
      .then(setVisits)
      .catch((caught) => setError(caught instanceof AdminError ? caught.message : "Could not load visits"));
  }

  useEffect(() => {
    adminFetch<Visit[]>(`/api/v1/admin/bookings?date=${date}`)
      .then(setVisits)
      .catch((caught) => setError(caught instanceof AdminError ? caught.message : "Could not load visits"));
    adminFetch<CatalogService[]>("/api/v1/admin/services").then((rows) => setServices(rows.filter((row) => row.isActive)));
    adminFetch<Array<Option & { isActive: boolean }>>("/api/v1/admin/barbers").then((rows) => setBarbers(rows.filter((row) => row.isActive)));
  }, [date]);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError("");
    try {
      await adminFetch("/api/v1/admin/bookings", {
        method: "POST",
        body: JSON.stringify({
          serviceIds: [form.get("serviceId")],
          barberId: form.get("barberId"),
          startsAt: form.get("startsAt"),
          clientName: form.get("clientName"),
          clientPhone: form.get("clientPhone"),
        }),
      });
      event.currentTarget.reset();
      load();
    } catch (caught) {
      setError(caught instanceof AdminError ? caught.message : "Could not book");
    }
  }

  async function setStatus(id: string, status: string) {
    setError("");
    try {
      await adminFetch(`/api/v1/admin/bookings/${id}/status`, { method: "POST", body: JSON.stringify({ status }) });
      load();
    } catch (caught) {
      setError(caught instanceof AdminError ? caught.message : "Could not update the visit");
    }
  }

  async function move(id: string, startsAt: string) {
    setError("");
    try {
      await adminFetch(`/api/v1/admin/bookings/${id}/reschedule`, { method: "POST", body: JSON.stringify({ startsAt }) });
      load();
    } catch (caught) {
      setError(caught instanceof AdminError ? caught.message : "Could not move the visit");
    }
  }

  return (
    <section className={styles.page}>
      <h1>Visits</h1>
      <p className={styles.lead}>Book, move, cancel, or mark a visit. Times are Tashkent.</p>
      {error ? <p className={styles.error}>{error}</p> : null}
      <form
        className={styles.card}
        onSubmit={(event) => {
          event.preventDefault();
          load(new FormData(event.currentTarget).get("date") as string);
        }}
      >
        <label>
          Day
          <input name="date" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        </label>
        <button className={styles.button} type="submit">
          Show day
        </button>
      </form>
      <form className={`${styles.card} ${styles.row}`} onSubmit={create}>
        <label>
          Service
          <select name="serviceId" required>
            {services.map((service) => (
              <option key={service.id} value={service.id}>
                {service.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Barber
          <select name="barberId" required>
            {barbers.map((barber) => (
              <option key={barber.id} value={barber.id}>
                {barber.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Starts
          <input name="startsAt" type="datetime-local" required />
        </label>
        <label>
          Name
          <input name="clientName" required />
        </label>
        <label>
          Phone
          <input name="clientPhone" required />
        </label>
        <button className={styles.button} type="submit">
          Book
        </button>
      </form>
      <div className={styles.list}>
        {visits.map((visit) => (
          <article className={styles.card} key={visit.id}>
            <p>
              {localInput(visit.startsAt).replace("T", " ")} · {visit.clientName} · {visit.clientPhone}
            </p>
            <p className={styles.meta}>
              {visit.barberName} · {visit.services.join(", ")} · {visit.source}
            </p>
            <div className={styles.actions}>
              <select value={visit.status} onChange={(event) => void setStatus(visit.id, event.target.value)}>
                {statuses.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
              <input
                type="datetime-local"
                defaultValue={localInput(visit.startsAt)}
                onBlur={(event) => {
                  if (event.target.value && event.target.value !== localInput(visit.startsAt)) void move(visit.id, event.target.value);
                }}
              />
              <button className={styles.quiet} type="button" onClick={() => void setStatus(visit.id, "cancelled")}>
                Cancel
              </button>
            </div>
          </article>
        ))}
        {visits.length === 0 ? <p className={styles.meta}>No visits on this day.</p> : null}
      </div>
    </section>
  );
}
