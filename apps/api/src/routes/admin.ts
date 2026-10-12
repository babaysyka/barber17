import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { randomUUID } from "node:crypto";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import multipart from "@fastify/multipart";
import type { Prisma, PrismaClient } from "@prisma/client";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import {
  assertLoginAllowed,
  hashPassword,
  requireAdmin,
  sessionCookie,
  signSession,
  verifyPassword,
} from "../admin-auth.js";
import { summarize } from "../analytics.js";
import { cancelBooking, createBooking, rescheduleBooking } from "../bookings.js";
import { ApiError } from "../errors.js";
import { addDays, zonedToUtc } from "../slots.js";
import { issueBarberLinkCode } from "../telegram-bot.js";

const timeZone = "Asia/Tashkent";
const uploadDir = resolve(fileURLToPath(new URL("../../../web/public/images/uploads", import.meta.url)));

const loginBody = z.object({ login: z.string().min(1), password: z.string().min(1) });
const serviceBody = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/).optional(),
  name: z.string().min(1),
  description: z.string(),
  durationMin: z.number().int().min(5).max(480),
  price: z.number().int().min(0),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});
const barberBody = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/).optional(),
  name: z.string().min(1),
  bio: z.string(),
  experienceYears: z.number().int().min(0).max(80),
  photoUrl: z.string().optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});
const bookingBody = z.object({
  serviceIds: z.array(z.string().min(1)).min(1),
  barberId: z.string().min(1),
  startsAt: z.string().min(1),
  clientName: z.string().min(1),
  clientPhone: z.string().min(1),
});
const statusBody = z.object({ status: z.enum(["confirmed", "completed", "cancelled", "no_show"]) });
const moveBody = z.object({ startsAt: z.string().min(1) });
const clockBody = z.object({
  hours: z.array(z.object({ weekday: z.number().int().min(1).max(7), start: z.string(), end: z.string() })),
  breaks: z.array(z.object({ weekday: z.number().int().min(1).max(7), start: z.string(), end: z.string() })),
});
const timeOffBody = z.object({
  barberId: z.string().min(1).nullable(),
  startsAt: z.string().min(1),
  endsAt: z.string().min(1),
  note: z.string().optional(),
});
const settingsBody = z.record(z.string(), z.string());
const reviewBody = z.object({ isPublic: z.boolean() });

function clock(value: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new ApiError(400, "VALIDATION", "Use HH:MM");
  return new Date(Date.UTC(1970, 0, 1, Number(match[1]), Number(match[2]), 0));
}

function label(date: Date) {
  return `${String(date.getUTCHours()).padStart(2, "0")}:${String(date.getUTCMinutes()).padStart(2, "0")}`;
}

function wallClock(value: string) {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (!match) throw new ApiError(400, "VALIDATION", "Use a date and time");
  return zonedToUtc(match[1], Number(match[2]) * 60 + Number(match[3]), timeZone);
}

