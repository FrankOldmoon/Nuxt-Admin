import { describe, expect, it, vi } from 'vitest'
import {
  ApiRegistry,
  filterEnabledModules,
  ModuleApiRouter,
  resolveModules,
  runModuleLifecycle,
  runModuleMigrations,
  ToolRegistry,
  UiRegistry,
  sortModulesByDependencies,
  type ModuleManifest
} from '../../../../server/core/moduleSdk'

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
