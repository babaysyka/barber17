import { useEffect, useState, type FormEvent } from "react";
import { ApiFailure, api } from "./api";
import { bootTelegram } from "./telegram";

type Service = { id: string; name: string; description: string | null; durationMin: number; price: number };
type Barber = { id: string; name: string; experienceYears: number };
type DayItem = { date: string; open: boolean };
type Slot = { startsAt: string; label: string };
type Visit = {
  manageToken: string;
  status: string;
  startsAt: string;
  totalPrice: number;
  totalDurationMin: number;
  canChange: boolean;
  barber: { id: string; name: string };
  services: { id: string; name: string }[];
};

const STEPS = ["service", "barber", "date", "time", "you"] as const;
type Step = (typeof STEPS)[number] | "done";
const ANY = "any";

function money(price: number) {
  return `${price.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ")} UZS`;
}

function dayParts(iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const format = (options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("en-GB", { ...options, timeZone: "UTC" }).format(date);
  return { weekday: format({ weekday: "short" }), day: format({ day: "numeric" }), month: format({ month: "short" }) };
}

function visitWhen(iso: string) {
  const date = new Date(iso);
  const day = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Tashkent",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(date);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Tashkent",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const bag = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return { day, time: `${bag.hour === "24" ? "00" : bag.hour}:${bag.minute}` };
}

export function App() {
  const [screen, setScreen] = useState<"book" | "visits">("book");
  const [initData, setInitData] = useState("");
  const [guestName, setGuestName] = useState("");
  const [services, setServices] = useState<Service[] | null>(null);
  const [barbers, setBarbers] = useState<Barber[] | null>(null);
  const [catalogError, setCatalogError] = useState("");
  const [step, setStep] = useState<Step>("service");
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [barberId, setBarberId] = useState<string | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [days, setDays] = useState<DayItem[]>([]);
  const [daysStatus, setDaysStatus] = useState<"idle" | "loading" | "error">("idle");
  const [slots, setSlots] = useState<Slot[]>([]);
  const [slotStatus, setSlotStatus] = useState<"idle" | "loading" | "empty" | "error">("idle");
  const [startsAt, setStartsAt] = useState<string | null>(null);
  const [timeLabel, setTimeLabel] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [nameError, setNameError] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [held, setHeld] = useState<{ barber: string; when: string; telegramUrl: string | null } | null>(null);

  useEffect(() => {
    const data = bootTelegram();
    setInitData(data);
    const controller = new AbortController();
    Promise.all([
      api<Service[]>("/api/v1/services", { signal: controller.signal }),
      api<Barber[]>("/api/v1/barbers", { signal: controller.signal }),
    ])
      .then(([nextServices, nextBarbers]) => {
        setServices(nextServices);
        setBarbers(nextBarbers);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setCatalogError("The list did not load.");
        setServices([]);
        setBarbers([]);
      });
    if (data) {
      api<{ client: { name: string } }>("/api/v1/telegram/session", {
        method: "POST",
        body: JSON.stringify({ initData: data }),
        signal: controller.signal,
      })
        .then((session) => {
          setGuestName(session.client.name);
          setName(session.client.name);
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === "AbortError") return;
        });
    }
    return () => controller.abort();
  }, []);

  const service = services?.find((item) => item.id === serviceId) ?? null;
  const barber = barberId === ANY ? null : (barbers?.find((item) => item.id === barberId) ?? null);
  const barberLabel = barberId === ANY ? "Any available" : (barber?.name ?? "");

  async function loadDays(nextService = serviceId, nextBarber = barberId) {
    if (!nextService || !nextBarber) return;
    setDaysStatus("loading");
    try {
      const body = await api<{ days: DayItem[] }>(
        `/api/v1/availability/days?serviceIds=${encodeURIComponent(nextService)}&barberId=${encodeURIComponent(nextBarber)}`,
      );
      setDays(body.days);
      setDaysStatus("idle");
    } catch {
      setDaysStatus("error");
    }
  }

  async function loadTimes(iso: string, nextService = serviceId, nextBarber = barberId) {
    if (!nextService || !nextBarber) return;
    setStartsAt(null);
    setTimeLabel(null);
    setSlotStatus("loading");
    try {
      const body = await api<{ slots: Slot[] }>(
        `/api/v1/availability?serviceIds=${encodeURIComponent(nextService)}&barberId=${encodeURIComponent(nextBarber)}&date=${iso}`,
      );
      setSlots(body.slots);
      setSlotStatus(body.slots.length === 0 ? "empty" : "idle");
    } catch {
      setSlotStatus("error");
    }
  }

  function goNext() {
    const index = STEPS.indexOf(step as (typeof STEPS)[number]);
    const next = STEPS[index + 1];
    if (next === "date") void loadDays();
    if (next) setStep(next);
  }

  function goBack() {
    const index = STEPS.indexOf(step as (typeof STEPS)[number]);
    const previous = STEPS[index - 1];
    if (previous) setStep(previous);
  }

  function canContinue() {
    if (step === "service") return Boolean(serviceId);
    if (step === "barber") return Boolean(barberId);
    if (step === "date") return Boolean(date && days.some((item) => item.date === date && item.open));
    if (step === "time") return Boolean(startsAt);
    return false;
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const nextName = name.trim();
    const digits = phone.replace(/\D/g, "");
    const nextNameError = nextName.length < 2 ? "Enter your name." : "";
    const nextPhoneError = digits.length < 9 ? "Enter a phone number." : "";
    setNameError(nextNameError);
    setPhoneError(nextPhoneError);
    setSubmitError("");
    if (nextNameError || nextPhoneError || !serviceId || !barberId || !startsAt) return;
    setSubmitting(true);
    try {
      const body = await api<{ barber: { name: string }; startsAt: string; telegramUrl?: string | null }>(
        "/api/v1/bookings",
        {
          method: "POST",
          body: JSON.stringify({
            serviceIds: [serviceId],
            barberId,
            startsAt,
            client: { name: nextName, phone: phone.trim() },
          }),
        },
        initData || undefined,
      );
      const when = visitWhen(body.startsAt);
      setHeld({ barber: body.barber.name, when: `${when.day}, ${when.time}`, telegramUrl: body.telegramUrl ?? null });
      setStep("done");
    } catch (error) {
      if (error instanceof ApiFailure && error.code === "SLOT_TAKEN") {
        setSubmitError("That hour was just taken.");
        setStep("time");
        if (date) void loadTimes(date);
        return;
      }
      setSubmitError(error instanceof ApiFailure ? error.message : "The visit was not saved.");
    } finally {
      setSubmitting(false);
    }
  }

  function reset() {
    setStep("service");
    setServiceId(null);
    setBarberId(null);
    setDate(null);
    setStartsAt(null);
    setTimeLabel(null);
    setPhone("");
    setName(guestName);
    setNameError("");
    setPhoneError("");
    setSubmitError("");
    setHeld(null);
    setDays([]);
    setSlots([]);
  }

  return (
    <div className="app">
      <header className="top">
        <p className="mark">Orda</p>
        <nav className="switch" aria-label="Sections">
          <button type="button" aria-pressed={screen === "book"} onClick={() => setScreen("book")}>
            Book
          </button>
          <button type="button" aria-pressed={screen === "visits"} onClick={() => setScreen("visits")}>
            My visits
          </button>
        </nav>
      </header>

      {screen === "visits" ? (
        <Visits initData={initData} />
      ) : (
        <main>
          {step === "done" && held ? (
            <section className="held">
              <p className="quiet">The chair is held.</p>
              <h1>{timeLabel}</h1>
              <p>
                {service?.name} with {held.barber}
                <br />
                {held.when}
              </p>
              {held.telegramUrl ? (
                <a className="text" href={held.telegramUrl} rel="noreferrer">
                  Open in Telegram
                </a>
              ) : null}
              <button className="text" type="button" onClick={reset}>
                Book another
              </button>
            </section>
          ) : (
            <>
              <h1>
                {step === "service" ? "Choose the work." : null}
                {step === "barber" ? "Choose the hands." : null}
                {step === "date" ? "Choose the day." : null}
                {step === "time" ? "Choose the hour." : null}
                {step === "you" ? "Leave a name." : null}
              </h1>
              {catalogError ? <p className="quiet">{catalogError}</p> : null}

              {step === "service" ? (
                <ul className="choices">
                  {(services ?? []).map((item) => (
                    <li key={item.id}>
                      <button type="button" aria-pressed={serviceId === item.id} onClick={() => setServiceId(item.id)}>
                        <span>{item.name}</span>
                        <small>
                          {item.durationMin} min · {money(item.price)}
                        </small>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}

              {step === "barber" ? (
                <ul className="choices">
                  <li>
                    <button type="button" aria-pressed={barberId === ANY} onClick={() => setBarberId(ANY)}>
                      <span>Any available</span>
                      <small>The first open chair</small>
                    </button>
                  </li>
                  {(barbers ?? []).map((item) => (
                    <li key={item.id}>
                      <button type="button" aria-pressed={barberId === item.id} onClick={() => setBarberId(item.id)}>
                        <span>{item.name}</span>
                        <small>{item.experienceYears} years</small>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}

              {step === "date" ? (
                <>
                  {daysStatus === "loading" ? <p className="quiet">Looking for open days.</p> : null}
                  {daysStatus === "error" ? (
                    <p className="quiet">
                      Days did not load.{" "}
                      <button className="text" type="button" onClick={() => void loadDays()}>
                        Try again
                      </button>
                    </p>
                  ) : null}
                  <div className="days">
                    {days.map((item) => {
                      const parts = dayParts(item.date);
                      return (
                        <button
                          key={item.date}
                          type="button"
                          className="day"
                          disabled={!item.open}
                          aria-pressed={date === item.date}
                          onClick={() => {
                            setDate(item.date);
                            void loadTimes(item.date);
                          }}
                        >
                          <span>{parts.weekday}</span>
                          <strong>{parts.day}</strong>
                          <span>{parts.month}</span>
                        </button>
                      );
                    })}
                  </div>
                </>
              ) : null}

              {step === "time" ? (
                <>
                  {slotStatus === "loading" ? <p className="quiet">Looking for an open chair.</p> : null}
                  {slotStatus === "empty" ? <p className="quiet">No open chairs on this day.</p> : null}
                  {slotStatus === "error" ? (
                    <p className="quiet">
                      Times did not load.{" "}
                      <button className="text" type="button" onClick={() => date && void loadTimes(date)}>
                        Try again
                      </button>
                    </p>
                  ) : null}
                  <div className="hours">
                    {slots.map((slot) => (
                      <button
                        key={slot.startsAt}
                        type="button"
                        aria-pressed={startsAt === slot.startsAt}
                        onClick={() => {
                          setStartsAt(slot.startsAt);
                          setTimeLabel(slot.label);
                        }}
                      >
                        {slot.label}
                      </button>
                    ))}
                  </div>
                </>
              ) : null}

              {step === "you" ? (
                <form id="details" onSubmit={(event) => void submit(event)}>
                  <p className="summary">
                    {service?.name} · {barberLabel}
                    <br />
                    {date ? dayParts(date).weekday : ""} {timeLabel}
                  </p>
                  <label>
                    Name
                    <input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" />
                  </label>
                  {nameError ? <p className="quiet">{nameError}</p> : null}
                  <label>
                    Phone
                    <input value={phone} onChange={(event) => setPhone(event.target.value)} inputMode="tel" autoComplete="tel" />
                  </label>
                  {phoneError ? <p className="quiet">{phoneError}</p> : null}
                </form>
              ) : null}

              {submitError ? <p className="quiet">{submitError}</p> : null}

              <div className="actions">
                {step !== "service" ? (
                  <button className="text" type="button" onClick={goBack}>
                    Back
                  </button>
                ) : null}
                {step === "you" ? (
                  <button className="cta" type="submit" form="details" disabled={submitting}>
                    {submitting ? "Holding the chair" : "Hold this chair"}
                  </button>
                ) : (
                  <button className="cta" type="button" disabled={!canContinue()} onClick={goNext}>
                    Continue
                  </button>
                )}
              </div>
            </>
          )}
        </main>
      )}
    </div>
  );
}

function Visits({ initData }: { initData: string }) {
  const [visits, setVisits] = useState<Visit[] | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [moving, setMoving] = useState<string | null>(null);
  const [days, setDays] = useState<DayItem[]>([]);
  const [date, setDate] = useState<string | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [busy, setBusy] = useState(false);

  async function load() {
    if (!initData) return;
    setError("");
    try {
      const body = await api<{ bookings: Visit[] }>("/api/v1/telegram/bookings", undefined, initData);
      setVisits(body.bookings);
    } catch (reason) {
      setVisits([]);
      setError(reason instanceof ApiFailure ? reason.message : "Visits did not load.");
    }
  }

  useEffect(() => {
    if (!initData) return;
    const controller = new AbortController();
    api<{ bookings: Visit[] }>("/api/v1/telegram/bookings", { signal: controller.signal }, initData)
      .then((body) => setVisits(body.bookings))
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setVisits([]);
        setError(reason instanceof ApiFailure ? reason.message : "Visits did not load.");
      });
    return () => controller.abort();
  }, [initData]);

  async function cancel(token: string) {
    setBusy(true);
    setMessage("");
    try {
      await api(`/api/v1/bookings/${token}/cancel`, { method: "POST" });
      await load();
    } catch (reason) {
      setMessage(reason instanceof ApiFailure ? reason.message : "The visit was not cancelled.");
    } finally {
      setBusy(false);
    }
  }

  async function openMove(visit: Visit) {
    setMoving(visit.manageToken);
    setDate(null);
    setSlots([]);
    setMessage("");
    const serviceIds = visit.services.map((service) => service.id).join(",");
    try {
      const body = await api<{ days: DayItem[] }>(
        `/api/v1/availability/days?serviceIds=${encodeURIComponent(serviceIds)}&barberId=${encodeURIComponent(visit.barber.id)}`,
      );
      setDays(body.days);
    } catch {
      setMessage("Days did not load.");
    }
  }

  async function chooseDate(visit: Visit, iso: string) {
    setDate(iso);
    const serviceIds = visit.services.map((service) => service.id).join(",");
    try {
      const body = await api<{ slots: Slot[] }>(
        `/api/v1/availability?serviceIds=${encodeURIComponent(serviceIds)}&barberId=${encodeURIComponent(visit.barber.id)}&date=${iso}`,
      );
      setSlots(body.slots);
      if (body.slots.length === 0) setMessage("No open chairs on this day.");
    } catch {
      setMessage("Times did not load.");
    }
  }

  async function moveTo(token: string, nextStart: string) {
    setBusy(true);
    setMessage("");
    try {
      await api(`/api/v1/bookings/${token}/reschedule`, {
        method: "POST",
        body: JSON.stringify({ startsAt: nextStart }),
      });
      setMoving(null);
      await load();
    } catch (reason) {
      setMessage(reason instanceof ApiFailure && reason.code === "SLOT_TAKEN" ? "That hour was just taken." : reason instanceof ApiFailure ? reason.message : "The visit was not moved.");
    } finally {
      setBusy(false);
    }
  }

  if (!initData) {
    return (
      <main>
        <h1>Your visits live in Telegram.</h1>
        <p className="quiet">Open Orda from the bot to see, cancel, or move a chair booked in your name.</p>
      </main>
    );
  }

  return (
    <main>
      <h1>Your visits.</h1>
      {visits === null ? <p className="quiet">Opening your visits.</p> : null}
      {error ? <p className="quiet">{error}</p> : null}
      {message ? <p className="quiet">{message}</p> : null}
      {visits && visits.length === 0 ? <p className="quiet">No visits yet.</p> : null}
      <ul className="visits">
        {(visits ?? []).map((visit) => {
          const when = visitWhen(visit.startsAt);
          return (
            <li key={visit.manageToken}>
              <p className="hour">{when.time}</p>
              <p>
                {visit.services.map((service) => service.name).join(", ")}
                <br />
                {visit.barber.name}
                <br />
                {when.day}
                {visit.status !== "confirmed" ? ` · ${visit.status}` : ""}
              </p>
              {visit.canChange ? (
                <div className="row">
                  <button className="text" type="button" disabled={busy} onClick={() => void cancel(visit.manageToken)}>
                    Cancel
                  </button>
                  <button className="text" type="button" disabled={busy} onClick={() => void openMove(visit)}>
                    Move
                  </button>
                </div>
              ) : null}
              {moving === visit.manageToken ? (
                <>
                  <div className="days">
                    {days.map((item) => {
                      const parts = dayParts(item.date);
                      return (
                        <button
                          key={item.date}
                          type="button"
                          className="day"
                          disabled={!item.open || busy}
                          aria-pressed={date === item.date}
                          onClick={() => void chooseDate(visit, item.date)}
                        >
                          <span>{parts.weekday}</span>
                          <strong>{parts.day}</strong>
                          <span>{parts.month}</span>
                        </button>
                      );
                    })}
                  </div>
                  <div className="hours">
                    {slots.map((slot) => (
                      <button key={slot.startsAt} type="button" disabled={busy} onClick={() => void moveTo(visit.manageToken, slot.startsAt)}>
                        {slot.label}
                      </button>
                    ))}
                  </div>
                </>
              ) : null}
            </li>
          );
        })}
      </ul>
    </main>
  );
}
