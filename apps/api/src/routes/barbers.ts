import type { PrismaClient } from "@prisma/client";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { ApiError } from "../errors.js";

type Options = { prisma: PrismaClient };

const paramsSchema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9_-]+$/),
});

function toBarber(barber: {
  id: string;
  name: string;
  photoUrl: string | null;
  bio: string | null;
  experienceYears: number;
  sortOrder: number;
}) {
  return {
    id: barber.id,
    name: barber.name,
    photoUrl: barber.photoUrl,
    bio: barber.bio,
    experienceYears: barber.experienceYears,
    sortOrder: barber.sortOrder,
  };
}

export const barberRoutes: FastifyPluginAsync<Options> = async (app, options) => {
  app.get("/api/v1/barbers", async () => {
    const barbers = await options.prisma.barber.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
    });
    return barbers.map(toBarber);
  });

  app.get("/api/v1/barbers/:id", async (request) => {
    const params = paramsSchema.parse(request.params);
    const barber = await options.prisma.barber.findFirst({
      where: { id: params.id, isActive: true },
      include: {
        services: {
          where: { isEnabled: true, service: { isActive: true } },
          include: { service: true },
        },
      },
    });

    if (!barber) {
      throw new ApiError(404, "NOT_FOUND", "Barber not found");
    }

    return {
      ...toBarber(barber),
      services: barber.services
        .map((link) => ({
          id: link.service.id,
          name: link.service.name,
          durationMin: link.durationMin ?? link.service.durationMin,
          price: link.price ?? link.service.price,
          sortOrder: link.service.sortOrder,
        }))
        .sort((a, b) => a.sortOrder - b.sortOrder),
    };
  });
};
