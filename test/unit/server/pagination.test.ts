import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('h3', () => ({
  getQuery: vi.fn()
}))

import { getQuery } from 'h3'
import { parsePagination, buildPagination } from '../../../server/utils/pagination'

const mockedGetQuery = vi.mocked(getQuery)

describe('parsePagination', () => {
  beforeEach(() => {
    mockedGetQuery.mockReset()
  })

  it('uses defaults when no query params are given', () => {
    mockedGetQuery.mockReturnValue({} as never)
    expect(parsePagination({} as never)).toEqual({ page: 1, pageSize: 10, offset: 0, limit: 10 })
  })

  it('parses normal page/pageSize values', () => {
    mockedGetQuery.mockReturnValue({ page: '3', pageSize: '10' } as never)
    expect(parsePagination({} as never)).toEqual({ page: 3, pageSize: 10, offset: 20, limit: 10 })
  })

  it('clamps page to a minimum of 1', () => {
    mockedGetQuery.mockReturnValue({ page: '0', pageSize: '10' } as never)
    expect(parsePagination({} as never).page).toBe(1)
    expect(parsePagination({} as never).offset).toBe(0)
  })

  it('clamps pageSize to a maximum of 100', () => {
    mockedGetQuery.mockReturnValue({ page: '1', pageSize: '500' } as never)
    expect(parsePagination({} as never).pageSize).toBe(100)
  })

  it('falls back to the default when pageSize is 0', () => {
    mockedGetQuery.mockReturnValue({ page: '1', pageSize: '0' } as never)
    expect(parsePagination({} as never).pageSize).toBe(10)
  })

  it('clamps negative pageSize to a minimum of 1', () => {
    mockedGetQuery.mockReturnValue({ page: '1', pageSize: '-5' } as never)
    expect(parsePagination({} as never).pageSize).toBe(1)
  })

  it('falls back to defaults for non-numeric input', () => {
    mockedGetQuery.mockReturnValue({ page: 'abc', pageSize: 'xyz' } as never)
    expect(parsePagination({} as never)).toEqual({ page: 1, pageSize: 10, offset: 0, limit: 10 })
  })
})

describe('buildPagination', () => {
  it('computes the correct pagination metadata', () => {
    expect(buildPagination(1, 20, 45)).toEqual({
      page: 1,
      pageSize: 20,
      total: 45,
      totalPages: 3,
      hasNext: true,
      hasPrev: false
    })
  })

  it('hasNext is false on the last page', () => {
    const meta = buildPagination(3, 20, 45)
    expect(meta.hasNext).toBe(false)
    expect(meta.hasPrev).toBe(true)
  })

  it('total pages is at least 1 (empty data)', () => {
    const meta = buildPagination(1, 20, 0)
    expect(meta.totalPages).toBe(1)
    expect(meta.hasNext).toBe(false)
  })
})