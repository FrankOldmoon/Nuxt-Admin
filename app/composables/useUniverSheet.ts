/**
 * Univer online spreadsheet: CDN load + initialization + data read/write
 */
export function useUniverSheet(
  headers: () => any[],
  colWidths: () => Record<string, number>,
  rowCount: () => number,
  active: () => boolean,
  showTools: () => boolean,
  showFooter: () => boolean,
  showContextMenu: () => boolean,
  initialData: () => any,
  onChange: () => void,
) {
  const sheetContainer = ref<HTMLElement | null>(null)
  const toast = useToast()

  let univerAPI: any = null
  let univerDispose: any = null

  // ========== CDN loading ==========
  function loadCss(url: string): Promise<boolean> {
    return new Promise((resolve) => {
      if (document.querySelector(`link[href="${url}"]`)) { resolve(true); return }
      const link = document.createElement('link')
      link.rel = 'stylesheet'
      link.href = url
      link.onload = () => resolve(true)
      link.onerror = () => resolve(false)
      document.head.appendChild(link)
    })
  }

  function loadScript(url: string): Promise<boolean> {
    return new Promise((resolve) => {
      const existing = document.querySelector(`script[src="${url}"]`) as HTMLScriptElement | null
      if (existing) {
        // Already present: resolve right away if loaded, otherwise wait for its onload/onerror
        if (existing.dataset.loaded === 'true') { resolve(true); return }
        if (existing.dataset.failed === 'true') { resolve(false); return }
        existing.addEventListener('load', () => resolve(true), { once: true })
        existing.addEventListener('error', () => resolve(false), { once: true })
        return
      }
      const script = document.createElement('script')
      script.src = url
      script.onload = () => { script.dataset.loaded = 'true'; resolve(true) }
      script.onerror = () => { script.dataset.failed = 'true'; resolve(false) }
      document.head.appendChild(script)
    })
  }

  // Univer CDN resources
  const UNIVER_CDN = {
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

  // ========== Destroy Univer instance ==========
  function destroyUniver() {
    if (univerDispose) {
      try { univerDispose() } catch { /* noop */ }
      univerDispose = null
      univerAPI = null
    }
  }

  // ========== Initialize Univer ==========
  async function initSheet() {
    if (!sheetContainer.value) return

    await loadCss(UNIVER_CDN.css)

    // Load required scripts in order (they depend on each other)
    for (const url of UNIVER_CDN.scripts) {
      const ok = await loadScript(url)
      if (!ok) {
        toast.add({ title: 'Univer load failed', color: 'error' })
        return
      }
    }

    // Try loading the Chinese language pack (failure does not block init)
    await loadScript(UNIVER_CDN.locale)

    // Safely read the UMD globals mounted on window.
    // Note: if a CDN script fails to load / is blocked, the corresponding
    // window property will be undefined, and destructuring throws
    // "Cannot destructure property 'X' of undefined". So use optional
    // chaining + local fallbacks, then validate them all.
    const UniverPresets = (window as any).UniverPresets
    const UniverCore = (window as any).UniverCore
    const UniverPresetSheetsCore = (window as any).UniverPresetSheetsCore

    const createUniver = UniverPresets?.createUniver
    const LocaleType = UniverCore?.LocaleType
    const mergeLocales = UniverCore?.mergeLocales
    const UniverSheetsCorePreset = UniverPresetSheetsCore?.UniverSheetsCorePreset

    if (!createUniver || !LocaleType || !UniverSheetsCorePreset) {
      toast.add({
        title: 'Univer resources failed to load. Check your network (can unpkg.com be reached?) and retry.',
        color: 'error',
      })
      return
    }

    destroyUniver()

    // Build cellData: row 0 always holds the header, data starts at row 1
    const cellData: Record<number, any> = {}
    const hdrs = headers()
    if (hdrs.length) {
      const headerRow: Record<number, any> = {}
      hdrs.forEach((text, c) => { headerRow[c] = { v: text } })
      cellData[0] = headerRow
    }
    // Fill initial data rows (skip row 0 when there is a header; otherwise start from row 0)
    const init = initialData()
    if (init) {
      for (const rowKey in init) {
        const r = Number(rowKey)
        if (r === 0 && hdrs.length) continue
        cellData[r] = init[rowKey]
      }
    }

    // Build column widths data
    const columnData: Record<number, any> = {}
    Object.entries(colWidths()).forEach(([k, w]) => {
      columnData[Number(k)] = { w }
    })

    // Merge the Chinese language pack (if the pack or mergeLocales is missing, skip and use default English)
    const zhCN = (window as any).UniverPresetSheetsCoreZhCN
    const locales = (zhCN && mergeLocales)
      ? { [LocaleType.ZH_CN]: mergeLocales(zhCN) }
      : {}

    const { univerAPI: api, dispose } = createUniver({
      locale: LocaleType.ZH_CN,
      locales,
      presets: [
        UniverSheetsCorePreset({
          container: sheetContainer.value,
          header: showTools(),
          footer: showFooter(),
          contextMenu: showContextMenu(),
        }),
      ],
    })

    univerAPI = api
    univerDispose = dispose

    // Create the workbook (header row + initial data)
    univerAPI.createWorkbook({
      id: 'univer-sheet',
      name: 'Sheet',
      sheets: {
        sheet1: {
          id: 'sheet1',
          name: 'Sheet1',
          rowCount: rowCount(),
          columnCount: hdrs.length || 10,
          cellData,
          columnData,
        },
      },
    })

    // Listen for cell data changes
    // Univer SDK has no WorkbookValueChanged event, so use CommandExecuted instead
    // CommandExecuted runs after every command (cell editing, formatting, etc.)
    // Combined with the outer 500ms debounce, it won't save too often
    try {
      const EventEnum = univerAPI.Event
      if (EventEnum?.CommandExecuted) {
        univerAPI.addEvent(EventEnum.CommandExecuted, () => { onChange() })
      }
    } catch { /* noop */ }
  }

  // ========== Read all data rows (skip header) ==========
  function getRows(): string[][] {
    if (!univerAPI) return []
    const fWorkbook = univerAPI.getActiveWorkbook()
    if (!fWorkbook) return []
    const fWorksheet = fWorkbook.getActiveSheet()
    if (!fWorksheet) return []

    const snapshot = fWorksheet.getSheet().getSnapshot()
    const cellData = snapshot.cellData || {}
    const hdrs = headers()

    const rows: string[][] = []
    const maxRow = Math.max(rowCount(), ...Object.keys(cellData).map(Number))
    for (let r = 1; r <= maxRow; r++) {
      const row = cellData[r]
      if (!row) continue
      const values = hdrs.map((_, c) => {
        const cell = row[c]
        return cell ? String(cell.v ?? '').trim() : ''
      })
      if (values.every(v => !v)) continue
      rows.push(values)
    }
    return rows
  }

  // ========== Export current cellData ==========
  function getCellData(): Record<number, any> | null {
    if (!univerAPI) return null
    const fWorkbook = univerAPI.getActiveWorkbook()
    if (!fWorkbook) return null
    const fWorksheet = fWorkbook.getActiveSheet()
    if (!fWorksheet) return null

    const snapshot = fWorksheet.getSheet().getSnapshot()
    const cellData = snapshot.cellData || {}
    const result: Record<number, any> = {}
    for (const rowKey in cellData) {
      const r = Number(rowKey)
      result[r] = cellData[rowKey]
    }
    return result
  }

  // ========== Reset (re-initialize an empty table) ==========
  async function reset() {
    await initSheet()
  }

  // ========== Overwrite sheet data rows with sorted/filtered rows ==========
  function setSortedRows(rows: (string | undefined | null)[][]) {
    if (!univerAPI) return
    const fWorkbook = univerAPI.getActiveWorkbook()
    if (!fWorkbook) return
    const fWorksheet = fWorkbook.getActiveSheet()
    if (!fWorksheet) return

    const snapshot = fWorksheet.getSheet().getSnapshot()
    const oldCellData = snapshot.cellData || {}
    const headerRow = oldCellData[0] || {}
    const columnData = snapshot.columnData || {}

    // Build new cellData (keep row-0 header + sorted data rows)
    const newCellData: Record<number, any> = { 0: headerRow }
    rows.forEach((row, idx) => {
      const r = idx + 1
      const rowData: Record<number, any> = {}
      row.forEach((val, c) => {
        if (val !== '' && val !== undefined && val !== null) {
          rowData[c] = { v: val }
        }
      })
      if (Object.keys(rowData).length) {
        newCellData[r] = rowData
      }
    })

    const unitId = fWorkbook.getId()
    univerAPI.disposeUnit(unitId)

    univerAPI.createWorkbook({
      id: 'univer-sheet',
      name: 'Sheet',
      sheets: {
        sheet1: {
          id: 'sheet1',
          name: 'Sheet1',
          rowCount: rowCount(),
          columnCount: headers().length,
          cellData: newCellData,
          columnData,
        },
      },
    })
  }

  // ========== Lifecycle ==========
  watch(active, (val) => {
    if (val) {
      nextTick(() => initSheet())
    } else {
      destroyUniver()
    }
  }, { immediate: true })

  // Render side: re-initialize when initialData changes
  watch(initialData, (val, oldVal) => {
    if (val && JSON.stringify(val) !== JSON.stringify(oldVal)) {
      nextTick(() => initSheet())
    }
  })

  onBeforeUnmount(() => {
    destroyUniver()
  })

  return {
    sheetContainer,
    getRows,
    getCellData,
    setSortedRows,
    reset,
  }
}
