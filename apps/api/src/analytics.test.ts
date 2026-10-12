import assert from "node:assert/strict";
import test from "node:test";
import { summarize, type AnalyticsBarber, type AnalyticsBooking } from "./analytics.js";

const hours = [2, 3, 4, 5, 6, 7].map((weekday) => ({ weekday, startMin: 11 * 60, endMin: 21 * 60 }));
const breaks = [2, 3, 4, 5, 6, 7].map((weekday) => ({ weekday, startMin: 15 * 60, endMin: 15 * 60 + 30 }));

function barber(id: string, name: string): AnalyticsBarber {
  return { id, name, hours, breaks };
}

function booking(partial: AnalyticsBooking): AnalyticsBooking {
  return partial;
}

const rows: AnalyticsBooking[] = [
  booking({
    clientId: "a",
    barberId: "aziz",
    startsAt: "2026-10-06T06:00:00.000Z",
    status: "completed",
    totalPrice: 120000,
    totalDurationMin: 45,
    services: [{ serviceId: "cut", name: "Cut", price: 120000 }],
  }),
  booking({
    clientId: "a",
    barberId: "aziz",
    startsAt: "2026-10-07T07:00:00.000Z",
    status: "completed",
    totalPrice: 80000,
    totalDurationMin: 30,
    services: [{ serviceId: "beard", name: "Beard", price: 80000 }],
  }),
  booking({
    clientId: "b",
    barberId: "timur",
    startsAt: "2026-10-06T13:00:00.000Z",
    status: "cancelled",
    totalPrice: 120000,
    totalDurationMin: 45,
    services: [{ serviceId: "cut", name: "Cut", price: 120000 }],
  }),
  booking({
    clientId: "c",
    barberId: "aziz",
    startsAt: "2026-10-07T11:00:00.000Z",
    status: "no_show",
    totalPrice: 150000,
    totalDurationMin: 60,
    services: [{ serviceId: "fade", name: "Fade", price: 150000 }],
  }),
];

test("dashboard figures match the hand count for two days", () => {
  const report = summarize({
    from: "2026-10-06",
    to: "2026-10-07",
    timeZone: "Asia/Tashkent",
    bookings: rows,
    barbers: [barber("aziz", "Aziz"), barber("timur", "Timur")],
    timeOff: [],
    priorClientIds: ["b"],
  });

  assert.equal(report.revenue, 200000);
  assert.deepEqual(report.bookings, { total: 4, completed: 2, confirmed: 0, cancelled: 1, noShow: 1 });
  assert.deepEqual(report.cancellations, { count: 1, rate: 0.25 });
  assert.deepEqual(report.noShows, { count: 1, rate: 0.25 });
  assert.deepEqual(
    report.services.map((row) => [row.serviceId, row.count, row.revenue]),
    [
      ["cut", 2, 120000],
      ["beard", 1, 80000],
      ["fade", 1, 0],
    ],
  );
  const aziz = report.barbers.find((row) => row.barberId === "aziz");
  const timur = report.barbers.find((row) => row.barberId === "timur");
  assert.equal(aziz?.occupiedMin, 135);
  assert.equal(aziz?.availableMin, 1140);
  assert.equal(aziz?.load, 11.8);
  assert.equal(timur?.occupiedMin, 0);
  assert.equal(timur?.availableMin, 1140);
  assert.deepEqual(report.retention, { clients: 3, returning: 1, rate: 0.3333 });
  assert.equal(report.heatmap[1][11], 1);
  assert.equal(report.heatmap[2][12], 1);
  assert.equal(report.heatmap[2][16], 1);
  assert.equal(report.heatmap[1][18], 0);
});

test("a shop closure removes that day from the open minutes", () => {
  const report = summarize({
    from: "2026-10-06",
    to: "2026-10-07",
    timeZone: "Asia/Tashkent",
    bookings: [],
    barbers: [barber("aziz", "Aziz")],
    timeOff: [{ barberId: null, startsAt: "2026-10-06T19:00:00.000Z", endsAt: "2026-10-07T19:00:00.000Z" }],
    priorClientIds: [],
  });
  assert.equal(report.barbers[0]?.availableMin, 570);
  assert.equal(report.revenue, 0);
  assert.equal(report.retention.rate, 0);
});
