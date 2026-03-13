/**
 * Returns the most recent prior trading day date (YYYY-MM-DD).
 * Free tier Polygon only serves prior-day data.
 */
export function getPriorTradingDate(): string {
  const now = new Date()
  now.setUTCDate(now.getUTCDate() - 1)
  const day = now.getUTCDay()
  if (day === 0) now.setUTCDate(now.getUTCDate() - 2) // Sunday → Friday
  if (day === 6) now.setUTCDate(now.getUTCDate() - 1) // Saturday → Friday
  return now.toISOString().split('T')[0]
}
