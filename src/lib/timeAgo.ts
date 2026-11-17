const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** How long ago `then` was, the way a person would say it: "just now",
 *  "5 min ago", "3 h ago", "yesterday", "4 days ago" — and the date itself
 *  once that says more ("12 Mar 2026"). */
export function timeAgo(then: number, now: number = Date.now()): string {
  const passed = Math.max(0, now - then)
  if (passed < MINUTE) return 'just now'
  if (passed < HOUR) return `${Math.floor(passed / MINUTE)} min ago`
  if (passed < DAY) return `${Math.floor(passed / HOUR)} h ago`
  if (passed < 2 * DAY) return 'yesterday'
  if (passed < 7 * DAY) return `${Math.floor(passed / DAY)} days ago`
  return new Date(then).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}
