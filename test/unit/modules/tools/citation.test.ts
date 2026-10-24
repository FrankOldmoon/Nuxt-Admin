import { describe, expect, it } from 'vitest'
import { formatCitation, parseAuthors } from '../../../../modules/tools/app/utils/citation'
import type { CitationInput } from '../../../../modules/tools/app/utils/citation'

const base: CitationInput = {
  source: 'website',
  authors: 'Smith, John',
  year: '2024',
  title: 'The water cycle',
  container: 'National Geographic',
  volume: '',
  issue: '',
  pages: '',
  url: 'https://example.com/water',
  accessed: '2025-03-12'
}

describe('parseAuthors', () => {
  it('accepts "Last, First" and "First Last" forms', () => {
    expect(parseAuthors('Smith, John')).toEqual([{ last: 'Smith', first: 'John' }])
    expect(parseAuthors('Jane Doe')).toEqual([{ last: 'Doe', first: 'Jane' }])
  })

  it('splits one author per line or semicolon', () => {
    const people = parseAuthors('Smith, John\nDoe, Jane')
    expect(people).toHaveLength(2)
    expect(parseAuthors('Smith, John; Doe, Jane')).toHaveLength(2)
  })

  it('ignores empty entries', () => {
    expect(parseAuthors('  ')).toEqual([])
  })
})

describe('formatCitation', () => {
  it('formats a website in APA 7', () => {
    expect(formatCitation(base, 'apa')).toBe(
      'Smith, J. (2024). The water cycle. National Geographic. Retrieved March 12, 2025, from https://example.com/water'
    )
  })

  it('formats a website in MLA 9', () => {
    expect(formatCitation(base, 'mla')).toBe(
      'Smith, John. "The water cycle." National Geographic, 2024, https://example.com/water, Accessed 12 Mar. 2025.'
    )
  })

  it('formats a website in Harvard', () => {
    expect(formatCitation(base, 'harvard')).toBe(
      'Smith, J. (2024) The water cycle. National Geographic. Available at: https://example.com/water (Accessed: 12 March 2025)'
    )
  })

  it('formats a book with publisher and no URL', () => {
    const book: CitationInput = {
      ...base,
      source: 'book',
      title: 'Deep learning for teachers',
      container: 'Routledge',
      url: '',
      accessed: ''
    }
    expect(formatCitation(book, 'apa')).toBe(
      'Smith, J. (2024). Deep learning for teachers. Routledge.'
    )
  })

  it('formats a journal article with volume, issue and pages', () => {
    const journal: CitationInput = {
      ...base,
      source: 'journal',
      title: 'Reading in the content areas',
      container: 'Journal of Education',
      volume: '12',
      issue: '3',
      pages: '45-60',
      url: '',
      accessed: ''
    }
    expect(formatCitation(journal, 'apa')).toBe(
      'Smith, J. (2024). Reading in the content areas. Journal of Education, 12(3), 45-60.'
    )
    expect(formatCitation(journal, 'harvard')).toBe(
      `Smith, J. (2024) 'Reading in the content areas', Journal of Education, 12(3), pp. 45-60.`
    )
  })

  it('joins two authors differently per style', () => {
    const two = { ...base, authors: 'Smith, John\nDoe, Jane' }
    expect(formatCitation(two, 'apa')).toContain('Smith, J., & Doe, J.')
    expect(formatCitation(two, 'mla')).toContain('Smith, John, and Jane Doe.')
    expect(formatCitation(two, 'harvard')).toContain('Smith, J. and Doe, J.')
  })

  it('falls back to n.d. when the year is missing', () => {
    expect(formatCitation({ ...base, year: '' }, 'apa')).toContain('(n.d.)')
  })
})
