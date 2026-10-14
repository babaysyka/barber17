import type { IncomingMessage, ServerResponse } from "node:http";
import { config } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import cors from "@fastify/cors";
import Fastify from "fastify";
import { ZodError } from "zod";
import { ApiError } from "./errors.js";
import { adminRoutes } from "./routes/admin.js";
import { availabilityRoutes } from "./routes/availability.js";
import { barberRoutes } from "./routes/barbers.js";
import { bookingRoutes } from "./routes/bookings.js";
import { healthRoutes } from "./routes/health.js";
import { notificationRoutes } from "./routes/notifications.js";
import { serviceRoutes } from "./routes/services.js";
import { telegramRoutes } from "./routes/telegram.js";
import { registerTelegram, stopTelegram } from "./telegram-bot.js";

if (!process.env.VERCEL) {
  const here = dirname(fileURLToPath(import.meta.url));
  config({ path: resolve(here, "../../../.env") });
}

const app = Fastify({ logger: true });

const allowed = (process.env.CORS_ORIGIN ?? "http://localhost:3000,http://127.0.0.1:3000")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

await app.register(cors, {
  origin: (origin, callback) => {
    if (!origin) {
      callback(null, true);
      return;
    }
    const local = /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin);
    callback(null, allowed.includes(origin) || local);
  },
  credentials: true,
});

app.setErrorHandler((error, request, reply) => {
  if (error instanceof ApiError) {
    return reply.code(error.statusCode).send({ code: error.code, message: error.message });
  }
  if (error instanceof ZodError) {
    return reply.code(400).send({ code: "VALIDATION", message: "Invalid request" });
  }
  request.log.error(error);
  return reply.code(500).send({ code: "INTERNAL", message: "Something went wrong" });
});

app.setNotFoundHandler((_request, reply) => {
  return reply.code(404).send({ code: "NOT_FOUND", message: "Route not found" });
});

await app.register(healthRoutes);

try {
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  await app.register(serviceRoutes, { prisma });
  await app.register(barberRoutes, { prisma });
  await app.register(availabilityRoutes, { prisma });
  await app.register(bookingRoutes, { prisma });
  await app.register(telegramRoutes, { prisma });
  await app.register(notificationRoutes, { prisma });
  await app.register(adminRoutes, { prisma });
  registerTelegram(app, prisma);
} catch (error) {
  app.log.error({ err: error }, "Routes that need the database were not attached");
}

await app.ready();

if (!process.env.VERCEL) {
  const port = Number(process.env.PORT ?? process.env.API_PORT ?? 4000);
  await app.listen({ port, host: "0.0.0.0" });
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  await app.ready();
  app.server.emit("request", req, res);
}

const shutdown = async () => {
  await stopTelegram();
  await app.close();
};
process.on("SIGINT", () => {
  void shutdown().then(() => process.exit(0));
});
process.on("SIGTERM", () => {
  void shutdown().then(() => process.exit(0));
});
