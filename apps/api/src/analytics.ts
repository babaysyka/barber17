import { addDays, isoWeekday, zonedToUtc } from "./slots.js";

export type AnalyticsStatus = "confirmed" | "completed" | "cancelled" | "no_show";

export type AnalyticsBooking = {
  clientId: string;
  barberId: string;
  startsAt: string;
  status: AnalyticsStatus;
  totalPrice: number;
  totalDurationMin: number;
  services: { serviceId: string; name: string; price: number }[];
};

export type AnalyticsBarber = {
  id: string;
  name: string;
  hours: { weekday: number; startMin: number; endMin: number }[];
  breaks: { weekday: number; startMin: number; endMin: number }[];
};

export type AnalyticsTimeOff = {
  barberId: string | null;
  startsAt: string;
  endsAt: string;
};

const occupied = new Set<AnalyticsStatus>(["confirmed", "completed", "no_show"]);

function punch(intervals: [number, number][], cutStart: number, cutEnd: number) {
  const next: [number, number][] = [];
  for (const [start, end] of intervals) {
    if (cutEnd <= start || cutStart >= end) next.push([start, end]);
    else {
      if (cutStart > start) next.push([start, cutStart]);
      if (cutEnd < end) next.push([cutEnd, end]);
    }
  }
  return next;
}

export function availableMinutes(
  barber: AnalyticsBarber,
  from: string,
  to: string,
  timeOff: AnalyticsTimeOff[],
  timeZone: string,
) {
  let total = 0;
  for (let date = from; date <= to; date = addDays(date, 1)) {
    const weekday = isoWeekday(date);
    for (const span of barber.hours.filter((row) => row.weekday === weekday)) {
      const workStart = zonedToUtc(date, span.startMin, timeZone).getTime();
      const workEnd = zonedToUtc(date, span.endMin, timeZone).getTime();
      let open: [number, number][] = [[workStart, workEnd]];
      for (const pause of barber.breaks.filter((row) => row.weekday === weekday)) {
        open = punch(open, zonedToUtc(date, pause.startMin, timeZone).getTime(), zonedToUtc(date, pause.endMin, timeZone).getTime());
      }
      for (const off of timeOff) {
        if (off.barberId && off.barberId !== barber.id) continue;
        open = punch(open, new Date(off.startsAt).getTime(), new Date(off.endsAt).getTime());
      }
      total += open.reduce((sum, [start, end]) => sum + (end - start) / 60000, 0);
    }
  }
  return total;
}

function rate(part: number, whole: number) {
  if (!whole) return 0;
  return Math.round((part / whole) * 10000) / 10000;
}

export function summarize(input: {
  from: string;
  to: string;
  timeZone: string;
  bookings: AnalyticsBooking[];
  barbers: AnalyticsBarber[];
  timeOff: AnalyticsTimeOff[];
  priorClientIds: string[];
}) {
  const fromUtc = zonedToUtc(input.from, 0, input.timeZone).getTime();
  const toUtc = zonedToUtc(addDays(input.to, 1), 0, input.timeZone).getTime();
  const rows = input.bookings.filter((row) => {
    const start = new Date(row.startsAt).getTime();
    return start >= fromUtc && start < toUtc;
  });
  const completed = rows.filter((row) => row.status === "completed");
  const counts = {
    total: rows.length,
    completed: completed.length,
    confirmed: rows.filter((row) => row.status === "confirmed").length,
    cancelled: rows.filter((row) => row.status === "cancelled").length,
    noShow: rows.filter((row) => row.status === "no_show").length,
  };
  const services = new Map<string, { serviceId: string; name: string; count: number; revenue: number }>();
  for (const row of rows) {
    for (const service of row.services) {
      const current = services.get(service.serviceId) ?? { serviceId: service.serviceId, name: service.name, count: 0, revenue: 0 };
      current.count += 1;
      if (row.status === "completed") current.revenue += service.price;
      services.set(service.serviceId, current);
    }
  }
  const prior = new Set(input.priorClientIds);
  const clients = new Set(rows.map((row) => row.clientId));
  let returning = 0;
  for (const clientId of clients) if (prior.has(clientId)) returning += 1;
  const heatmap = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
  for (const row of rows) {
    if (!occupied.has(row.status)) continue;
    const date = new Intl.DateTimeFormat("en-CA", { timeZone: input.timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(row.startsAt));
    const hourPart = new Intl.DateTimeFormat("en-GB", { timeZone: input.timeZone, hour: "2-digit", hourCycle: "h23" }).formatToParts(new Date(row.startsAt));
    const hourText = hourPart.find((part) => part.type === "hour")?.value ?? "0";
    const hour = hourText === "24" ? 0 : Number(hourText);
    heatmap[isoWeekday(date) - 1][hour] += 1;
  }
  return {
    from: input.from,
    to: input.to,
    revenue: completed.reduce((sum, row) => sum + row.totalPrice, 0),
    bookings: counts,
    cancellations: { count: counts.cancelled, rate: rate(counts.cancelled, counts.total) },
    noShows: { count: counts.noShow, rate: rate(counts.noShow, counts.total) },
    services: [...services.values()].sort((left, right) => right.count - left.count || left.name.localeCompare(right.name)),
    barbers: input.barbers.map((barber) => {
      const mine = rows.filter((row) => row.barberId === barber.id && occupied.has(row.status));
      const occupiedMin = mine.reduce((sum, row) => sum + row.totalDurationMin, 0);
      const openMin = availableMinutes(barber, input.from, input.to, input.timeOff, input.timeZone);
      return {
        barberId: barber.id,
        name: barber.name,
        occupiedMin,
        availableMin: openMin,
        load: openMin ? Math.round((occupiedMin / openMin) * 1000) / 10 : 0,
      };
    }),
    retention: { clients: clients.size, returning, rate: rate(returning, clients.size) },
    heatmap,
  };
}
