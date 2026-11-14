import { describe, expect, it, vi } from 'vitest'
import {
  ApiRegistry,
  filterEnabledModules,
  ModuleApiRouter,
  resolveModules,
  runModuleLifecycle,
  runModuleMigrations,
  satisfiesVersionRange,
  ToolRegistry,
  UiRegistry,
  sortModulesByDependencies,
  type ModuleManifest
} from '../../../../server/core/moduleSdk'
import { assertTransition, canTransition } from '../../../../server/core/moduleState'
import { activeDependents, isModuleStateUnavailable } from '../../../../server/core/moduleGuards'

function moduleManifest(id: string, dependencies: string[] = []): ModuleManifest {
  return {
    id,
    name: id,
    version: '1.0.0',
    dependencies,
    permissions: [],
    navigation: [],
    database: [],
    api: [],
    tools: [],
    components: []
  }
}

describe('sortModulesByDependencies', () => {
  it('sorts dependencies first with stable lexicographic ordering for ties', () => {
    const modules = [
      moduleManifest('z', ['b', 'a']),
      moduleManifest('b'),
      moduleManifest('a'),
      moduleManifest('c', ['a'])
    ]

    expect(sortModulesByDependencies(modules).map(module => module.id)).toEqual(['a', 'b', 'c', 'z'])
  })

  it('rejects duplicate module IDs', () => {
    expect(() => sortModulesByDependencies([moduleManifest('same'), moduleManifest('same')]))
      .toThrow('Duplicate module ID: same')
  })

  it('rejects missing dependencies', () => {
    expect(() => sortModulesByDependencies([moduleManifest('child', ['missing'])]))
      .toThrow('Module child has missing dependency: missing')
  })

  it('rejects circular dependencies', () => {
    expect(() => sortModulesByDependencies([
      moduleManifest('a', ['b']),
      moduleManifest('b', ['a'])
    ])).toThrow('Circular module dependencies: a, b')
  })

  it('rejects incompatible dependency versions', () => {
    const parent = { ...moduleManifest('parent', ['core']), dependencyRanges: { core: '^2.0.0' } }
    expect(() => sortModulesByDependencies([parent, moduleManifest('core')]))
      .toThrow('Module parent requires core@^2.0.0, found 1.0.0')
  })
})

describe('satisfiesVersionRange', () => {
  it('supports wildcard, exact, caret, tilde and comparison ranges', () => {
    expect(satisfiesVersionRange('1.2.3', undefined)).toBe(true)
    expect(satisfiesVersionRange('1.2.3', '*')).toBe(true)
    expect(satisfiesVersionRange('1.2.3', '1.2.3')).toBe(true)
    expect(satisfiesVersionRange('1.2.3', '1.2.4')).toBe(false)
    expect(satisfiesVersionRange('1.9.0', '^1.2.0')).toBe(true)
    expect(satisfiesVersionRange('2.0.0', '^1.2.0')).toBe(false)
    expect(satisfiesVersionRange('1.2.9', '~1.2.0')).toBe(true)
    expect(satisfiesVersionRange('1.3.0', '~1.2.0')).toBe(false)
    expect(satisfiesVersionRange('1.2.3', '>=1.2.0')).toBe(true)
    expect(satisfiesVersionRange('1.2.3', '>1.2.3')).toBe(false)
    expect(satisfiesVersionRange('not-a-version', '^1.0.0')).toBe(false)
    expect(satisfiesVersionRange('1.2.3', 'version-nonsense')).toBe(false)
  })
})

describe('module lifecycle transitions', () => {
  it('allows the documented forward path and denies shortcuts', () => {
    expect(canTransition('discovered', 'validated')).toBe(true)
    expect(canTransition('validated', 'installed')).toBe(true)
    expect(canTransition('installed', 'migrated')).toBe(true)
    expect(canTransition('migrated', 'active')).toBe(true)
    expect(canTransition('active', 'deactivated')).toBe(true)
    expect(canTransition('deactivated', 'active')).toBe(true)
    expect(canTransition('failed', 'validated')).toBe(true)
    expect(canTransition('deactivated', 'uninstalling')).toBe(true)
    expect(canTransition('uninstalling', 'uninstalled')).toBe(true)
    expect(canTransition('uninstalled', 'active')).toBe(false)
    expect(canTransition('active', 'uninstalled')).toBe(false)
    expect(canTransition('discovered', 'active')).toBe(false)
    expect(() => assertTransition('discovered', 'active'))
      .toThrow('Invalid module lifecycle transition: discovered -> active')
  })
})

