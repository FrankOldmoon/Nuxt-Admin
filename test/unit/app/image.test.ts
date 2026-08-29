import { describe, it, expect } from 'vitest'
import { isImageFile, isGifFile } from '../../../app/utils/image'

const makeFile = (name: string, type: string) => new File(['x'], name, { type })

describe('isImageFile', () => {
  it('returns true for image MIME types', () => {
    expect(isImageFile(makeFile('a.png', 'image/png'))).toBe(true)
    expect(isImageFile(makeFile('a.jpg', 'image/jpeg'))).toBe(true)
    expect(isImageFile(makeFile('a.webp', 'image/webp'))).toBe(true)
  })

  it('returns false for non-image MIME types', () => {
    expect(isImageFile(makeFile('a.txt', 'text/plain'))).toBe(false)
    expect(isImageFile(makeFile('a.pdf', 'application/pdf'))).toBe(false)
  })
})

describe('isGifFile', () => {
  it('returns true for the gif MIME type', () => {
    expect(isGifFile(makeFile('a.gif', 'image/gif'))).toBe(true)
  })

  it('returns true for the gif extension', () => {
    expect(isGifFile(makeFile('a.GIF', 'image/png'))).toBe(true)
  })

  it('returns false for non-gif files', () => {
    expect(isGifFile(makeFile('a.png', 'image/png'))).toBe(false)
  })
})