import type { Prisma, PrismaClient } from "@prisma/client";
import { collectSlots, loadSettings } from "./availability.js";
import { ApiError } from "./errors.js";
import { addDays, calendarDate } from "./slots.js";
import { notifyVisit, telegramVisitUrl } from "./telegram-bot.js";

const bookingInclude = {
  barber: true,
  client: true,
  services: true,
} as const;

type BookingRow = Prisma.BookingGetPayload<{ include: typeof bookingInclude }>;

function isSlotTaken(error: unknown) {
  const record = error as { message?: string; meta?: unknown };
  const message = String(record?.message ?? "");
  const meta = JSON.stringify(record?.meta ?? "");
  return message.includes("23P01") || meta.includes("23P01") || message.includes("bookings_no_overlap");
}

function durationFor(
  barber: { services: { serviceId: string; durationMin: number | null }[] },
  services: { id: string; durationMin: number }[],
  serviceIds: string[],
) {
  return serviceIds.reduce((sum, id) => {
    const link = barber.services.find((item) => item.serviceId === id);
    const service = services.find((item) => item.id === id);
    return sum + (link?.durationMin ?? service?.durationMin ?? 0);
  }, 0);
}

function priceFor(
  barber: { services: { serviceId: string; price: number | null }[] },
  services: { id: string; price: number }[],
  serviceIds: string[],
) {
  return serviceIds.reduce((sum, id) => {
    const link = barber.services.find((item) => item.serviceId === id);
    const service = services.find((item) => item.id === id);
    return sum + (link?.price ?? service?.price ?? 0);
  }, 0);
}

async function rejectMissingSlot(
  prisma: PrismaClient,
  input: { serviceIds: string[]; barberId: string; startsAt: Date },
  settings: { timeZone: string; horizonDays: number; minNoticeMin: number },
): Promise<never> {
  const date = calendarDate(input.startsAt, settings.timeZone);
  const open = await collectSlots(prisma, {
    serviceIds: input.serviceIds,
    barberId: input.barberId,
    date,
    now: new Date(),
    ignoreBookings: true,
  });
  const target = input.startsAt.toISOString();
  const held = open.barbers.some((barber) =>
    (open.byBarber.get(barber.id) ?? []).some((slot) => slot.startsAt === target),
  );
  if (held) throw new ApiError(409, "SLOT_TAKEN", "That hour was just taken");
  reasonForRejection(input.startsAt, date, settings);
}

function reasonForRejection(
  startsAt: Date,
  date: string,
  settings: { timeZone: string; horizonDays: number; minNoticeMin: number },
): never {
  const today = calendarDate(new Date(), settings.timeZone);
  const last = addDays(today, settings.horizonDays - 1);
  if (date > last) throw new ApiError(422, "TOO_FAR", "That day is outside the booking window");
  if (startsAt.getTime() < Date.now() + settings.minNoticeMin * 60000) {
    throw new ApiError(422, "TOO_SOON", "That hour is too soon");
  }
  throw new ApiError(422, "OUTSIDE_WORKING_HOURS", "That hour is not open");
}

export function toDto(booking: BookingRow) {
  return {
    id: booking.id,
    manageToken: booking.manageToken,
    status: booking.status,
    startsAt: booking.startsAt.toISOString(),
    endsAt: booking.endsAt.toISOString(),
    totalPrice: booking.totalPrice,
    totalDurationMin: booking.totalDurationMin,
    barber: { id: booking.barber.id, name: booking.barber.name },
    client: { id: booking.client.id, name: booking.client.name, phone: booking.client.phone },
    services: booking.services.map((service) => ({
      id: service.serviceId,
      name: service.name,
      durationMin: service.durationMin,
      price: service.price,
    })),
    telegramUrl: telegramVisitUrl(booking.manageToken),
  };
}

async function publish(prisma: PrismaClient, booking: BookingRow, kind: "created" | "cancelled" | "moved") {
  const dto = await withChangeFlag(prisma, booking);
  await notifyVisit(prisma, booking.id, kind).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Telegram send failed");
  });
  return dto;
}

async function withChangeFlag(prisma: PrismaClient, booking: BookingRow) {
  const settings = await loadSettings(prisma);
  const cutoff = booking.startsAt.getTime() - settings.cancelCutoffMin * 60000;
  return { ...toDto(booking), canChange: booking.status === "confirmed" && Date.now() <= cutoff };
}