describe('module removal guards', () => {
  const modules = [
    moduleManifest('core'),
    moduleManifest('child', ['core']),
    moduleManifest('grandchild', ['child'])
  ]

  it('blocks uninstall while a dependent module is active', () => {
    const states = new Map([['core', 'deactivated'], ['child', 'active'], ['grandchild', 'active']])
    expect(activeDependents(modules, 'core', id => states.get(id))).toEqual(['child'])
    expect(activeDependents(modules, 'child', id => states.get(id))).toEqual(['grandchild'])
    expect(activeDependents(modules, 'grandchild', id => states.get(id))).toEqual([])
  })

  it('ignores dependents that are not active and missing states', () => {
    const states = new Map([['core', 'deactivated'], ['child', 'deactivated'], ['grandchild', 'uninstalled']])
    expect(activeDependents(modules, 'core', id => states.get(id))).toEqual([])
    expect(activeDependents(modules, 'core', () => undefined)).toEqual([])
  })

  it('treats disabled and removed states as runtime-unavailable', () => {
    expect(isModuleStateUnavailable('active')).toBe(false)
    expect(isModuleStateUnavailable('migrated')).toBe(false)
    expect(isModuleStateUnavailable('deactivated')).toBe(true)
    expect(isModuleStateUnavailable('uninstalling')).toBe(true)
    expect(isModuleStateUnavailable('uninstalled')).toBe(true)
    expect(isModuleStateUnavailable(null)).toBe(false)
  })
})

