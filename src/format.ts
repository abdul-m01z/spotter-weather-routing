export const miles = (value: number) =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(value);
export function duration(seconds: number) {
  const minutes = Math.round(seconds / 60);
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}
export function dateTime(epoch: number) {
  return new Date(epoch * 1000).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}
export function localInput(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
export function initialDeparture() {
  return localInput(
    new Date(Math.ceil((Date.now() + 3600_000) / 900_000) * 900_000),
  );
}
export function parseDeparture(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) || localInput(parsed) !== value
    ? null
    : parsed;
}
