import type { PrismaClient } from "@prisma/client";
import { ApiError } from "./errors.js";
import { addDays, calendarDate, isoWeekday, slotsForBarber, totalDuration, type MinuteSpan, type Slot } from "./slots.js";

type Db = PrismaClient;

export type SalonSettings = {
  slotStepMin: number;
  minNoticeMin: number;
  horizonDays: number;
  cancelCutoffMin: number;
  timeZone: string;
};

function minutesOf(value: Date) {
  return value.getUTCHours() * 60 + value.getUTCMinutes();
}

export async function loadSettings(prisma: Db): Promise<SalonSettings> {
  const rows = await prisma.setting.findMany();
  const map = new Map(rows.map((row) => [row.key, row.value]));
  const read = (key: string, fallback: number) => {
    const value = Number(map.get(key));
    return Number.isFinite(value) && value > 0 ? value : fallback;
  };
  return {
    slotStepMin: read("slot_step_min", 15),
    minNoticeMin: read("min_notice_min", 30),
    horizonDays: read("booking_horizon_days", 30),
    cancelCutoffMin: read("cancel_cutoff_min", 30),
    timeZone: map.get("timezone") || "Asia/Tashkent",
  };
}

async function loadContext(prisma: Db, serviceIds: string[], barberId: string, rangeStart: Date, rangeEnd: Date) {
  const services = await prisma.service.findMany({
    where: { id: { in: serviceIds }, isActive: true },
  });
  if (services.length !== serviceIds.length) {
    throw new ApiError(422, "UNKNOWN_SERVICE", "One of the services is not available");
  }

  const barbers = await prisma.barber.findMany({
    where: {
      isActive: true,
      ...(barberId === "any" ? {} : { id: barberId }),
      AND: serviceIds.map((id) => ({
        services: { some: { serviceId: id, isEnabled: true } },
      })),
    },
    include: {
      hours: true,
      breaks: true,
      services: { where: { serviceId: { in: serviceIds }, isEnabled: true } },
    },
    orderBy: { sortOrder: "asc" },
  });

  if (barberId !== "any" && barbers.length === 0) {
    throw new ApiError(422, "BARBER_UNAVAILABLE", "This barber does not offer that service");
  }

  const ids = barbers.map((barber) => barber.id);
  const [timeOff, bookings] = await Promise.all([
    prisma.timeOff.findMany({
      where: {
        startsAt: { lt: rangeEnd },
        endsAt: { gt: rangeStart },
        OR: [{ barberId: null }, { barberId: { in: ids } }],
      },
    }),
    prisma.booking.findMany({
      where: {
        status: "confirmed",
        barberId: { in: ids },
        startsAt: { lt: rangeEnd },
        endsAt: { gt: rangeStart },
      },
    }),
  ]);

  return { services, barbers, timeOff, bookings };
}

function spans(rows: { weekday: number; startTime: Date; endTime: Date }[], weekday: number): MinuteSpan[] {
  return rows
    .filter((row) => row.weekday === weekday)
    .map((row) => ({ startMin: minutesOf(row.startTime), endMin: minutesOf(row.endTime) }));
}

export async function collectSlots(
  prisma: Db,
  input: {
    serviceIds: string[];
    barberId: string;
    date: string;
    now: Date;
    ignoreBookingId?: string;
    ignoreBookings?: boolean;
  },
) {
  const settings = await loadSettings(prisma);
  const dayStart = new Date(`${input.date}T00:00:00.000Z`);
  const rangeStart = new Date(dayStart.getTime() - 24 * 60 * 60 * 1000);
  const rangeEnd = new Date(dayStart.getTime() + 2 * 24 * 60 * 60 * 1000);
  const { services, barbers, timeOff, bookings } = await loadContext(
    prisma,
    input.serviceIds,
    input.barberId,
    rangeStart,
    rangeEnd,
  );
  const weekday = isoWeekday(input.date);
  const byBarber = new Map<string, Slot[]>();

  for (const barber of barbers) {
    const durationMin = totalDuration(
      input.serviceIds.map((id) => {
        const link = barber.services.find((item) => item.serviceId === id);
        const service = services.find((item) => item.id === id);
        return link?.durationMin ?? service?.durationMin ?? 0;
      }),
    );
    const slots = slotsForBarber({
      date: input.date,
      now: input.now,
      timeZone: settings.timeZone,
      stepMin: settings.slotStepMin,
      minNoticeMin: settings.minNoticeMin,
      horizonDays: settings.horizonDays,
      barber: {
        durationMin,
        hours: spans(barber.hours, weekday),
        breaks: spans(barber.breaks, weekday),
      },
      timeOff: timeOff
        .filter((item) => item.barberId === null || item.barberId === barber.id)
        .map((item) => ({ start: item.startsAt, end: item.endsAt })),
      bookings: input.ignoreBookings
        ? []
        : bookings
            .filter((item) => item.barberId === barber.id && item.id !== input.ignoreBookingId)
            .map((item) => ({ start: item.startsAt, end: item.endsAt })),
    });
    byBarber.set(barber.id, slots);
  }

  const merged = new Map<string, Slot>();
  for (const slots of byBarber.values()) {
    for (const slot of slots) merged.set(slot.startsAt, slot);
  }
  const list = [...merged.values()].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  return { settings, services, barbers, byBarber, slots: list };
}

export async function listDays(prisma: Db, serviceIds: string[], barberId: string, now = new Date()) {
  const settings = await loadSettings(prisma);
  const today = calendarDate(now, settings.timeZone);
  const last = addDays(today, settings.horizonDays - 1);
  const rangeStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const rangeEnd = new Date(now.getTime() + (settings.horizonDays + 2) * 24 * 60 * 60 * 1000);
  const { services, barbers, timeOff, bookings } = await loadContext(prisma, serviceIds, barberId, rangeStart, rangeEnd);

  const days: { date: string; open: boolean }[] = [];
  for (let date = today; date <= last; date = addDays(date, 1)) {
    const weekday = isoWeekday(date);
    let open = false;
    for (const barber of barbers) {
      const durationMin = totalDuration(
        serviceIds.map((id) => {
          const link = barber.services.find((item) => item.serviceId === id);
          const service = services.find((item) => item.id === id);
          return link?.durationMin ?? service?.durationMin ?? 0;
        }),
      );
      const slots = slotsForBarber({
        date,
        now,
        timeZone: settings.timeZone,
        stepMin: settings.slotStepMin,
        minNoticeMin: settings.minNoticeMin,
        horizonDays: settings.horizonDays,
        barber: {
          durationMin,
          hours: spans(barber.hours, weekday),
          breaks: spans(barber.breaks, weekday),
        },
        timeOff: timeOff
          .filter((item) => item.barberId === null || item.barberId === barber.id)
          .map((item) => ({ start: item.startsAt, end: item.endsAt })),
        bookings: bookings
          .filter((item) => item.barberId === barber.id)
          .map((item) => ({ start: item.startsAt, end: item.endsAt })),
      });
      if (slots.length > 0) {
        open = true;
        break;
      }
    }
    days.push({ date, open });
  }
  return days;
}
