import type { PrismaClient } from "@prisma/client";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { cancelBooking, createBooking, getBooking, rescheduleBooking } from "../bookings.js";
import { telegramUserFrom } from "./telegram.js";

type Options = { prisma: PrismaClient };

const tokenParams = z.object({ token: z.string().uuid() });

const createBody = z.object({
  serviceIds: z.array(z.string().regex(/^[a-zA-Z0-9_-]+$/)).min(1),
  barberId: z.string().regex(/^(any|[a-zA-Z0-9_-]+)$/),
  startsAt: z.string().datetime(),
  client: z.object({
    name: z.string().trim().min(2).max(80),
    phone: z.string().trim().min(9).max(20),
  }),
});

const moveBody = z.object({
  startsAt: z.string().datetime(),
});

export const bookingRoutes: FastifyPluginAsync<Options> = async (app, options) => {
  app.post("/api/v1/bookings", async (request, reply) => {
    const body = createBody.parse(request.body);
    const telegram = telegramUserFrom(request);
    const booking = await createBooking(options.prisma, {
      serviceIds: [...new Set(body.serviceIds)],
      barberId: body.barberId,
      startsAt: new Date(body.startsAt),
      client: { ...body.client, telegramId: telegram?.telegramId },
    });
    return reply.code(201).send(booking);
  });

  app.get("/api/v1/bookings/:token", async (request) => {
    const params = tokenParams.parse(request.params);
    return getBooking(options.prisma, params.token);
  });

  app.post("/api/v1/bookings/:token/cancel", async (request) => {
    const params = tokenParams.parse(request.params);
    return cancelBooking(options.prisma, params.token);
  });

  app.post("/api/v1/bookings/:token/reschedule", async (request) => {
    const params = tokenParams.parse(request.params);
    const body = moveBody.parse(request.body);
    return rescheduleBooking(options.prisma, params.token, new Date(body.startsAt));
  });
};