export async function createBooking(
  prisma: PrismaClient,
  input: {
    serviceIds: string[];
    barberId: string;
    startsAt: Date;
    client: { name: string; phone: string; telegramId?: string };
    source?: "web" | "telegram" | "admin";
  },
) {
  const settings = await loadSettings(prisma);
  const date = calendarDate(input.startsAt, settings.timeZone);
  const collected = await collectSlots(prisma, {
    serviceIds: input.serviceIds,
    barberId: input.barberId,
    date,
    now: new Date(),
  });
  const target = input.startsAt.toISOString();
  const candidates = collected.barbers.filter((barber) =>
    (collected.byBarber.get(barber.id) ?? []).some((slot) => slot.startsAt === target),
  );
  if (candidates.length === 0) await rejectMissingSlot(prisma, input, settings);

  let taken = false;
  for (const barber of candidates) {
    const durationMin = durationFor(barber, collected.services, input.serviceIds);
    const price = priceFor(barber, collected.services, input.serviceIds);
    const endsAt = new Date(input.startsAt.getTime() + durationMin * 60000);
    const linked = input.client.telegramId ? await resolveClient(prisma, { ...input.client, telegramId: input.client.telegramId }) : null;
    try {
      const booking = await prisma.$transaction(async (tx) => {
        const client = linked ?? (await tx.client.create({
          data: { name: input.client.name, phone: input.client.phone },
        }));
        return tx.booking.create({
          data: {
            clientId: client.id,
            barberId: barber.id,
            startsAt: input.startsAt,
            endsAt,
            totalPrice: price,
            totalDurationMin: durationMin,
            status: "confirmed",
            source: input.source ?? (input.client.telegramId ? "telegram" : "web"),
            services: {
              create: input.serviceIds.map((id) => {
                const service = collected.services.find((item) => item.id === id);
                const link = barber.services.find((item) => item.serviceId === id);
                return {
                  serviceId: id,
                  name: service?.name ?? id,
                  durationMin: link?.durationMin ?? service?.durationMin ?? 0,
                  price: link?.price ?? service?.price ?? 0,
                };
              }),
            },
          },
          include: bookingInclude,
        });
      });
      return publish(prisma, booking, "created");
    } catch (error) {
      if (!isSlotTaken(error)) throw error;
      taken = true;
    }
  }
  if (taken) throw new ApiError(409, "SLOT_TAKEN", "That hour was just taken");
  await rejectMissingSlot(prisma, input, settings);
}

async function resolveClient(
  prisma: PrismaClient,
  client: { name: string; phone: string; telegramId: string },
) {
  const existing = await prisma.client.findUnique({ where: { telegramId: client.telegramId } });
  if (!existing) {
    return prisma.client.create({
      data: { name: client.name, phone: client.phone, telegramId: client.telegramId },
    });
  }
  return prisma.client.update({
    where: { id: existing.id },
    data: { name: client.name, phone: client.phone },
  });
}

export async function listTelegramBookings(prisma: PrismaClient, telegramId: string) {
  const client = await prisma.client.findUnique({ where: { telegramId } });
  if (!client) return [];
  const rows = await prisma.booking.findMany({
    where: { clientId: client.id },
    include: bookingInclude,
    orderBy: { startsAt: "desc" },
  });
  return Promise.all(rows.map((row) => withChangeFlag(prisma, row)));
}

export async function getBooking(prisma: PrismaClient, token: string) {
  const booking = await prisma.booking.findUnique({
    where: { manageToken: token },
    include: bookingInclude,
  });
  if (!booking) throw new ApiError(404, "NOT_FOUND", "Booking not found");
  return withChangeFlag(prisma, booking);
}

async function requireChangeable(prisma: PrismaClient, token: string) {
  const booking = await prisma.booking.findUnique({
    where: { manageToken: token },
    include: bookingInclude,
  });
  if (!booking) throw new ApiError(404, "NOT_FOUND", "Booking not found");
  if (booking.status !== "confirmed") throw new ApiError(422, "NOT_CONFIRMED", "This visit can no longer be changed");
  const settings = await loadSettings(prisma);
  if (Date.now() > booking.startsAt.getTime() - settings.cancelCutoffMin * 60000) {
    throw new ApiError(422, "TOO_LATE", "Changes close 30 minutes before the visit");
  }
  return booking;
}

async function loadConfirmed(prisma: PrismaClient, token: string, ignoreCutoff: boolean) {
  if (!ignoreCutoff) return requireChangeable(prisma, token);
  const booking = await prisma.booking.findUnique({ where: { manageToken: token }, include: bookingInclude });
  if (!booking) throw new ApiError(404, "NOT_FOUND", "Booking not found");
  if (booking.status !== "confirmed") throw new ApiError(422, "NOT_CONFIRMED", "This visit can no longer be changed");
  return booking;
}

export async function cancelBooking(prisma: PrismaClient, token: string, ignoreCutoff = false) {
  const booking = await loadConfirmed(prisma, token, ignoreCutoff);
  const updated = await prisma.booking.update({
    where: { id: booking.id },
    data: { status: "cancelled" },
    include: bookingInclude,
  });
  return publish(prisma, updated, "cancelled");
}

export async function rescheduleBooking(prisma: PrismaClient, token: string, startsAt: Date, ignoreCutoff = false) {
  const booking = await loadConfirmed(prisma, token, ignoreCutoff);
  const serviceIds = booking.services.map((service) => service.serviceId);
  const settings = await loadSettings(prisma);
  const date = calendarDate(startsAt, settings.timeZone);
  const collected = await collectSlots(prisma, {
    serviceIds,
    barberId: booking.barberId,
    date,
    now: new Date(),
    ignoreBookingId: booking.id,
  });
  const target = startsAt.toISOString();
  const barber = collected.barbers.find((item) =>
    (collected.byBarber.get(item.id) ?? []).some((slot) => slot.startsAt === target),
  );
  if (!barber) {
    await rejectMissingSlot(prisma, { serviceIds, barberId: booking.barberId, startsAt }, settings);
    return;
  }
  const durationMin = durationFor(barber, collected.services, serviceIds);
  const endsAt = new Date(startsAt.getTime() + durationMin * 60000);
  try {
    const updated = await prisma.booking.update({
      where: { id: booking.id },
      data: {
        startsAt,
        endsAt,
        totalDurationMin: durationMin,
        reminderDaySentAt: null,
        reminder30mSentAt: null,
      },
      include: bookingInclude,
    });
    return publish(prisma, updated, "moved");
  } catch (error) {
    if (isSlotTaken(error)) throw new ApiError(409, "SLOT_TAKEN", "That hour was just taken");
    throw error;
  }
}
