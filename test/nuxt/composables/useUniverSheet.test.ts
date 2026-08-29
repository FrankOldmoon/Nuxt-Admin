import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const CDN = {
  css: 'https://unpkg.com/@univerjs/preset-sheets-core/lib/index.css',
  scripts: [
    'https://unpkg.com/react@18.3.1/umd/react.production.min.js',
    'https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js',
    'https://unpkg.com/rxjs/dist/bundles/rxjs.umd.min.js',
    'https://unpkg.com/echarts@5.6.0/dist/echarts.min.js',
    'https://unpkg.com/@univerjs/presets/lib/umd/index.js',
    'https://unpkg.com/@univerjs/preset-sheets-core/lib/umd/index.js',
  ],
  locale: 'https://unpkg.com/@univerjs/preset-sheets-core/lib/umd/locales/zh-CN.js',
}

const HEADERS = ['Column A', 'Column B']

const ctx = vi.hoisted(() => {
  const toastAdd = vi.fn()
  const watchCalls: Array<{ source: unknown; cb: (v: any, old?: any) => void; opts?: { immediate?: boolean } }> = []
  const unmountHooks: Array<() => void> = []
  const nextTickFns: Array<() => void> = []

  const createWorkbook = vi.fn()
  const getActiveWorkbook = vi.fn()
  const disposeUnit = vi.fn()
  const addEvent = vi.fn()
  const univerAPI = {
    createWorkbook, getActiveWorkbook, disposeUnit, addEvent,
    Event: { CommandExecuted: 'CommandExecuted' },
  }
  const dispose = vi.fn()
  const createUniver = vi.fn(() => ({ univerAPI, dispose }))
  const presetMock = vi.fn((opts: unknown) => opts)
  const mergeLocales = vi.fn((x: unknown) => x)

  const failUrls = new Set<string>()
  const appended: Array<{ src: string; href: string; onload?: (() => void) | null; onerror?: (() => void) | null }> = []
  // document stub: querySelector always returns null, appendChild synchronously fires onload/onerror
  const docStub = {
    querySelector: () => null,
    createElement: () => ({
      src: '', href: '', rel: '', dataset: {} as Record<string, string>,
      onload: null as null | (() => void), onerror: null as null | (() => void),
    }),
    head: {
      appendChild: (el: { src: string; href: string; onload: (() => void) | null; onerror: (() => void) | null }) => {
        appended.push(el)
        if (failUrls.has(el.src || el.href)) el.onerror?.()
        else el.onload?.()
      },
    },
  }
  const zhCN = { sheets: {} }

  return {
    toastAdd, watchCalls, unmountHooks, nextTickFns,
    createWorkbook, getActiveWorkbook, disposeUnit, addEvent, dispose,
    createUniver, presetMock, mergeLocales, failUrls, appended, docStub, zhCN,
  }
})

mockNuxtImport('useToast', () => () => ({ add: ctx.toastAdd }))
mockNuxtImport('watch', () => (source: unknown, cb: (v: any, old?: any) => void, opts?: { immediate?: boolean }) => {
  ctx.watchCalls.push({ source, cb, opts })
  if (opts?.immediate) cb((source as () => unknown)())
})
mockNuxtImport('nextTick', () => (fn: () => void) => { ctx.nextTickFns.push(fn) })
mockNuxtImport('onBeforeUnmount', () => (fn: () => void) => { ctx.unmountHooks.push(fn) })

import { useUniverSheet } from '~/composables/useUniverSheet'

