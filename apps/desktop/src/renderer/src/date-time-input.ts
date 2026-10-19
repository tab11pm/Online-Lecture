export function toDisplayDate(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  return match ? `${match[3]}.${match[2]}.${match[1]}` : isoDate;
}

export function toIsoDate(displayDate: string): string | undefined {
  const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(displayDate.trim());
  if (!match) return undefined;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1) return undefined;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [
    31,
    leap ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];
  if (day > daysInMonth[month - 1]!) return undefined;
  return `${match[3]}-${match[2]}-${match[1]}`;
}

export function isValidClockTime(value: string): boolean {
  const match = /^(\d{2}):(\d{2})$/.exec(value.trim());
  return Boolean(match && Number(match[1]) <= 23 && Number(match[2]) <= 59);
}

export function normalizeClockTime(value: string): string {
  return value.trim();
}