describe('module registries', () => {
  it('enforces unique API IDs and requires schema, authorization and execution handlers', () => {
    const registry = new ApiRegistry()
    const api = { id: 'reports.read', schema: {}, authorize: () => true, execute: () => 'ok' }
    registry.register(api)
    expect(registry.get('reports.read')).toBe(api)
    expect(() => registry.register(api)).toThrow('Duplicate module registration ID: reports.read')
    expect(() => registry.register({ ...api, id: 'invalid', schema: undefined } as never)).toThrow('requires schema')
    expect(() => registry.register({ ...api, id: 'invalid-auth', authorize: undefined } as never)).toThrow('requires authorize')
    expect(() => registry.register({ ...api, id: 'invalid-execute', execute: undefined } as never)).toThrow('requires execute')
  })

  it('enforces unique Tool IDs and denies execution if authorization is absent or rejects', async () => {
    const registry = new ToolRegistry<{ userId: number }>()
    const execute = vi.fn(() => 'ran')
    registry.register({ id: 'unprotected', schema: {}, execute })
    registry.register({ id: 'protected', schema: {}, execute, authorize: context => context.userId === 1 })

    await expect(registry.run('unprotected', {}, { userId: 1 })).rejects.toThrow('authorization denied')
    await expect(registry.run('protected', {}, { userId: 2 })).rejects.toThrow('authorization denied')
    expect(execute).not.toHaveBeenCalled()
    await expect(registry.run('protected', {}, { userId: 1 })).resolves.toBe('ran')
    expect(execute).toHaveBeenCalledTimes(1)
    expect(() => registry.register({ id: 'protected', schema: {}, execute })).toThrow('Duplicate module registration ID: protected')
    expect(() => registry.register({ id: 'invalid', schema: {}, execute: undefined } as never)).toThrow('requires execute')
  })

  it('enforces the declared tool timeout', async () => {
    const registry = new ToolRegistry()
    registry.register({
      id: 'slow',
      schema: {},
      timeoutMs: 5,
      authorize: () => true,
      execute: () => new Promise(resolve => setTimeout(() => resolve('done'), 50))
    })
    await expect(registry.run('slow', {}, undefined)).rejects.toThrow('Module tool timed out: slow')
  })

  it('enforces output size limits and in-process rate limits', async () => {
    const registry = new ToolRegistry<{ userId: number }>()
    registry.register({
      id: 'big',
      schema: {},
      outputLimitBytes: 10,
      authorize: () => true,
      execute: () => ({ payload: 'x'.repeat(100) })
    })
    await expect(registry.run('big', {}, { userId: 1 })).rejects.toThrow('Module tool output exceeds 10 bytes: big')

    let runs = 0
    registry.register({
      id: 'limited',
      schema: {},
      rateLimit: { max: 2, windowMs: 60_000 },
      authorize: () => true,
      execute: () => ++runs
    })
    await expect(registry.run('limited', {}, { userId: 1 })).resolves.toBe(1)
    await expect(registry.run('limited', {}, { userId: 1 })).resolves.toBe(2)
    await expect(registry.run('limited', {}, { userId: 1 })).rejects.toThrow('Module tool rate limit exceeded: limited')
    await expect(registry.run('limited', {}, { userId: 2 })).resolves.toBe(3)
  })

  it('refuses to execute when the caller signal is aborted', async () => {
    const registry = new ToolRegistry<{ signal?: AbortSignal }>()
    const controller = new AbortController()
    controller.abort()
    registry.register({ id: 'cancelled', schema: {}, authorize: () => true, execute: () => 'nope' })
    await expect(registry.run('cancelled', {}, { signal: controller.signal }))
      .rejects.toThrow('Module tool cancelled: cancelled')
  })

  it('denies tool execution when the authorization callback throws', async () => {
    const registry = new ToolRegistry()
    const execute = vi.fn()
    registry.register({ id: 'throws', schema: {}, execute, authorize: () => {
      throw new Error('auth failure')
    } })

    await expect(registry.run('throws', {}, undefined)).rejects.toThrow('authorization denied')
    expect(execute).not.toHaveBeenCalled()
  })

  it('enforces unique UI IDs and requires schema and render handler', () => {
    const registry = new UiRegistry()
    const component = { id: 'panel', schema: {}, render: () => 'view' }
    registry.register(component)
    expect(registry.list()).toEqual([component])
    expect(() => registry.register(component)).toThrow('Duplicate module registration ID: panel')
    expect(() => registry.register({ ...component, id: 'invalid-schema', schema: undefined } as never)).toThrow('requires schema')
    expect(() => registry.register({ ...component, id: 'invalid-render', render: undefined } as never)).toThrow('requires render')
  })

  it('rejects unknown UI components and invalid props at render time', () => {
    const registry = new UiRegistry<{ variant?: string }, string>()
    registry.register({ id: 'status', schema: {}, render: props => props.variant ?? 'default' })
    expect(registry.render('status', {})).toBe('default')
    expect(() => registry.render('missing', {})).toThrow('Unknown module UI component: missing')

    const strict = new UiRegistry<{ ok: boolean }, string>()
    strict.register({ id: 'strict', schema: { safeParse: (value: unknown) => ({ success: (value as { ok?: boolean }).ok === true }) }, render: () => 'ok' })
    expect(() => strict.render('strict', { ok: false })).toThrow('Invalid input for module UI component strict')
  })

  it('rejects mismatched UI component versions', () => {
    const registry = new UiRegistry<Record<string, unknown>, string>()
    registry.register({ id: 'status', version: '1.0', schema: {}, render: () => 'ok' })
    expect(registry.render('status', {}, { version: '1.0' })).toBe('ok')
    expect(() => registry.render('status', {}, { version: '2.0' }))
      .toThrow('Module UI component version mismatch: status (expected 1.0, got 2.0)')
  })
})

