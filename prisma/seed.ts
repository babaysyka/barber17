import { scryptSync } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const services = [
  {
    id: "cut",
    name: "Classic cut",
    description: "A measured shape for the way you actually live. Scissors, weight, and a clean neckline.",
    durationMin: 45,
    price: 120_000,
    sortOrder: 1,
  },
  {
    id: "fade",
    name: "Signature fade",
    description: "A tight graduation that stays sharp for the week, not just the photograph.",
    durationMin: 50,
    price: 140_000,
    sortOrder: 2,
  },
  {
    id: "beard",
    name: "Beard design",
    description: "Line, length, and density. The jaw is drawn, not decorated.",
    durationMin: 30,
    price: 80_000,
    sortOrder: 3,
  },
  {
    id: "shave",
    name: "Royal shave",
    description: "Hot linen, a slow pass, and time enough to leave the street outside.",
    durationMin: 40,
    price: 90_000,
    sortOrder: 4,
  },
  {
    id: "full",
    name: "Full grooming",
    description: "Cut, beard, and shave in one sitting. The chair is yours until it is finished.",
    durationMin: 90,
    price: 220_000,
    sortOrder: 5,
  },
] as const;

const barbers = [
  {
    id: "aziz",
    name: "Aziz Karimov",
    photoUrl: "/images/barber-1.jpg",
    bio: "Classic cut",
    experienceYears: 8,
    sortOrder: 1,
  },
  {
    id: "timur",
    name: "Timur Yusupov",
    photoUrl: "/images/barber-2.jpg",
    bio: "Signature fade",
    experienceYears: 6,
    sortOrder: 2,
  },
  {
    id: "leo",
    name: "Leo Marchetti",
    photoUrl: "/images/barber-3.jpg",
    bio: "Royal shave",
    experienceYears: 11,
    sortOrder: 3,
  },
  {
    id: "david",
    name: "David Petrosyan",
    photoUrl: "/images/barber-4.jpg",
    bio: "Beard design",
    experienceYears: 9,
    sortOrder: 4,
  },
] as const;

const settings = [
  ["cancel_cutoff_min", "30"],
  ["slot_step_min", "15"],
  ["booking_horizon_days", "30"],
  ["min_notice_min", "30"],
  ["reminder_day_minutes", "1440"],
  ["reminder_short_minutes", "30"],
  ["review_delay_min", "60"],
  ["timezone", "Asia/Tashkent"],
  ["review_public_min_rating", "4"],
  ["shop_name", "Orda"],
  ["shop_address", "18 Shota Rustaveli Street, Tashkent"],
  ["shop_phone", "+998712551800"],
  ["shop_hours", "Tuesday–Sunday, 11:00–21:00"],
] as const;

function clock(value: string) {
  return new Date(`1970-01-01T${value}:00.000Z`);
}

function hashPassword(password: string) {
  const salt = "orda-local-seed";
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

async function main() {
  for (const service of services) {
    await prisma.service.upsert({
      where: { id: service.id },
      update: service,
      create: service,
    });
  }

  for (const barber of barbers) {
    await prisma.barber.upsert({
      where: { id: barber.id },
      update: barber,
      create: barber,
    });
  }

  for (const barber of barbers) {
    for (const service of services) {
      await prisma.barberService.upsert({
        where: { barberId_serviceId: { barberId: barber.id, serviceId: service.id } },
        update: { isEnabled: true },
        create: { barberId: barber.id, serviceId: service.id, isEnabled: true },
      });
    }
  }

  await prisma.workingHour.deleteMany();
  await prisma.break.deleteMany();
  await prisma.timeOff.deleteMany();

  const openDays = [2, 3, 4, 5, 6, 7];

  await prisma.workingHour.createMany({
    data: barbers.flatMap((barber) =>
      openDays.map((weekday) => ({
        barberId: barber.id,
        weekday,
        startTime: clock("11:00"),
        endTime: clock("21:00"),
      })),
    ),
  });

  await prisma.break.createMany({
    data: barbers.flatMap((barber) =>
      openDays.map((weekday) => ({
        barberId: barber.id,
        weekday,
        startTime: clock("15:00"),
        endTime: clock("15:30"),
      })),
    ),
  });

  await prisma.timeOff.create({
    data: {
      startsAt: new Date("2026-12-31T19:00:00.000Z"),
      endsAt: new Date("2027-01-02T19:00:00.000Z"),
      type: "shop",
      note: "New Year",
    },
  });

  for (const [key, value] of settings) {
    await prisma.setting.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });
  }

  await prisma.adminUser.upsert({
    where: { login: "admin" },
    update: {},
    create: {
      login: "admin",
      passwordHash: hashPassword("orda-local"),
    },
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error: unknown) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
