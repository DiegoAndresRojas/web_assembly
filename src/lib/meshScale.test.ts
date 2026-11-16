import { describe, expect, it } from 'vitest'

import { factorOptions, formatSize, isTiny, recommendedFactor, scaledSize } from './meshScale'

const size = (x: number, y: number, z: number) => ({ x, y, z })

describe('meshScale', () => {
  it('flags a mesh whose largest side is under one unit', () => {
    expect(isTiny(size(0.024, 0.01, 0.005))).toBe(true)
    expect(isTiny(size(24, 0.01, 0.005))).toBe(false)
    expect(isTiny(size(0, 0, 0))).toBe(false)
  })

  it('recommends the smallest power of ten that brings every side to a unit', () => {
    expect(recommendedFactor(size(0.024, 0.01, 0.005))).toBe(1000)
    expect(recommendedFactor(size(0.5, 0.5, 0.5))).toBe(10)
  })

  it('ignores flat sides, and leaves a fully flat mesh alone', () => {
    expect(recommendedFactor(size(0.2, 0, 0.3))).toBe(10)
    expect(recommendedFactor(size(0, 0, 0))).toBe(1)
  })

  it('offers factors up to one step past the recommended one', () => {
    expect(factorOptions(size(0.024, 0.01, 0.005))).toEqual([10, 100, 1000, 10000])
    expect(factorOptions(size(0.5, 0.5, 0.5))).toEqual([10, 100, 1000])
  })

  it('scales and formats a size', () => {
    expect(formatSize(scaledSize(size(0.024, 0.01, 0.005), 1000))).toBe('24 × 10 × 5')
  })
})
