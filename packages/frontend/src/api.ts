// API calls go to /api/* — handled by Vercel serverless functions in production
// In local dev, proxied via vite to localhost:3001
const API = ''

export async function getSignals() {
  const r = await fetch(`${API}/api/signals`)
  return r.json()
}
export async function getWatchlist() {
  const r = await fetch(`${API}/api/watchlist`)
  return r.json()
}
export async function getMacro() {
  const r = await fetch(`${API}/api/macro`)
  return r.json()
}
export async function getPaperTrades() {
  const r = await fetch(`${API}/api/paper-trades`)
  return r.json()
}
export async function createPaperTrade(body: object) {
  const r = await fetch(`${API}/api/paper-trades`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  })
  return r.json()
}
export async function closePaperTrade(id: string, body: object) {
  const r = await fetch(`${API}/api/paper-trades/${id}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  })
  return r.json()
}
