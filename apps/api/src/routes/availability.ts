import type { PrismaClient } from "@prisma/client";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { collectSlots, listDays } from "../availability.js";

type Options = { prisma: PrismaClient };

const ids = z.string().regex(/^[a-zA-Z0-9_-]+(,[a-zA-Z0-9_-]+)*$/);
const barberId = z.string().regex(/^(any|[a-zA-Z0-9_-]+)$/);

const dayQuery = z.object({ serviceIds: ids, barberId });
const slotQuery = dayQuery.extend({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });

function splitIds(value: string) {
  return [...new Set(value.split(","))];
}

export const availabilityRoutes: FastifyPluginAsync<Options> = async (app, options) => {
  app.get("/api/v1/availability/days", async (request) => {
    const query = dayQuery.parse(request.query);
    const days = await listDays(options.prisma, splitIds(query.serviceIds), query.barberId);
    return { days };
  });

  app.get("/api/v1/availability", async (request) => {
    const query = slotQuery.parse(request.query);
    const serviceIds = splitIds(query.serviceIds);
    const collected = await collectSlots(options.prisma, {
      serviceIds,
      barberId: query.barberId,
      date: query.date,
      now: new Date(),
    });
    return {
      date: query.date,
      durationMin: collected.services.reduce((sum, service) => sum + service.durationMin, 0),
      slots: collected.slots,
    };
  });
};
