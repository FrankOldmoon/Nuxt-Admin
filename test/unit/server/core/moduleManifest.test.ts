import { describe, expect, it } from 'vitest'
import {
  CORE_VERSION,
  MODULE_API_VERSION,
  validateModuleManifests,
  validateModuleMigrationMetadata
} from '../../../../server/core/moduleManifest'
import { resolveModuleCatalog } from '../../../../server/core/moduleCatalog'
import { MODULE_DEFINITIONS, resolveEnabledModuleIds } from '../../../../modules.catalog'
import type { ModuleDefinition, ModuleManifest } from '../../../../server/core/moduleSdk'

function manifest(id = 'demo', overrides: Partial<ModuleManifest> = {}): ModuleManifest {
  return {
    id,
    name: id,
    version: '1.0.0',
    dependencies: [],
    permissions: [],
    navigation: [],
    database: [],
    api: [],
    tools: [],
    components: [],
    ...overrides
  }
}

describe('validateModuleManifests', () => {
  it('accepts a valid manifest and the real catalog', () => {
    expect(() => validateModuleManifests([manifest()])).not.toThrow()
    expect(() => resolveModuleCatalog(MODULE_DEFINITIONS, resolveEnabledModuleIds())).not.toThrow()
  })

  it('rejects invalid and duplicate module IDs', () => {
    expect(() => validateModuleManifests([manifest('Demo')]))
      .toThrow('Invalid module ID: Demo')
    expect(() => validateModuleManifests([manifest('1demo')]))
      .toThrow('Invalid module ID: 1demo')
    expect(() => validateModuleManifests([manifest('same'), manifest('same')]))
      .toThrow('Duplicate module ID: same')
  })

  it('rejects missing or non-semver versions', () => {
    expect(() => validateModuleManifests([manifest('demo', { version: '' })]))
      .toThrow('Module demo has an invalid semantic version:')
    expect(() => validateModuleManifests([manifest('demo', { version: '1.0' })]))
      .toThrow('Module demo has an invalid semantic version: 1.0')
  })

  it('enforces the module API contract version', () => {
    expect(() => validateModuleManifests([manifest('demo', { apiVersion: MODULE_API_VERSION })]))
      .not.toThrow()
    expect(() => validateModuleManifests([manifest('demo', { apiVersion: '2' })]))
      .toThrow('Module demo requires unsupported API version: 2')
  })

  it('enforces the core compatibility range', () => {
    expect(() => validateModuleManifests([manifest('demo', { compatibility: { core: `^${CORE_VERSION}` } })]))
      .not.toThrow()
    expect(() => validateModuleManifests([manifest('demo', { compatibility: { core: '^9.0.0' } })]))
      .toThrow(`Module demo is incompatible with core ${CORE_VERSION} (requires ^9.0.0)`)
  })

  it('rejects wildcard, malformed and duplicate permissions', () => {
    expect(() => validateModuleManifests([manifest('demo', { permissions: ['*'] })]))
      .toThrow('Module demo must not declare the wildcard permission')
    expect(() => validateModuleManifests([manifest('demo', { permissions: ['Bad Permission'] })]))
      .toThrow('Module demo has an invalid permission: Bad Permission')
    expect(() => validateModuleManifests([manifest('demo', { permissions: ['demo:read', 'demo:read'] })]))
      .toThrow('Module demo declares duplicate permission: demo:read')
  })

  it('rejects malformed and duplicate navigation entries', () => {
    expect(() => validateModuleManifests([manifest('demo', { navigation: [{ id: 'demo' }] })]))
      .toThrow('Module demo has an invalid navigation entry')
    expect(() => validateModuleManifests([manifest('demo', {
      navigation: [
        { id: 'demo', label: 'Demo', to: '/demo' },
        { id: 'demo', label: 'Demo again', to: '/demo-2' }
      ]
    })])).toThrow('Module demo has duplicate navigation id: demo')
  })

  it('requires boolean capabilities and a known migration scope', () => {
    expect(() => validateModuleManifests([manifest('demo', { capabilities: { beta: true } })]))
      .not.toThrow()
    expect(() => validateModuleManifests([manifest('demo', { capabilities: { beta: 'yes' as unknown as boolean } })]))
      .toThrow('Module demo capability beta must be a boolean')
    expect(() => validateModuleManifests([manifest('demo', { migrationScope: 'cluster' as never })]))
      .toThrow('Module demo has an invalid migration scope: cluster')
  })
})

describe('validateModuleMigrationMetadata', () => {
  it('requires non-empty unique IDs and a checksum revision', () => {
    expect(() => validateModuleMigrationMetadata([
      { id: 'demo', migrations: [{ id: 'demo:001', checksum: '1' }] }
    ])).not.toThrow()

    expect(() => validateModuleMigrationMetadata([
      { id: 'demo', migrations: [{ id: '', checksum: '1' }] }
    ])).toThrow('Module demo has a migration with an empty ID')

    expect(() => validateModuleMigrationMetadata([
      { id: 'demo', migrations: [{ id: 'demo:001' }] }
    ])).toThrow('Module migration demo:001 must declare a checksum revision')

    expect(() => validateModuleMigrationMetadata([
      { id: 'demo', migrations: [{ id: 'demo:001', checksum: '1' }] },
      { id: 'other', migrations: [{ id: 'demo:001', checksum: '1' }] }
    ])).toThrow('Duplicate module migration ID: demo:001')
  })
})

describe('resolveModuleCatalog', () => {
  function definition(id: string, dependencies: string[] = []): ModuleDefinition {
    return { ...manifest(id, { dependencies }) }
  }

  it('rejects unknown enabled IDs before resolving', () => {
    expect(() => resolveModuleCatalog([definition('demo')], ['missing']))
      .toThrow('Unknown enabled module: missing')
  })

  it('returns dependency-ordered modules for the enabled set', () => {
    const resolved = resolveModuleCatalog(
      [definition('app', ['core']), definition('core')],
      ['app', 'core']
    )
    expect(resolved.enabledIds).toEqual(['core', 'app'])
  })
})