function makeComposable(opts: {
  headers?: () => any[]
  colWidths?: () => Record<string, number>
  rowCount?: () => number
  active?: () => boolean
  showTools?: () => boolean
  showFooter?: () => boolean
  showContextMenu?: () => boolean
  initialData?: () => any
} = {}) {
  const headers = opts.headers ?? vi.fn(() => HEADERS)
  const colWidths = opts.colWidths ?? vi.fn(() => ({ 0: 120, 1: 200 }))
  const rowCount = opts.rowCount ?? vi.fn(() => 50)
  const active = opts.active ?? vi.fn(() => false)
  const showTools = opts.showTools ?? vi.fn(() => true)
  const showFooter = opts.showFooter ?? vi.fn(() => false)
  const showContextMenu = opts.showContextMenu ?? vi.fn(() => false)
  const initialData = opts.initialData ?? vi.fn(() => null)
  const onChange = vi.fn()
  const composable = useUniverSheet(
    headers, colWidths, rowCount, active, showTools, showFooter, showContextMenu, initialData, onChange,
  )
  return { composable, headers, colWidths, rowCount, active, showTools, showFooter, showContextMenu, initialData, onChange }
}

/** Attach a snapshot stub to getActiveWorkbook for an initialized instance */
function stubSnapshot(snapshot: { cellData?: any; columnData?: any }) {
  ctx.getActiveWorkbook.mockReturnValue({
    getId: () => 'unit-1',
    getActiveSheet: () => ({ getSheet: () => ({ getSnapshot: () => snapshot }) }),
  })
}

