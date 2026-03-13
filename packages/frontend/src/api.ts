// All API calls go through /api/query?route=X — single serverless function
const Q = (route: string, params?: Record<string, string>) => {
  const p = new URLSearchParams({ route, ...params })
  return `/api/query?${p}`
}

export async function getSignals() {
  return fetch(Q('signals')).then(r => r.json())
}
export async function getWatchlist() {
  return fetch(Q('watchlist')).then(r => r.json())
}
export async function getMacro() {
  return fetch(Q('macro')).then(r => r.json())
}
export async function getPaperTrades() {
  return fetch(Q('paper-trades')).then(r => r.json())
}
export async function createPaperTrade(body: object) {
  return fetch(Q('paper-trades'), {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  }).then(r => r.json())
}
export async function closePaperTrade(id: string, body: object) {
  return fetch(Q('paper-trade', { id }), {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  }).then(r => r.json())
}
