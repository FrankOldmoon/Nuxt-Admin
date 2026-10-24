import { describe, expect, it } from 'vitest'
import { analyzeReadability } from '../../../../modules/tools/app/utils/readability'

describe('analyzeReadability', () => {
  it('returns zeros and a neutral report for empty input', () => {
    const report = analyzeReadability('')
    expect(report.words).toBe(0)
    expect(report.sentences).toBe(0)
    expect(report.complexWords).toBe(0)
    expect(Number.isFinite(report.fleschReadingEase)).toBe(true)
  })

  it('counts words and sentences', () => {
    const report = analyzeReadability('The cat sat. The dog ran. A bird flew.')
    expect(report.words).toBe(9)
    expect(report.sentences).toBe(3)
    expect(report.avgSentenceLength).toBe(3)
  })

  it('scores simple prose as easier than academic prose', () => {
    const simple = analyzeReadability('The cat sat on the mat. The dog ran fast. We like to play.')
    const dense = analyzeReadability(
      'Notwithstanding the aforementioned methodological considerations, the epistemological underpinnings necessitate comprehensive interdisciplinary re-evaluation.'
    )
    expect(simple.fleschReadingEase).toBeGreaterThan(dense.fleschReadingEase)
    expect(simple.fleschKincaidGrade).toBeLessThan(dense.fleschKincaidGrade)
  })

  it('detects complex words and yields a readable level label', () => {
    const report = analyzeReadability('Photosynthesis requires chlorophyll and electromagnetic radiation.')
    expect(report.complexWords).toBeGreaterThan(0)
    expect(report.level.zh.length).toBeGreaterThan(0)
    expect(report.level.en.length).toBeGreaterThan(0)
  })

  it('handles passages without terminal punctuation', () => {
    const report = analyzeReadability('just a fragment without any full stop')
    expect(report.sentences).toBe(1)
    expect(report.words).toBe(7)
  })
})
