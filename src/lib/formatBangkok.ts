const BANGKOK_TIME_ZONE = "Asia/Bangkok";

type DateInput = string | number | Date | null | undefined;

const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: BANGKOK_TIME_ZONE,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const timeFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: BANGKOK_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function validDate(value: DateInput): Date | null {
  if (value === null || value === undefined || value === "") return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

export function formatBangkokDate(value: DateInput): string {
  const date = validDate(value);
  return date ? dateFormatter.format(date) : "—";
}

export function formatBangkokTime(value: DateInput): string {
  const date = validDate(value);
  return date ? timeFormatter.format(date) : "—";
}

export function formatBangkokDateTime(value: DateInput): string {
  const date = validDate(value);
  return date ? `${dateFormatter.format(date)} ${timeFormatter.format(date)}` : "—";
}

export function formatBangkokShortDateTime(value: DateInput): string {
  const date = validDate(value);
  return date ? `${dateFormatter.format(date).slice(0, 5)} ${timeFormatter.format(date).slice(0, 5)}` : "—";
}
