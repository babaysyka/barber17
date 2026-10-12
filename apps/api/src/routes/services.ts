import type { PrismaClient } from "@prisma/client";
import type { FastifyPluginAsync } from "fastify";

type Options = { prisma: PrismaClient };

export const serviceRoutes: FastifyPluginAsync<Options> = async (app, options) => {
  app.get("/api/v1/services", async () => {
    const services = await options.prisma.service.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
    });

    return services.map((service) => ({
      id: service.id,
      name: service.name,
      description: service.description,
      durationMin: service.durationMin,
      price: service.price,
      sortOrder: service.sortOrder,
    }));
  });
};
