import { describe, expect, it } from 'vitest'
import { friendlyError } from '../../../../modules/tools/app/utils/errors'

const en = (value: string): string => value
const translate = (english: string, _chinese: string): string => english

describe('friendlyError', () => {
  it('maps encrypted PDFs to an actionable message', () => {
    expect(friendlyError(new Error('Input document to `PDFDocument.load` is encrypted'), translate))
      .toContain('password-protected')
  })

  it('maps corrupt PDFs', () => {
    expect(friendlyError(new Error('Failed to parse PDF document'), translate))
      .toContain('not a valid PDF')
  })

  it('maps memory and cancellation errors', () => {
    expect(friendlyError(new Error('Array buffer allocation failed'), translate)).toContain('too large')
    expect(friendlyError(new Error('The operation was cancelled'), translate)).toContain('cancelled')
  })

  it('maps page-range errors', () => {
    expect(friendlyError(new Error('Invalid page number 9'), translate)).toContain('page numbers')
  })

  it('falls back to the raw message when nothing matches', () => {
    expect(friendlyError(new Error('Something specific broke'), translate)).toBe('Something specific broke')
  })

  it('never returns an empty string', () => {
    expect(friendlyError(new Error(''), translate)).toBe(en('Something went wrong'))
    expect(friendlyError(undefined, translate)).not.toBe('')
  })
})
