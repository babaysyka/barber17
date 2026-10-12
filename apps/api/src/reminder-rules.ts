export type ReminderSettings = {
  dayMinutes: number;
  shortMinutes: number;
  reviewDelayMin: number;
};

export const DAY_SLACK_MIN = 60;
export const SHORT_SLACK_MIN = 15;

export type ReminderRow = {
  id: string;
  status: string;
  startsAt: string;
  endsAt: string;
  reminderDaySentAt: string | null;
  reminder30mSentAt: string | null;
  reviewRequestedAt: string | null;
  chatId: string | null;
  clientName: string;
  barberName: string;
  services: string;
};

export type ReminderAction =
  | { type: "complete"; id: string }
  | { type: "day" | "short" | "review"; id: string; chatId: string; text: string };

function whenLabel(iso: string) {
  const date = new Date(iso);
  const day = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Tashkent",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(date);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Tashkent",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const bag = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${day}, ${bag.hour === "24" ? "00" : bag.hour}:${bag.minute}`;
}

function withinLead(startsAt: string, now: Date, leadMin: number, slackMin: number) {
  const untilStart = new Date(startsAt).getTime() - now.getTime();
  const leadMs = leadMin * 60_000;
  const slackMs = slackMin * 60_000;
  return untilStart <= leadMs && untilStart >= leadMs - slackMs;
}

export function planReminders(rows: ReminderRow[], now: Date, settings: ReminderSettings): ReminderAction[] {
  const actions: ReminderAction[] = [];
  for (const row of rows) {
    const ended = new Date(row.endsAt).getTime() < now.getTime();
    const upcoming = row.status === "confirmed" && !ended;
    if (row.status === "confirmed" && ended) actions.push({ type: "complete", id: row.id });
    if (upcoming && row.chatId && !row.reminderDaySentAt && withinLead(row.startsAt, now, settings.dayMinutes, DAY_SLACK_MIN)) {
      actions.push({
        type: "day",
        id: row.id,
        chatId: row.chatId,
        text: `Tomorrow at Orda.\n${row.services} with ${row.barberName}\n${whenLabel(row.startsAt)}`,
      });
    }
    if (upcoming && row.chatId && !row.reminder30mSentAt && withinLead(row.startsAt, now, settings.shortMinutes, SHORT_SLACK_MIN)) {
      actions.push({
        type: "short",
        id: row.id,
        chatId: row.chatId,
        text: `Your visit starts in 30 minutes.\n${row.services} with ${row.barberName}\n${whenLabel(row.startsAt)}`,
      });
    }
    const finished = row.status === "completed" || (row.status === "confirmed" && ended);
    const reviewDue = now.getTime() >= new Date(row.endsAt).getTime() + settings.reviewDelayMin * 60_000;
    if (finished && row.chatId && !row.reviewRequestedAt && reviewDue) {
      actions.push({
        type: "review",
        id: row.id,
        chatId: row.chatId,
        text: `How was the chair?\n${row.services} with ${row.barberName}`,
      });
    }
  }
  return actions;
}
