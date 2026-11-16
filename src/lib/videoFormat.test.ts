import { describe, expect, it } from 'vitest'

import { aspectOf, exportSize, isFrameFormat } from './videoFormat'

describe('videoFormat', () => {
  it('reads the aspect out of a frame format', () => {
    expect(aspectOf('16:9')).toBeCloseTo(16 / 9)
    expect(aspectOf('9:16')).toBeCloseTo(9 / 16)
    expect(aspectOf('1:1')).toBe(1)
  })

  it('recognizes only the formats it offers', () => {
    expect(isFrameFormat('4:3')).toBe(true)
    expect(isFrameFormat('21:9')).toBe(false)
    expect(isFrameFormat(undefined)).toBe(false)
  })

  it('sizes a video by its long side', () => {
    expect(exportSize(16 / 9)).toEqual({ width: 1280, height: 720 })
    expect(exportSize(9 / 16)).toEqual({ width: 720, height: 1280 })
    expect(exportSize(1)).toEqual({ width: 1280, height: 1280 })
    expect(exportSize(4 / 3)).toEqual({ width: 1280, height: 960 })
  })

  it('keeps both sides even for any viewport shape', () => {
    const { width, height } = exportSize(1037 / 613)
    expect(width % 2).toBe(0)
    expect(height % 2).toBe(0)
    expect(width / height).toBeCloseTo(1037 / 613, 1)
  })

  it('falls back to 16:9 for a shape that makes no sense', () => {
    expect(exportSize(0)).toEqual({ width: 1280, height: 720 })
    expect(exportSize(NaN)).toEqual({ width: 1280, height: 720 })
  })
})
