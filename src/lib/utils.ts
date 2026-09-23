let uidN = 0

export function uid(): string {
  uidN += 1
  return (
    Date.now().toString(36) + '-' + uidN.toString(36) + '-' + Math.random().toString(36).slice(2, 7)
  )
}

export function num(v: unknown, fallback: number): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v))
  return Number.isFinite(n) ? n : fallback
}

export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}
