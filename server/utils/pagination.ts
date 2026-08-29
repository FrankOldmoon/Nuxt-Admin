import type { H3Event } from 'h3'
import { getQuery } from 'h3'

export interface PageQuery {
  page: number
  pageSize: number
  offset: number
  limit: number
}

export interface PaginationMeta {
  page: number
  pageSize: number
  total: number
  totalPages: number
  hasNext: boolean
  hasPrev: boolean
}

const DEFAULT_PAGE_SIZE = 10
const MAX_PAGE_SIZE = 100

/** Parse ?page & ?pageSize from the query string into a safe offset/limit pair. */
export function parsePagination(event: H3Event): PageQuery {
  const query = getQuery(event)
  const page = Math.max(1, Math.floor(Number(query.page) || 1))
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(Number(query.pageSize) || DEFAULT_PAGE_SIZE)))
  return {
    page,
    pageSize,
    offset: (page - 1) * pageSize,
    limit: pageSize
  }
}

/** Build the pagination metadata returned alongside a paged result set. */
export function buildPagination(page: number, pageSize: number, total: number): PaginationMeta {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  return {
    page,
    pageSize,
    total,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1
  }
}
