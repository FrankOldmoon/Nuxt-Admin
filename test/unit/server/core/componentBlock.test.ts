import { beforeEach, describe, expect, it } from 'vitest'
import {
  buildComponentPrompt,
  buildResultComponentDirective,
  extractComponentBlock,
  type ComponentBlockRegistry
} from '../../../../server/core/componentBlock'
import { getComponentMetrics, resetComponentMetrics } from '../../../../server/core/componentMetrics'

const registry: ComponentBlockRegistry = {
  get: id => (id === 'sms.student-table' ? { version: '1.0' } : undefined),
  validateProps: (id, props, options) => {
    if (id !== 'sms.student-table') throw new Error(`Unknown component: ${id}`)
    if (options?.version && options.version !== '1.0') throw new Error('version mismatch')
    if ('rows' in props) throw new Error('rows are not allowed')
    if (props.query !== undefined && typeof props.query !== 'string') throw new Error('invalid query')
  }
}

function block(payload: unknown): string {
  return '```component\n' + JSON.stringify(payload) + '\n```'
}

describe('component block protocol', () => {
  beforeEach(() => resetComponentMetrics())

  it('leaves replies without a block untouched', () => {
    const result = extractComponentBlock('全部学生都在这里。', registry)
    expect(result).toEqual({ content: '全部学生都在这里。' })
  })

  it('extracts a registered component and strips the block from the text', () => {
    const result = extractComponentBlock(`已找到 2 名学生。\n\n${block({
      component: 'sms.student-table',
      props: { query: '张' }
    })}`, registry)
    expect(result.content).toBe('已找到 2 名学生。')
    expect(result.error).toBeUndefined()
    expect(result.directive).toEqual({
      component: 'sms.student-table',
      version: undefined,
      props: { query: '张' }
    })
  })

  it('keeps the last block and removes every block', () => {
    const result = extractComponentBlock([
      block({ component: 'sms.student-table', props: {} }),
      '中间说明',
      block({ component: 'sms.student-table', props: { query: '李' } })
    ].join('\n'), registry)
    expect(result.content).toBe('中间说明')
    expect(result.directive?.props).toEqual({ query: '李' })
  })

  it('rejects unknown components but still strips the block', () => {
    const result = extractComponentBlock(`说明\n${block({ component: 'evil.widget' })}`, registry)
    expect(result.content).toBe('说明')
    expect(result.directive).toBeUndefined()
    expect(result.error).toMatch(/Unknown component/)
  })

  it('rejects malformed JSON', () => {
    const result = extractComponentBlock('说明\n```component\n{not json}\n```', registry)
    expect(result.content).toBe('说明')
    expect(result.directive).toBeUndefined()
    expect(result.error).toMatch(/Invalid component block JSON/)
  })

  it('rejects a version mismatch', () => {
    const result = extractComponentBlock(block({
      component: 'sms.student-table',
      version: '2.0',
      props: {}
    }), registry)
    expect(result.directive).toBeUndefined()
    expect(result.error).toMatch(/version mismatch/i)
  })

  it('rejects props that fail the registration schema', () => {
    const result = extractComponentBlock(block({
      component: 'sms.student-table',
      props: { rows: [{ name: '伪造学生' }] }
    }), registry)
    expect(result.directive).toBeUndefined()
    expect(result.error).toMatch(/rows are not allowed/)
  })

  it('rejects a non-object props payload', () => {
    const result = extractComponentBlock(block({
      component: 'sms.student-table',
      props: ['nope']
    }), registry)
    expect(result.directive).toBeUndefined()
    expect(result.error).toMatch(/props must be an object/)
  })

  it('builds a prompt listing only registered components', () => {
    expect(buildComponentPrompt([])).toBe('')
    const prompt = buildComponentPrompt([{ id: 'sms.student-table', label: '学生表格' }])
    expect(prompt).toContain('sms.student-table')
    expect(prompt).toContain('学生表格')
    expect(prompt).toContain('```component')
  })

  it('counts invalid and multiple blocks for observability', () => {
    extractComponentBlock('a\n```component\n{bad}\n```', registry)
    extractComponentBlock(`${block({ component: 'sms.student-table' })}\n${block({ component: 'sms.student-table' })}`, registry)

    const metrics = getComponentMetrics()
    expect(metrics.block_invalid_json).toBe(1)
    expect(metrics.block_multiple).toBe(1)
  })

  it('attaches a read capability default component from the input query', () => {
    const directive = buildResultComponentDirective(
      { resultView: { kind: 'table', columns: [{ key: 'name', label: '姓名' }], component: { id: 'sms.student-table' } } },
      { query: '张', limit: 10 },
      registry
    )
    expect(directive).toEqual({
      component: 'sms.student-table',
      version: '1.0',
      props: { query: '张', limit: 10 }
    })
    expect(getComponentMetrics().default_component_attached).toBe(1)
  })

  it('falls back to the `q` input and skips invalid default props', () => {
    const view = { resultView: { kind: 'table' as const, columns: [{ key: 'name', label: '姓名' }], component: { id: 'sms.student-table' } } }
    expect(buildResultComponentDirective(view, { q: '李' }, registry)?.props).toEqual({ query: '李' })

    // Validation rejects rows, so the default component is not attached.
    const rejecting: ComponentBlockRegistry = {
      get: () => ({ version: '1.0' }),
      validateProps: () => { throw new Error('invalid props') }
    }
    expect(buildResultComponentDirective(view, { query: '王' }, rejecting)).toBeUndefined()
    expect(getComponentMetrics().block_invalid_props).toBe(1)
  })

  it('does not attach an unregistered default component', () => {
    const directive = buildResultComponentDirective(
      { resultView: { kind: 'table', columns: [], component: { id: 'sms.missing' } } },
      {},
      registry
    )
    expect(directive).toBeUndefined()
    expect(getComponentMetrics().block_unknown_component).toBe(1)
  })
})