describe('ModuleApiRouter', () => {
  const definition = {
    id: 'example.health',
    moduleId: 'example',
    method: 'get',
    path: '/health',
    schema: {} as Record<string, unknown>,
    authorize: () => true,
    handler: vi.fn(() => 'pong')
  }

  it('routes registered definitions and normalizes method and path', async () => {
    const router = new ModuleApiRouter<{ userId: number }>()
    router.register(definition)
    await expect(router.dispatch('get', '/health/', {}, { userId: 1 }, {})).resolves.toBe('pong')
    expect(router.list()).toHaveLength(1)
  })

  it('rejects duplicate routes and duplicate registration IDs', () => {
    const router = new ModuleApiRouter()
    router.register({ ...definition, handler: () => 'pong' })
    expect(() => router.register({ ...definition, id: 'example.other', handler: () => 'pong' }))
      .toThrow('Duplicate module API route: GET /health')
    expect(() => router.register({ ...definition, path: '/other', handler: () => 'pong' }))
      .toThrow('Duplicate module registration ID: example.health')
  })

  it('rejects unknown routes and unauthorized dispatch without invoking the handler', async () => {
    const handler = vi.fn(() => 'pong')
    const router = new ModuleApiRouter()
    router.register({ ...definition, authorize: () => false, handler })

    await expect(router.dispatch('post', '/health', {}, undefined, {})).rejects.toThrow('Unknown module API route: POST /health')
    await expect(router.dispatch('get', '/health', {}, undefined, {})).rejects.toThrow('authorization denied')
    expect(handler).not.toHaveBeenCalled()
  })

  it('validates input against the declared schema before authorization', async () => {
    const authorize = vi.fn(() => true)
    const router = new ModuleApiRouter()
    router.register({
      ...definition,
      schema: (input: unknown) => typeof input === 'object' && input !== null && 'query' in input,
      authorize,
      handler: () => 'pong'
    })

    await expect(router.dispatch('get', '/health', {}, undefined, {})).rejects.toThrow('Invalid input for module API example.health')
    expect(authorize).not.toHaveBeenCalled()
  })

  it('uses the injected rate limit store and rejects over-budget calls', async () => {
    const hits: string[] = []
    const router = new ModuleApiRouter({
      hit: async (key) => {
        hits.push(key)
        return { allowed: hits.length <= 2, retryAfter: hits.length <= 2 ? 0 : 5 }
      }
    })
    router.register({ ...definition, rateLimit: { max: 2, windowMs: 60_000 }, handler: () => 'pong' })

    await expect(router.dispatch('get', '/health', {}, { userId: 7 }, {})).resolves.toBe('pong')
    await expect(router.dispatch('get', '/health', {}, { userId: 7 }, {})).resolves.toBe('pong')
    await expect(router.dispatch('get', '/health', {}, { userId: 7 }, {})).rejects.toThrow('rate limit exceeded')
    expect(hits).toEqual(['example.health:7', 'example.health:7', 'example.health:7'])
  })
})

describe('module lifecycle and migrations', () => {
  it('resolves enabled modules in dependency order and rejects disabled dependencies', () => {
    const modules = [moduleManifest('example', ['core']), moduleManifest('core')]
    expect(resolveModules(modules, ['example', 'core']).enabledIds).toEqual(['core', 'example'])
    expect(() => resolveModules(modules, ['example'])).toThrow('requires disabled dependency')
    expect(() => resolveModules(modules, ['missing'])).toThrow('Unknown enabled module')
  })

  it('runs lifecycle callbacks in dependency order with enabled module migrations', async () => {
    const calls: string[] = []
    const modules = [
      { ...moduleManifest('example', ['core']), lifecycle: { onEnable: () => { calls.push('example') } }, migrations: [{ id: 'example:001', up: () => {} }] },
      { ...moduleManifest('core'), lifecycle: { onEnable: () => { calls.push('core') } } }
    ]
    await runModuleLifecycle(modules, ['example', 'core'], 'onEnable')
    expect(calls).toEqual(['core', 'example'])
  })

  it('runs module migrations once through the provided coordinator and rejects duplicate IDs', async () => {
    const applied = new Set<string>()
    const executeOnce = vi.fn(async (id: string, run: () => void | Promise<void>) => {
      if (applied.has(id)) return
      await run()
      applied.add(id)
    })
    const up = vi.fn()
    const migration = { id: 'example:001', up }
    await runModuleMigrations([migration], executeOnce, {})
    await runModuleMigrations([migration], executeOnce, {})
    expect(up).toHaveBeenCalledTimes(1)
    await expect(runModuleMigrations([migration, migration], executeOnce, {})).rejects.toThrow('Duplicate module migration ID')
  })
})

describe('filterEnabledModules', () => {
  it('filters the module collection by configured enable IDs without mutating inputs', () => {
    const modules = [moduleManifest('a'), moduleManifest('b'), moduleManifest('c')]
    const enabled = ['c', 'a']

    expect(filterEnabledModules(modules, enabled).map(module => module.id)).toEqual(['a', 'c'])
    expect(modules.map(module => module.id)).toEqual(['a', 'b', 'c'])
    expect(enabled).toEqual(['c', 'a'])
  })
})
