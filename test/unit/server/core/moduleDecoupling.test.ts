import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Static guard: Core must not import a concrete business module. The only
 * seam is the root `modules.catalog.ts`.
 */
describe('module catalog decoupling', () => {
  const coreFiles = [
    'server/core/moduleSdk.ts',
    'server/core/moduleCatalog.ts',
    'server/core/authContext.ts',
    'server/core/permissions.ts',
    'server/core/dataScope.ts',
    'server/core/audit.ts',
    'server/utils/moduleRuntime.ts',
    'server/database/migrate.ts',
    'server/plugins/modules.ts',
    'server/plugins/database.ts'
  ]

  it('never imports a concrete module directly', () => {
    for (const file of coreFiles) {
      const source = readFileSync(resolve(process.cwd(), file), 'utf8')
      expect(source, file).not.toMatch(/from\s+['"][^'"]*\/modules\//)
      expect(source, file).not.toMatch(/from\s+['"]\.\.?\/modules\//)
    }
  })

  it('exposes the catalog as the single module list', () => {
    const source = readFileSync(resolve(process.cwd(), 'modules.catalog.ts'), 'utf8')
    expect(source).toContain('MODULE_DEFINITIONS')
    expect(source).toContain('AVAILABLE_MODULE_IDS')
    expect(source).toContain('DEFAULT_ENABLED_MODULE_IDS')
  })

  it('business modules only consume the public SDK, never Core internals', () => {
    const modulesDir = resolve(process.cwd(), 'modules')
    const moduleDirs = readdirSync(modulesDir, { withFileTypes: true })
      .filter(entry => entry.isDirectory() && entry.name !== 'node_modules')
      .map(entry => `modules/${entry.name}`)
    const files = moduleDirs
      .flatMap(dir => listSourceFiles(resolve(process.cwd(), dir)))
      .filter(file => !file.includes('/test/'))
    expect(files.length).toBeGreaterThan(0)
    for (const file of files) {
      expect(readFileSync(file, 'utf8'), file).not.toMatch(/from\s+['"][^'"]*server\/core\//)
    }
  })

  it('registers every local module in the static catalog', () => {
    const modulesDir = resolve(process.cwd(), 'modules')
    const catalog = readFileSync(resolve(process.cwd(), 'modules.catalog.ts'), 'utf8')
    const localModules = readdirSync(modulesDir, { withFileTypes: true })
      .filter(entry => entry.isDirectory() && entry.name !== 'node_modules')
      .map(entry => entry.name)
      .filter(name => existsSync(resolve(modulesDir, name, 'module.ts')))

    expect(localModules.length).toBeGreaterThan(0)
    for (const name of localModules) {
      expect(catalog, `module "${name}" is missing from modules.catalog.ts`)
        .toContain(`./modules/${name}/module`)
    }
  })
})

function listSourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = resolve(dir, entry.name)
    if (entry.isDirectory()) return entry.name === 'test' ? [] : listSourceFiles(full)
    return /\.(ts|vue)$/.test(entry.name) ? [full] : []
  })
}
