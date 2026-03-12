/**
 * Retry with exponential backoff (3x: 2s, 4s, 8s)
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  label: string,
  maxAttempts = 3
): Promise<T> {
  let lastError: Error = new Error('Unknown error')
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      if (attempt < maxAttempts) {
        const delayMs = Math.pow(2, attempt) * 1000
        console.warn(`[retry] ${label} attempt ${attempt}/${maxAttempts} failed: ${lastError.message}. Retrying in ${delayMs}ms...`)
        await new Promise(r => setTimeout(r, delayMs))
      }
    }
  }
  console.error(`[retry] ${label} failed after ${maxAttempts} attempts: ${lastError.message}`)
  throw lastError
}