describe('useUniverSheet', () => {
  beforeEach(() => {
    ctx.toastAdd.mockReset()
    ctx.watchCalls.length = 0
    ctx.unmountHooks.length = 0
    ctx.nextTickFns.length = 0
    ctx.createUniver.mockClear() // keep implementation
    ctx.createWorkbook.mockClear()
    ctx.getActiveWorkbook.mockReset()
    ctx.disposeUnit.mockReset()
    ctx.addEvent.mockReset()
    ctx.dispose.mockReset()
    ctx.presetMock.mockClear()
    ctx.mergeLocales.mockClear()
    ctx.failUrls.clear()
    ctx.appended.length = 0
    vi.stubGlobal('document', ctx.docStub)
    vi.stubGlobal('window', {
      UniverPresets: { createUniver: ctx.createUniver },
      UniverCore: { LocaleType: { ZH_CN: 'ZH_CN' }, mergeLocales: ctx.mergeLocales },
      UniverPresetSheetsCore: { UniverSheetsCorePreset: ctx.presetMock },
      UniverPresetSheetsCoreZhCN: ctx.zhCN,
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('registers active (immediate) + initialData watches and an onBeforeUnmount hook', () => {
    const { composable, active, initialData } = makeComposable({ active: () => true })

    expect(ctx.watchCalls).toHaveLength(2)
    expect(ctx.watchCalls[0]!.source).toBe(active)
    expect(ctx.watchCalls[0]!.opts?.immediate).toBe(true)
    expect(ctx.watchCalls[1]!.source).toBe(initialData)

    // the immediate callback with active=true queues one nextTick-init task
    expect(ctx.nextTickFns).toHaveLength(1)
    // with an empty container the init task returns safely and never creates Univer
    ;(ctx.nextTickFns[0] as () => void)()
    expect(ctx.createUniver).not.toHaveBeenCalled()

    // initialData change with different content re-queues init; same content / empty data does not
    ctx.nextTickFns.length = 0
    ctx.watchCalls[1]!.cb({ 1: { 0: { v: 'x' } } }, undefined)
    expect(ctx.nextTickFns).toHaveLength(1)
    ctx.nextTickFns.length = 0
    const same = { 1: { 0: { v: 'x' } } }
    ctx.watchCalls[1]!.cb(same, same)
    ctx.watchCalls[1]!.cb(null, same)
    expect(ctx.nextTickFns).toHaveLength(0)

    expect(composable.sheetContainer.value).toBeNull()
    expect(ctx.unmountHooks).toHaveLength(1)
  })

  it('reset loads resources in CDN order and creates the workbook (header row + initial data + column widths + zh-CN locale)', async () => {
    const initialData = () => ({
      0: { 0: { v: 'overridden by header' } },
      1: { 0: { v: 'a' }, 1: { v: 'b' } },
    })
    const { composable, onChange } = makeComposable({ initialData })
    const container = { tag: 'div' }
    composable.sheetContainer.value = container as any

    await composable.reset()

    // CSS first, then the 6 dependency scripts in order, and finally the zh-CN locale (failures don't block)
    expect(ctx.appended[0]!.href).toBe(CDN.css)
    expect(ctx.appended.slice(1).map(e => e.src)).toEqual([...CDN.scripts, CDN.locale])

    // createUniver args: locale, merged zh-CN locale pack, preset options passthrough
    expect(ctx.createUniver).toHaveBeenCalledTimes(1)
    const arg = (ctx.createUniver.mock.calls[0] as any[])[0]
    expect(arg.locale).toBe('ZH_CN')
    expect(ctx.mergeLocales).toHaveBeenCalledWith(ctx.zhCN)
    expect(arg.locales).toEqual({ ZH_CN: ctx.zhCN })
    expect(ctx.presetMock).toHaveBeenCalledWith({ container, header: true, footer: false, contextMenu: false })
    expect(arg.presets).toEqual([{ container, header: true, footer: false, contextMenu: false }])

    // workbook structure: row 0 header, initial data skips row 0, column width mapping
    expect(ctx.createWorkbook).toHaveBeenCalledWith({
      id: 'univer-sheet',
      name: 'Sheet',
      sheets: {
        sheet1: {
          id: 'sheet1',
          name: 'Sheet1',
          rowCount: 50,
          columnCount: 2,
          cellData: {
            0: { 0: { v: 'Column A' }, 1: { v: 'Column B' } },
            1: { 0: { v: 'a' }, 1: { v: 'b' } },
          },
          columnData: { 0: { w: 120 }, 1: { w: 200 } },
        },
      },
    })

    // CommandExecuted event callback forwards onChange
    expect(ctx.addEvent).toHaveBeenCalledWith('CommandExecuted', expect.any(Function))
    ;((ctx.addEvent.mock.calls[0] as any[])[1] as () => void)()
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('fills initial data from row 0 when there is no header, defaulting to 10 columns', async () => {
    const { composable } = makeComposable({
      headers: () => [],
      colWidths: () => ({}),
      initialData: () => ({ 0: { 0: { v: 'x' } } }),
    })
    composable.sheetContainer.value = {} as any
    await composable.reset()

    const wb = (ctx.createWorkbook.mock.calls[0] as any[])[0]
    expect(wb.sheets.sheet1.columnCount).toBe(10)
    expect(wb.sheets.sheet1.cellData).toEqual({ 0: { 0: { v: 'x' } } })
    expect(wb.sheets.sheet1.columnData).toEqual({})
  })

  it('when any dependency script fails, it shows an error and does not initialize', async () => {
    ctx.failUrls.add(CDN.scripts[3]!)
    const { composable } = makeComposable()
    composable.sheetContainer.value = {} as any

    await composable.reset()

    expect(ctx.toastAdd).toHaveBeenCalledWith({ title: 'Univer load failed', color: 'error' })
    expect(ctx.createUniver).not.toHaveBeenCalled()
    expect(ctx.createWorkbook).not.toHaveBeenCalled()
  })

  it('when the Univer global is missing on window, it shows a network error and does not initialize', async () => {
    vi.stubGlobal('window', {})
    const { composable } = makeComposable()
    composable.sheetContainer.value = {} as any

    await composable.reset()

    expect(ctx.toastAdd).toHaveBeenCalledWith({
      title: 'Univer resources failed to load. Check your network (can unpkg.com be reached?) and retry.',
      color: 'error',
    })
    expect(ctx.createUniver).not.toHaveBeenCalled()
  })

  it('reset returns immediately when sheetContainer is empty, loading no resources', async () => {
    const { composable } = makeComposable()
    await composable.reset()
    expect(ctx.appended).toHaveLength(0)
    expect(ctx.createUniver).not.toHaveBeenCalled()
  })

  it('getRows returns an empty array when not initialized', () => {
    const { composable } = makeComposable()
    expect(composable.getRows()).toEqual([])
  })

  it('getRows skips the header and fully-empty rows, reading cell values with trim', async () => {
    const { composable } = makeComposable()
    composable.sheetContainer.value = {} as any
    await composable.reset()

    stubSnapshot({
      cellData: {
        0: { 0: { v: 'Column A' }, 1: { v: 'Column B' } },
        1: { 0: { v: ' a ' }, 1: { v: 42 } },
        2: { 0: { v: '' }, 1: { v: '' } }, // fully-empty row -> skipped
        3: { 0: { v: 'x' } },              // missing column 2 -> filled with empty string
      },
    })

    expect(composable.getRows()).toEqual([['a', '42'], ['x', '']])
  })

  it('getRows returns an empty array with no active workbook/sheet', async () => {
    const { composable } = makeComposable()
    composable.sheetContainer.value = {} as any
    await composable.reset()

    ctx.getActiveWorkbook.mockReturnValue(null)
    expect(composable.getRows()).toEqual([])

    ctx.getActiveWorkbook.mockReturnValue({ getActiveSheet: () => null })
    expect(composable.getRows()).toEqual([])
  })

  it('getCellData returns null when uninitialized and the snapshot cellData once initialized', async () => {
    expect(makeComposable().composable.getCellData()).toBeNull()

    const { composable } = makeComposable()
    composable.sheetContainer.value = {} as any
    await composable.reset()

    const cellData = { 0: { 0: { v: 'H' } }, 2: { 1: { v: 'z' } } }
    stubSnapshot({ cellData })
    expect(composable.getCellData()).toEqual(cellData)
  })

  it('setSortedRows keeps the header row, rebuilds data rows and disposes the old workbook', async () => {
    const { composable } = makeComposable()
    composable.sheetContainer.value = {} as any
    await composable.reset()

    stubSnapshot({
      cellData: { 0: { 0: { v: 'Column A' }, 1: { v: 'Column B' } }, 1: { 0: { v: 'old' } }, 7: { 1: { v: 'zzz' } } },
      columnData: { 0: { w: 100 }, 1: { w: 150 } },
    })

    composable.setSortedRows([['a', ''], ['b', 'c']])

    expect(ctx.disposeUnit).toHaveBeenCalledWith('unit-1')
    expect(ctx.createWorkbook).toHaveBeenLastCalledWith({
      id: 'univer-sheet',
      name: 'Sheet',
      sheets: {
        sheet1: {
          id: 'sheet1',
          name: 'Sheet1',
          rowCount: 50,
          columnCount: 2,
          cellData: {
            0: { 0: { v: 'Column A' }, 1: { v: 'Column B' } },
            1: { 0: { v: 'a' } }, // empty string is skipped
            2: { 0: { v: 'b' }, 1: { v: 'c' } },
          },
          columnData: { 0: { w: 100 }, 1: { w: 150 } },
        },
      },
    })

    // calling setSortedRows before initialization returns safely
    expect(() => makeComposable().composable.setSortedRows([['a']])).not.toThrow()
  })

  it('destroys the instance when active becomes false, and the unmount hook destroys it too', async () => {
    const { composable } = makeComposable()
    composable.sheetContainer.value = {} as any
    await composable.reset()
    expect(ctx.dispose).not.toHaveBeenCalled()

    ctx.watchCalls[0]!.cb(false) // active watch callback
    expect(ctx.dispose).toHaveBeenCalledTimes(1)

    // re-destroying after destroy is an idempotent no-op
    ctx.unmountHooks[0]!()
    expect(ctx.dispose).toHaveBeenCalledTimes(1)

    // after re-initialization, the unmount hook can trigger destruction again
    await composable.reset()
    ctx.unmountHooks[0]!()
    expect(ctx.dispose).toHaveBeenCalledTimes(2)
  })

  it('swallows a dispose error and clears internal state', async () => {
    const { composable } = makeComposable()
    composable.sheetContainer.value = {} as any
    await composable.reset()
    ctx.getActiveWorkbook.mockReturnValue(null)

    ctx.dispose.mockImplementationOnce(() => { throw new Error('dispose boom') })
    expect(() => ctx.watchCalls[0]!.cb(false)).not.toThrow()
    // univerAPI is now torn down, so reads return safely
    expect(composable.getRows()).toEqual([])
    expect(composable.getCellData()).toBeNull()
  })
})