export const adminRoutes: FastifyPluginAsync<{ prisma: PrismaClient }> = async (app, options) => {
  const { prisma } = options;
  await app.register(multipart, { limits: { fileSize: 2_000_000 } });

  const guard = (request: Parameters<typeof requireAdmin>[0]) => requireAdmin(request);

  app.post("/api/v1/admin/login", async (request, reply) => {
    assertLoginAllowed(request.ip);
    const body = loginBody.parse(request.body);
    const admin = await prisma.adminUser.findUnique({ where: { login: body.login } });
    const matches = admin ? await verifyPassword(body.password, admin.passwordHash) : false;
    if (!admin || !matches) throw new ApiError(401, "ADMIN_AUTH", "Those details do not match");
    if (admin.passwordHash.startsWith("scrypt$")) {
      await prisma.adminUser.update({ where: { id: admin.id }, data: { passwordHash: await hashPassword(body.password) } });
    }
    return reply.header("set-cookie", sessionCookie(signSession(admin.id))).send({ login: admin.login });
  });

  app.post("/api/v1/admin/logout", async (_request, reply) => {
    return reply.header("set-cookie", sessionCookie("", true)).send({ ok: true });
  });

  app.get("/api/v1/admin/me", async (request) => {
    const id = guard(request);
    const admin = await prisma.adminUser.findUnique({ where: { id } });
    if (!admin) throw new ApiError(401, "ADMIN_AUTH", "Sign in required");
    return { login: admin.login };
  });

  app.get("/api/v1/admin/bookings", async (request) => {
    guard(request);
    const query = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }).parse(request.query);
    const where: Prisma.BookingWhereInput = {};
    if (query.date) {
      const start = wallClock(`${query.date}T00:00`);
      where.startsAt = { gte: start, lt: new Date(start.getTime() + 86_400_000) };
    }
    const rows = await prisma.booking.findMany({
      where,
      orderBy: { startsAt: "asc" },
      take: 200,
      include: { client: true, barber: true, services: { include: { service: true } } },
    });
    return rows.map((row) => ({
      id: row.id,
      status: row.status,
      source: row.source,
      startsAt: row.startsAt.toISOString(),
      endsAt: row.endsAt.toISOString(),
      clientName: row.client.name,
      clientPhone: row.client.phone,
      barberId: row.barberId,
      barberName: row.barber.name,
      services: row.services.map((item) => item.service.name),
    }));
  });

  app.post("/api/v1/admin/bookings", async (request, reply) => {
    guard(request);
    const body = bookingBody.parse(request.body);
    const booking = await createBooking(prisma, {
      serviceIds: body.serviceIds,
      barberId: body.barberId,
      startsAt: wallClock(body.startsAt),
      client: { name: body.clientName, phone: body.clientPhone },
      source: "admin",
    });
    return reply.code(201).send(booking);
  });

  app.post("/api/v1/admin/bookings/:id/status", async (request) => {
    guard(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = statusBody.parse(request.body);
    const current = await prisma.booking.findUnique({ where: { id } });
    if (!current) throw new ApiError(404, "NOT_FOUND", "Booking not found");
    if (body.status === "cancelled") return cancelBooking(prisma, current.manageToken, true);
    if (body.status === "confirmed" && current.status !== "confirmed") {
      const clash = await prisma.booking.findFirst({
        where: { id: { not: id }, barberId: current.barberId, status: "confirmed", startsAt: { lt: current.endsAt }, endsAt: { gt: current.startsAt } },
      });
      if (clash) throw new ApiError(409, "SLOT_TAKEN", "That chair is already booked");
    }
    return prisma.booking.update({ where: { id }, data: { status: body.status } }).then(() => ({ id, status: body.status }));
  });

  app.post("/api/v1/admin/bookings/:id/reschedule", async (request) => {
    guard(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = moveBody.parse(request.body);
    const current = await prisma.booking.findUnique({ where: { id } });
    if (!current) throw new ApiError(404, "NOT_FOUND", "Booking not found");
    return rescheduleBooking(prisma, current.manageToken, wallClock(body.startsAt), true);
  });

  app.get("/api/v1/admin/services", async (request) => {
    guard(request);
    return prisma.service.findMany({ orderBy: { sortOrder: "asc" } });
  });

  app.post("/api/v1/admin/services", async (request, reply) => {
    guard(request);
    const body = serviceBody.parse(request.body);
    const id = body.id ?? body.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const row = await prisma.service.create({
      data: { id, name: body.name, description: body.description, durationMin: body.durationMin, price: body.price, sortOrder: body.sortOrder ?? 0, isActive: body.isActive ?? true },
    });
    return reply.code(201).send(row);
  });

  app.patch("/api/v1/admin/services/:id", async (request) => {
    guard(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const body = serviceBody.omit({ id: true }).partial().parse(request.body);
    return prisma.service.update({ where: { id }, data: body });
  });

  app.delete("/api/v1/admin/services/:id", async (request) => {
    guard(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    return prisma.service.update({ where: { id }, data: { isActive: false } });
  });

  app.get("/api/v1/admin/barbers", async (request) => {
    guard(request);
    return prisma.barber.findMany({ orderBy: { sortOrder: "asc" }, include: { services: true } });
  });

  app.post("/api/v1/admin/barbers", async (request, reply) => {
    guard(request);
    const body = barberBody.parse(request.body);
    const id = body.id ?? body.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const row = await prisma.barber.create({
      data: { id, name: body.name, bio: body.bio, experienceYears: body.experienceYears, photoUrl: body.photoUrl || null, sortOrder: body.sortOrder ?? 0, isActive: body.isActive ?? true },
    });
    return reply.code(201).send(row);
  });

  app.patch("/api/v1/admin/barbers/:id", async (request) => {
    guard(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const body = barberBody.omit({ id: true }).partial().parse(request.body);
    return prisma.barber.update({ where: { id }, data: { ...body, photoUrl: body.photoUrl || undefined } });
  });

  app.delete("/api/v1/admin/barbers/:id", async (request) => {
    guard(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    return prisma.barber.update({ where: { id }, data: { isActive: false } });
  });

  app.post("/api/v1/admin/barbers/:id/link", async (request) => {
    guard(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const code = await issueBarberLinkCode(prisma, id);
    const username = process.env.TELEGRAM_BOT_USERNAME;
    return { url: username ? `https://t.me/${username}?start=barber_${code}` : code, expiresInMin: 30 };
  });

  app.put("/api/v1/admin/barbers/:id/services", async (request) => {
    guard(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const body = z.object({ serviceIds: z.array(z.string()) }).parse(request.body);
    await prisma.barberService.deleteMany({ where: { barberId: id } });
    if (body.serviceIds.length) {
      await prisma.barberService.createMany({ data: body.serviceIds.map((serviceId) => ({ barberId: id, serviceId })) });
    }
    return { ok: true };
  });

  app.get("/api/v1/admin/barbers/:id/desk", async (request) => {
    guard(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const [hours, breaks, timeOff, portfolio] = await Promise.all([
      prisma.workingHour.findMany({ where: { barberId: id }, orderBy: { weekday: "asc" } }),
      prisma.break.findMany({ where: { barberId: id }, orderBy: { weekday: "asc" } }),
      prisma.timeOff.findMany({ where: { OR: [{ barberId: id }, { barberId: null }] }, orderBy: { startsAt: "asc" } }),
      prisma.barberPortfolio.findMany({ where: { barberId: id }, orderBy: { sortOrder: "asc" } }),
    ]);
    return {
      hours: hours.map((row) => ({ weekday: row.weekday, start: label(row.startTime), end: label(row.endTime) })),
      breaks: breaks.map((row) => ({ weekday: row.weekday, start: label(row.startTime), end: label(row.endTime) })),
      timeOff: timeOff.map((row) => ({ id: row.id, barberId: row.barberId, startsAt: row.startsAt.toISOString(), endsAt: row.endsAt.toISOString(), note: row.note })),
      portfolio: portfolio.map((row) => ({ id: row.id, imageUrl: row.imageUrl })),
    };
  });

  app.put("/api/v1/admin/barbers/:id/clock", async (request) => {
    guard(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const body = clockBody.parse(request.body);
    await prisma.workingHour.deleteMany({ where: { barberId: id } });
    await prisma.break.deleteMany({ where: { barberId: id } });
    if (body.hours.length) {
      await prisma.workingHour.createMany({
        data: body.hours.map((row) => ({ barberId: id, weekday: row.weekday, startTime: clock(row.start), endTime: clock(row.end) })),
      });
    }
    if (body.breaks.length) {
      await prisma.break.createMany({
        data: body.breaks.map((row) => ({ barberId: id, weekday: row.weekday, startTime: clock(row.start), endTime: clock(row.end) })),
      });
    }
    return { ok: true };
  });

  app.post("/api/v1/admin/time-off", async (request, reply) => {
    guard(request);
    const body = timeOffBody.parse(request.body);
    const row = await prisma.timeOff.create({
      data: {
        barberId: body.barberId,
        startsAt: wallClock(body.startsAt),
        endsAt: wallClock(body.endsAt),
        type: body.barberId ? "barber" : "shop",
        note: body.note ?? null,
      },
    });
    return reply.code(201).send(row);
  });

  app.delete("/api/v1/admin/time-off/:id", async (request) => {
    guard(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    await prisma.timeOff.delete({ where: { id } });
    return { ok: true };
  });

  app.post("/api/v1/admin/uploads", async (request, reply) => {
    guard(request);
    const file = await request.file();
    if (!file) throw new ApiError(400, "VALIDATION", "Choose a photo");
    const ext = file.mimetype === "image/png" ? "png" : file.mimetype === "image/webp" ? "webp" : file.mimetype === "image/jpeg" ? "jpg" : null;
    if (!ext) throw new ApiError(400, "VALIDATION", "Use JPG, PNG, or WebP");
    await mkdir(uploadDir, { recursive: true });
    const name = `${randomUUID()}.${ext}`;
    await pipeline(file.file, createWriteStream(join(uploadDir, name)));
    return reply.code(201).send({ url: `/images/uploads/${name}` });
  });

  app.post("/api/v1/admin/barbers/:id/portfolio", async (request, reply) => {
    guard(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const body = z.object({ imageUrl: z.string().min(1) }).parse(request.body);
    const row = await prisma.barberPortfolio.create({ data: { barberId: id, imageUrl: body.imageUrl } });
    return reply.code(201).send(row);
  });

  app.delete("/api/v1/admin/portfolio/:id", async (request) => {
    guard(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    await prisma.barberPortfolio.delete({ where: { id } });
    return { ok: true };
  });

  app.get("/api/v1/admin/reviews", async (request) => {
    guard(request);
    const rows = await prisma.review.findMany({
      orderBy: { createdAt: "desc" },
      include: { client: true, barber: true },
    });
    return rows.map((row) => ({
      id: row.id,
      rating: row.rating,
      comment: row.comment,
      isPublic: row.isPublic,
      clientName: row.client.name,
      barberName: row.barber.name,
    }));
  });

  app.patch("/api/v1/admin/reviews/:id", async (request) => {
    guard(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = reviewBody.parse(request.body);
    return prisma.review.update({ where: { id }, data: { isPublic: body.isPublic } });
  });

  app.get("/api/v1/admin/settings", async (request) => {
    guard(request);
    const rows = await prisma.setting.findMany({ orderBy: { key: "asc" } });
    return Object.fromEntries(rows.map((row) => [row.key, row.value]));
  });

  app.get("/api/v1/admin/analytics", async (request) => {
    guard(request);
    const query = z.object({
      from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }).parse(request.query);
    if (query.from > query.to || query.to > addDays(query.from, 366)) {
      throw new ApiError(400, "VALIDATION", "Pick a period of a year or less");
    }
    const fromUtc = zonedToUtc(query.from, 0, timeZone);
    const toUtc = zonedToUtc(addDays(query.to, 1), 0, timeZone);
    const [barbers, bookings, timeOff] = await Promise.all([
      prisma.barber.findMany({ orderBy: { sortOrder: "asc" }, include: { hours: true, breaks: true } }),
      prisma.booking.findMany({
        where: { startsAt: { gte: fromUtc, lt: toUtc } },
        include: { services: true },
      }),
      prisma.timeOff.findMany({ where: { startsAt: { lt: toUtc }, endsAt: { gt: fromUtc } } }),
    ]);
    const clientIds = [...new Set(bookings.map((row) => row.clientId))];
    const prior = clientIds.length
      ? await prisma.booking.findMany({
          where: { startsAt: { lt: fromUtc }, status: { in: ["completed", "confirmed", "no_show"] }, clientId: { in: clientIds } },
          select: { clientId: true },
          distinct: ["clientId"],
        })
      : [];
    const minutes = (value: Date) => value.getUTCHours() * 60 + value.getUTCMinutes();
    return summarize({
      from: query.from,
      to: query.to,
      timeZone,
      priorClientIds: prior.map((row) => row.clientId),
      timeOff: timeOff.map((row) => ({ barberId: row.barberId, startsAt: row.startsAt.toISOString(), endsAt: row.endsAt.toISOString() })),
      barbers: barbers.map((barber) => ({
        id: barber.id,
        name: barber.name,
        hours: barber.hours.map((row) => ({ weekday: row.weekday, startMin: minutes(row.startTime), endMin: minutes(row.endTime) })),
        breaks: barber.breaks.map((row) => ({ weekday: row.weekday, startMin: minutes(row.startTime), endMin: minutes(row.endTime) })),
      })),
      bookings: bookings.map((row) => ({
        clientId: row.clientId,
        barberId: row.barberId,
        startsAt: row.startsAt.toISOString(),
        status: row.status,
        totalPrice: row.totalPrice,
        totalDurationMin: row.totalDurationMin,
        services: row.services.map((service) => ({ serviceId: service.serviceId, name: service.name, price: service.price })),
      })),
    });
  });

  app.put("/api/v1/admin/settings", async (request) => {
    guard(request);
    const body = settingsBody.parse(request.body);
    for (const [key, value] of Object.entries(body)) {
      await prisma.setting.upsert({ where: { key }, create: { key, value }, update: { value } });
    }
    return { ok: true };
  });
};
