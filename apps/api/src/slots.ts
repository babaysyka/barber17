export type MinuteSpan = { startMin: number; endMin: number };

export type BarberDay = {
  durationMin: number;
  hours: MinuteSpan[];
  breaks: MinuteSpan[];
};

export type Slot = { startsAt: string; label: string };

const DAY_MINUTES = 24 * 60;

export function totalDuration(parts: number[]) {
  return parts.reduce((sum, minutes) => sum + minutes, 0);
}

export function calendarDate(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function addDays(iso: string, days: number) {
  const [year, month, day] = iso.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + days));
  const y = next.getUTCFullYear();
  const m = String(next.getUTCMonth() + 1).padStart(2, "0");
  const d = String(next.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function isoWeekday(iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  const js = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return js === 0 ? 7 : js;
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function offsetMinutes(timeZone: string, instant: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const bag = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const hour = bag.hour === "24" ? 0 : Number(bag.hour);
  const asUtc = Date.UTC(Number(bag.year), Number(bag.month) - 1, Number(bag.day), hour, Number(bag.minute), Number(bag.second));
  return (asUtc - instant.getTime()) / 60000;
}

export function zonedToUtc(iso: string, minutes: number, timeZone: string) {
  const [year, month, day] = iso.split("-").map(Number);
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  return new Date(guess.getTime() - offsetMinutes(timeZone, guess) * 60000);
}

export function clockLabel(instant: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const bag = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const hour = bag.hour === "24" ? "00" : bag.hour;
  return `${hour}:${bag.minute}`;
}

function subtract(windows: MinuteSpan[], block: MinuteSpan) {
  const next: MinuteSpan[] = [];
  for (const window of windows) {
    if (block.endMin <= window.startMin || block.startMin >= window.endMin) {
      next.push(window);
      continue;
    }
    if (block.startMin > window.startMin) next.push({ startMin: window.startMin, endMin: block.startMin });
    if (block.endMin < window.endMin) next.push({ startMin: block.endMin, endMin: window.endMin });
  }
  return next.filter((window) => window.endMin > window.startMin);
}

function clipToDay(start: Date, end: Date, dayStart: Date) {
  const from = Math.max(start.getTime(), dayStart.getTime());
  const to = Math.min(end.getTime(), dayStart.getTime() + DAY_MINUTES * 60000);
  if (to <= from) return null;
  return {
    startMin: (from - dayStart.getTime()) / 60000,
    endMin: (to - dayStart.getTime()) / 60000,
  };
}

export function slotsForBarber(input: {
  date: string;
  now: Date;
  timeZone: string;
  stepMin: number;
  minNoticeMin: number;
  horizonDays: number;
  barber: BarberDay;
  timeOff: { start: Date; end: Date }[];
  bookings: { start: Date; end: Date }[];
}): Slot[] {
  const today = calendarDate(input.now, input.timeZone);
  const last = addDays(today, Math.max(input.horizonDays, 1) - 1);
  if (input.date < today || input.date > last) return [];

  let windows = input.barber.hours.map((hour) => ({ ...hour }));
  for (const gap of input.barber.breaks) windows = subtract(windows, gap);

  const dayStart = zonedToUtc(input.date, 0, input.timeZone);
  for (const block of input.timeOff) {
    const clipped = clipToDay(block.start, block.end, dayStart);
    if (clipped) windows = subtract(windows, clipped);
  }
  for (const block of input.bookings) {
    const clipped = clipToDay(block.start, block.end, dayStart);
    if (clipped) windows = subtract(windows, clipped);
  }

  const earliest = input.now.getTime() + input.minNoticeMin * 60000;
  const slots: Slot[] = [];
  for (const window of windows) {
    const first = Math.ceil(window.startMin / input.stepMin) * input.stepMin;
    for (let startMin = first; startMin + input.barber.durationMin <= window.endMin; startMin += input.stepMin) {
      const startsAt = zonedToUtc(input.date, startMin, input.timeZone);
      if (startsAt.getTime() < earliest) continue;
      slots.push({ startsAt: startsAt.toISOString(), label: clockLabel(startsAt, input.timeZone) });
    }
  }
  return slots;
}
