// Short, muted relative-time formatter shared by the comments panel and the
// conversation feed: "just now" (<1m), "3m", "2h", "yesterday", then a short
// date for anything older. `now` is injected so it stays a pure function (and
// testable); defaults to the current time. Returns "" for an unparseable input.
export function formatRelativeTime(iso: string, now: number = Date.now()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const sec = Math.max(0, Math.floor((now - then) / 1000));
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.floor(hr / 24);
  if (day === 1) return "yesterday";
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}
