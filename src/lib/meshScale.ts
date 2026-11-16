// Scaling tiny meshes up to whole units. Files come in whatever units they
// were modelled in — a part authored in meters can measure 0.024 × 0.01 ×
// 0.005, too small to work with comfortably. When a dropped mesh's largest
// side is under one unit, the board offers power-of-ten factors instead.
import type { Vec3 } from '@/types/project'

/** Largest side below this counts as "very small". */
export const TINY_SIZE = 1

const FACTORS = [10, 100, 1000, 10000, 100000, 1000000]

export function isTiny(size: Vec3): boolean {
  const max = Math.max(size.x, size.y, size.z)
  return max > 0 && max < TINY_SIZE
}

export function scaledSize(size: Vec3, factor: number): Vec3 {
  return { x: size.x * factor, y: size.y * factor, z: size.z * factor }
}

/** The smallest power of ten that brings every (non-flat) side to at least
 *  one unit — 0.024 × 0.010 × 0.005 → ×1000 → 24 × 10 × 5. A flat side
 *  (0) is ignored; if every side is flat, the largest one decides. */
export function recommendedFactor(size: Vec3): number {
  const sides = [size.x, size.y, size.z].filter((s) => s > 1e-12)
  if (!sides.length) return 1
  const smallest = Math.min(...sides)
  return FACTORS.find((f) => smallest * f >= 1 - 1e-9) ?? FACTORS[FACTORS.length - 1]
}

/** Factors worth offering for `size`: from ×10 up to one step past the
 *  recommended one. */
export function factorOptions(size: Vec3): number[] {
  const rec = recommendedFactor(size)
  const i = FACTORS.indexOf(rec)
  return FACTORS.slice(0, Math.max(3, Math.min(FACTORS.length, i + 2)))
}

/** "24 × 10 × 5" with sensible precision. */
export function formatSize(size: Vec3): string {
  const f = (v: number) => {
    if (v === 0) return '0'
    const abs = Math.abs(v)
    return abs >= 100 ? v.toFixed(0) : abs >= 1 ? String(+v.toFixed(2)) : String(+v.toPrecision(3))
  }
  return `${f(size.x)} × ${f(size.y)} × ${f(size.z)}`
}
