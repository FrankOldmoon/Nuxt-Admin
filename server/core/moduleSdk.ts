import type { RateLimitStore } from '../utils/rateLimit'

export interface ModuleManifestItem {
  id: string
  [key: string]: unknown
}

/**
 * Declarative module metadata. Everything here is validated at registration
 * time (unique IDs, dependency resolution) and is build-time static — runtime
 * enable/disable only decides which of these declarations get registered.
 */
export interface ModuleManifest {
  /** Stable unique module ID (also used as the layer folder name). */
  id: string
  name: string
  version: string
  /** Other module IDs that must be enabled too; ordering is dependency-first. */
  dependencies: readonly string[]
  /** Optional semver ranges keyed by dependency ID (e.g. `{ core: '^1.2.0' }`). */
  dependencyRanges?: Readonly<Record<string, string>>
  /** Module API contract version; must match `MODULE_API_VERSION`. */
  apiVersion?: string
  /** Host compatibility ranges (e.g. `{ core: '^1.0.0' }`). */
  compatibility?: { readonly core?: string }
  /** Declared capability flags; values must be booleans. */
  capabilities?: Readonly<Record<string, boolean>>
  /** Whether migrations are applied globally or per tenant. */
  migrationScope?: 'global' | 'tenant'
  /** Permission entries owned by the module (e.g. `example:read`). */
  permissions: readonly string[]
  /** Navigation entries merged into the dashboard menu by the host. */
  navigation: readonly ModuleManifestItem[]
  /** Module-owned database table names (created by module migrations). */
  database: readonly string[]
  /** Declared API routes, served by `/api/modules/**`. */
  api: readonly string[]
  /** Server tool IDs registered in the tool registry. */
  tools: readonly string[]
  /** Fixed UI component IDs registered in the UI registry. */
  components: readonly string[]
}

export type ModuleSchema = object | ((value: unknown) => boolean)

export interface ModuleMigration {
  /** Stable ID recorded in `__module_migrations`; never reuse or rename. */
  id: string
  /**
   * Author-declared revision marker. Bump it whenever the migration body
   * changes so modified historical migrations are detected. Hashed with the
   * ID (never the function source, which varies between transpilers).
   */
  checksum: string
  /** Apply the migration. Receives a pg client so DDL is transactional. */
  up: (executor: unknown) => void | Promise<void>
  /**
   * Optional reverse migration. Not executed automatically yet; it documents
   * how an operator can roll back a module revision manually.
   */
  down?: (executor: unknown) => void | Promise<void>
}

export type ModuleApiHandler<Context = unknown, Result = unknown> = (
  event: unknown,
  context: Context,
  input: unknown
) => Result | Promise<Result>

export interface ModuleApiDefinition<Context = unknown, Result = unknown> {
  id: string
  moduleId: string
  method: string
  path: string
  schema: ModuleSchema
  authorize: AuthorizationCallback<Context>
  handler: ModuleApiHandler<Context, Result>
  /** 进程内限流；与能力（Tool）层使用同一套桶算法，避免 API 成为绕过口。 */
  rateLimit?: { max: number, windowMs: number }
}

/** Thrown by module handlers when the caller lacks a required scope (mapped to 403). */
export class ModuleForbiddenError extends Error {}

export interface ModuleLifecycleContext {
  enabledModuleIds: readonly string[]
  migrations: readonly ModuleMigration[]
}

export interface ModuleLifecycle {
  onRegister?: (context: ModuleLifecycleContext) => void | Promise<void>
  onEnable?: (context: ModuleLifecycleContext) => void | Promise<void>
  onDisable?: (context: ModuleLifecycleContext) => void | Promise<void>
}

/** Services exposed to a module during registration. */
export interface ModuleRegistrationContext {
  moduleId: string
  api: ModuleApiRouter<unknown>
  tools: ToolRegistry<unknown>
  ui: UiRegistry<unknown, unknown>
}

export interface ModuleDefinition extends ModuleManifest {
  lifecycle?: ModuleLifecycle
  migrations?: readonly ModuleMigration[]
  /**
   * Idempotent module-owned seed data (roles, defaults). Called at boot after
   * the core seed, only for enabled modules. Failures are logged, not fatal.
   */
  seed?: () => void | Promise<void>
  /**
   * Register this module's API/tool/UI services. Only called when the module
   * is enabled at build time; Core never imports module code directly.
   */
  register?: (context: ModuleRegistrationContext) => void | Promise<void>
}

export interface ResolvedModules<T extends ModuleDefinition> {
  modules: T[]
  enabledIds: string[]
}
export type AuthorizationCallback<Context = unknown> = (
  context: Context,
  input: unknown
) => boolean | Promise<boolean>
export type ExecuteCallback<Context = unknown, Result = unknown> = (
  input: unknown,
  context: Context
) => Result | Promise<Result>

export interface ApiRegistration<Context = unknown, Result = unknown> {
  id: string
  schema: ModuleSchema
  authorize: AuthorizationCallback<Context>
  execute: ExecuteCallback<Context, Result>
}

export interface ToolRegistration<Context = unknown, Result = unknown> {
  id: string
  schema: ModuleSchema
  execute: ExecuteCallback<Context, Result>
  authorize?: AuthorizationCallback<Context>
  /** Declared result schema (validated by the Agent layer in Phase 4). */
  outputSchema?: ModuleSchema
  /** Read-only query vs. state-changing command. */
  operation?: 'query' | 'command'
  /** Permission entry required by the Agent permission gateway. */
  permission?: string
  /** JSON Schema exposed to the model (falls back to an empty object schema). */
  inputJsonSchema?: Record<string, unknown>
  /** Confirmation policy for commands. Defaults to `confirm` for commands. */
  approval?: 'none' | 'confirm' | 'second-person'
  /** Assessed risk; medium/high commands always require human approval. */
  riskLevel?: 'low' | 'medium' | 'high'
  /** Force human approval even for read-only operations. */
  requiresApproval?: boolean
  /** Hard execution timeout; 0/undefined means no timeout. */
  timeoutMs?: number
  /** Maximum serialized result size in bytes (default 1 MiB). */
  outputLimitBytes?: number
  /** In-process rate limit per tool + caller. */
  rateLimit?: { max: number, windowMs: number }
}

export interface ToolDefinition<Context = unknown, Result = unknown> extends ToolRegistration<Context, Result> {
  moduleId: string
  description: string
}

/** Detail/edit interactions a UI component supports in chat. */
export interface UiInteractions {
  /** The component can open a read-only detail view. */
  detail?: boolean
  /** Inline editing is offered only to actors holding `permission`. */
  edit?: { permission: string }
}

export interface UiRegistration<Props = unknown, Result = unknown> {
  id: string
  schema: ModuleSchema
  render: (props: Props) => Result
  /** Fixed component version; checked by `render(id, props, { version })`. */
  version?: string
  /** Human-readable name shown to the model when offering the component. */
  label?: string
  /** One-line purpose shown in the client component catalog. */
  description?: string
  /** Props hint for the model prompt (e.g. "query?: string, limit?: number"). */
  propsHint?: string
  /** Optional chat interactions (detail dialog / permission-gated edit). */
  interactions?: UiInteractions
  /** Fallback page when the component cannot render inside chat. */
  appsPath?: string
}

export interface UiDefinition<Props = unknown, Result = unknown> extends UiRegistration<Props, Result> {
  moduleId: string
  label: string
}

function assertPresent(value: unknown, field: string): void {
  if (value === undefined || value === null) {
    throw new TypeError(`Module registration requires ${field}`)
  }
}

function assertValidInput(schema: ModuleSchema, input: unknown, label: string): void {
  if (typeof schema === 'function' && !schema(input)) {
    throw new TypeError(`Invalid input for ${label}`)
  }
  if (typeof schema === 'object' && schema !== null) {
    if ('safeParse' in schema && typeof schema.safeParse === 'function') {
      if (!schema.safeParse(input).success) throw new TypeError(`Invalid input for ${label}`)
    } else if ('parse' in schema && typeof schema.parse === 'function') {
      try {
        schema.parse(input)
      } catch {
        throw new TypeError(`Invalid input for ${label}`)
      }
    }
  }
}

function assertFunction(value: unknown, field: string): asserts value is (...args: never[]) => unknown {
  if (typeof value !== 'function') {
    throw new TypeError(`Module registration requires ${field} to be a function`)
  }
}

export class ModuleRegistry<T extends { id: string }> {
  private readonly entries = new Map<string, T>()

  register(entry: T): void {
    if (!entry.id.trim()) {
      throw new TypeError('Module registration ID must not be empty')
    }
    if (this.entries.has(entry.id)) {
      throw new Error(`Duplicate module registration ID: ${entry.id}`)
    }
    this.entries.set(entry.id, entry)
  }

  get(id: string): T | undefined {
    return this.entries.get(id)
  }

  list(): T[] {
    return [...this.entries.values()]
  }
}

export class ApiRegistry<Context = unknown> extends ModuleRegistry<ApiRegistration<Context>> {
  override register(entry: ApiRegistration<Context>): void {
    assertPresent(entry.schema, 'schema')
    assertFunction(entry.authorize, 'authorize')
    assertFunction(entry.execute, 'execute')
    super.register(entry)
  }

  async run<Result = unknown>(id: string, input: unknown, context: Context): Promise<Result> {
    const api = this.get(id)
    if (!api) throw new Error(`Unknown module API: ${id}`)
    assertValidInput(api.schema, input, `module API ${id}`)
    try {
      if (!await api.authorize(context, input)) throw new Error(`Module API authorization denied: ${id}`)
    } catch (error) {
      if (error instanceof Error && error.message === `Module API authorization denied: ${id}`) throw error
      throw new Error(`Module API authorization denied: ${id}`, { cause: error })
    }
    return await api.execute(input, context) as Result
  }
}

export class ToolRegistry<Context = unknown> extends ModuleRegistry<ToolRegistration<Context>> {
  private readonly rateBuckets = new Map<string, { count: number, resetAt: number }>()

  override register(entry: ToolRegistration<Context>): void {
    assertPresent(entry.schema, 'schema')
    assertFunction(entry.execute, 'execute')
    if (entry.authorize !== undefined) assertFunction(entry.authorize, 'authorize')
    super.register(entry)
  }

  async run<Result = unknown>(id: string, input: unknown, context: Context): Promise<Result> {
    const tool = this.get(id)
    if (!tool) throw new Error(`Unknown module tool: ${id}`)

    assertValidInput(tool.schema, input, `module tool ${id}`)
    try {
      if (!tool.authorize || !await tool.authorize(context, input)) {
        throw new Error(`Module tool authorization denied: ${id}`)
      }
    } catch (error) {
      if (error instanceof Error && error.message === `Module tool authorization denied: ${id}`) throw error
      throw new Error(`Module tool authorization denied: ${id}`, { cause: error })
    }

    const signal = (context as { signal?: AbortSignal } | undefined)?.signal
    if (signal?.aborted) throw new Error(`Module tool cancelled: ${id}`)
    this.enforceRateLimit(tool, context)

    const result = await withTimeout(
      Promise.resolve(tool.execute(input, context)) as Promise<Result>,
      tool.timeoutMs,
      `Module tool timed out: ${id}`
    )

    const limit = tool.outputLimitBytes ?? 1024 * 1024
    let serialized: string
    try {
      serialized = JSON.stringify(result ?? null) ?? 'null'
    } catch {
      serialized = ''
    }
    if (serialized.length > limit) {
      throw new Error(`Module tool output exceeds ${limit} bytes: ${id}`)
    }
    return result
  }

  private enforceRateLimit(tool: ToolRegistration<Context>, context: Context): void {
    if (!tool.rateLimit) return
    const userId = (context as { userId?: number } | undefined)?.userId ?? 'anonymous'
    const key = `${tool.id}:${userId}`
    const now = Date.now()
    const bucket = this.rateBuckets.get(key)
    if (!bucket || bucket.resetAt <= now) {
      this.rateBuckets.set(key, { count: 1, resetAt: now + tool.rateLimit.windowMs })
      return
    }
    if (bucket.count >= tool.rateLimit.max) {
      throw new Error(`Module tool rate limit exceeded: ${tool.id}`)
    }
    bucket.count++
  }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number | undefined, message: string): Promise<T> {
  if (!timeoutMs || timeoutMs <= 0) return await promise
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs)
      })
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

export class UiRegistry<Props = unknown, Result = unknown> extends ModuleRegistry<UiRegistration<Props, Result>> {
  override register(entry: UiRegistration<Props, Result>): void {
    assertPresent(entry.schema, 'schema')
    assertFunction(entry.render, 'render')
    super.register(entry)
  }

  /**
   * Validate props for a registered component without rendering it. Used by the
   * chat component-block protocol so the model can only pass schema-valid props.
   */
  validateProps(id: string, props: Props, options?: { version?: string }): void {
    const component = this.get(id)
    if (!component) throw new Error(`Unknown module UI component: ${id}`)
    if (component.version && options?.version && component.version !== options.version) {
      throw new Error(`Module UI component version mismatch: ${id} (expected ${component.version}, got ${options.version})`)
    }
    assertValidInput(component.schema, props, `module UI component ${id}`)
  }

  render(id: string, props: Props, options?: { version?: string }): Result {
    const component = this.get(id)
    if (!component) throw new Error(`Unknown module UI component: ${id}`)
    this.validateProps(id, props, options)
    return component.render(props) as Result
  }
}

export class ModuleApiRouter<Context = unknown> {
  private readonly definitions = new Map<string, ModuleApiDefinition<Context>>()

  /**
   * 共享限流存储（默认取全局 store：内存或 Postgres）。
   * 允许注入便于测试，也避免每个模块各自维护一套内存桶。
   */
  constructor(private readonly rateLimitStore?: RateLimitStore) {}

  register(definition: ModuleApiDefinition<Context>): void {
    const normalizedPath = definition.path.trim().replace(/^\/+|\/+$/g, '')
    if (!definition.id.trim() || !definition.moduleId.trim() || !normalizedPath) {
      throw new TypeError('Module API requires id, moduleId and path')
    }
    const key = `${definition.method.toUpperCase()} /${normalizedPath}`
    if (this.definitions.has(key)) throw new Error(`Duplicate module API route: ${key}`)
    if ([...this.definitions.values()].some(existing => existing.id === definition.id)) {
      throw new Error(`Duplicate module registration ID: ${definition.id}`)
    }
    this.definitions.set(key, definition)
  }

  list(): ModuleApiDefinition<Context>[] {
    return [...this.definitions.values()]
  }

  async dispatch(method: string, path: string, event: unknown, context: Context, input: unknown): Promise<unknown> {
    const normalizedPath = path.trim().replace(/^\/+|\/+$/g, '')
    const key = `${method.toUpperCase()} /${normalizedPath}`
    const definition = this.definitions.get(key)
    if (!definition) throw new Error(`Unknown module API route: ${key}`)
    assertValidInput(definition.schema, input, `module API ${definition.id}`)
    try {
      if (!await definition.authorize(context, input)) throw new Error(`Module API authorization denied: ${definition.id}`)
    } catch {
      throw new Error(`Module API authorization denied: ${definition.id}`)
    }
    await this.enforceRateLimit(definition, context)
    return definition.handler(event, context, input)
  }

  /**
   * 通过共享 store 限流，按 API + 用户隔离。
   * 存储实现可切换为 Postgres，多实例部署时预算才真正共享。
   */
  private async enforceRateLimit(definition: ModuleApiDefinition<Context>, context: Context): Promise<void> {
    const limit = definition.rateLimit
    if (!limit) return
    const userId = (context as { userId?: number } | undefined)?.userId ?? 'anonymous'
    const key = `${definition.id}:${userId}`
    // 延迟加载：迁移脚本等非 Nitro 运行时会加载本文件，不能连带拉起 h3。
    const store = this.rateLimitStore ?? (await import('../utils/rateLimit')).getRateLimitStore()
    const decision = await store.hit(key, limit.max, limit.windowMs)
    if (!decision.allowed) {
      throw new Error(`Module API rate limit exceeded: ${definition.id}`)
    }
  }
}

type Semver = [number, number, number]

function parseSemver(value: string): Semver | null {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:[-+][0-9A-Za-z.-]+)?$/.exec(value.trim())
  if (!match) return null
  return [Number(match[1]), Number(match[2]), Number(match[3])]
}

function compareSemver(a: Semver, b: Semver): number {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i]! - b[i]!
  }
  return 0
}

/**
 * Minimal semver range support for module dependencies: `*`, exact versions,
 * `^x.y.z`, `~x.y.z`, `>=x.y.z` and `>x.y.z`. Unparseable ranges deny.
 */
export function satisfiesVersionRange(version: string, range?: string | null): boolean {
  const raw = range?.trim()
  if (!raw || raw === '*') return true
  const actual = parseSemver(version)
  if (!actual) return false

  if (raw.startsWith('^')) {
    const target = parseSemver(raw.slice(1))
    return !!target && actual[0] === target[0] && compareSemver(actual, target) >= 0
  }
  if (raw.startsWith('~')) {
    const target = parseSemver(raw.slice(1))
    return !!target && actual[0] === target[0] && actual[1] === target[1] && compareSemver(actual, target) >= 0
  }
  if (raw.startsWith('>=')) {
    const target = parseSemver(raw.slice(2))
    return !!target && compareSemver(actual, target) >= 0
  }
  if (raw.startsWith('>')) {
    const target = parseSemver(raw.slice(1))
    return !!target && compareSemver(actual, target) > 0
  }
  const exact = parseSemver(raw)
  return !!exact && compareSemver(actual, exact) === 0
}

export function sortModulesByDependencies<T extends ModuleManifest>(modules: readonly T[]): T[] {
  const byId = new Map<string, T>()
  for (const module of modules) {
    if (!module.id.trim()) throw new TypeError('Module ID must not be empty')
    if (byId.has(module.id)) throw new Error(`Duplicate module ID: ${module.id}`)
    byId.set(module.id, module)
  }

  const dependents = new Map<string, string[]>()
  const remainingDependencies = new Map<string, number>()
  for (const module of modules) {
    const dependencies = new Set(module.dependencies)
    for (const dependency of dependencies) {
      const dependencyModule = byId.get(dependency)
      if (!dependencyModule) {
        throw new Error(`Module ${module.id} has missing dependency: ${dependency}`)
      }
      const range = module.dependencyRanges?.[dependency]
      if (range && !satisfiesVersionRange(dependencyModule.version, range)) {
        throw new Error(
          `Module ${module.id} requires ${dependency}@${range}, found ${dependencyModule.version}`
        )
      }
      const dependencyDependents = dependents.get(dependency) ?? []
      dependencyDependents.push(module.id)
      dependents.set(dependency, dependencyDependents)
    }
    remainingDependencies.set(module.id, dependencies.size)
  }

  const ready = [...modules]
    .filter(module => remainingDependencies.get(module.id) === 0)
    .map(module => module.id)
    .sort()
  const sorted: T[] = []

  while (ready.length > 0) {
    const id = ready.shift()!
    sorted.push(byId.get(id)!)
    for (const dependent of dependents.get(id) ?? []) {
      const count = remainingDependencies.get(dependent)! - 1
      remainingDependencies.set(dependent, count)
      if (count === 0) {
        ready.push(dependent)
        ready.sort()
      }
    }
  }

  if (sorted.length !== modules.length) {
    const cycle = [...remainingDependencies.entries()]
      .filter(([, count]) => count > 0)
      .map(([id]) => id)
      .sort()
    throw new Error(`Circular module dependencies: ${cycle.join(', ')}`)
  }
  return sorted
}

export function filterEnabledModules<T extends ModuleManifest>(
  modules: readonly T[],
  enabledIds: readonly string[]
): T[] {
  const enabled = new Set(enabledIds)
  return modules.filter(module => enabled.has(module.id))
}

export function resolveModules<T extends ModuleDefinition>(
  modules: readonly T[],
  enabledIds: readonly string[]
): ResolvedModules<T> {
  const sorted = sortModulesByDependencies(modules)
  const enabled = new Set(enabledIds)
  for (const id of enabled) {
    if (!sorted.some(module => module.id === id)) throw new Error(`Unknown enabled module: ${id}`)
  }
  for (const module of sorted) {
    if (!enabled.has(module.id)) continue
    for (const dependency of module.dependencies) {
      if (!enabled.has(dependency)) {
        throw new Error(`Enabled module ${module.id} requires disabled dependency: ${dependency}`)
      }
    }
  }
  return {
    modules: sorted.filter(module => enabled.has(module.id)),
    enabledIds: sorted.filter(module => enabled.has(module.id)).map(module => module.id)
  }
}

export async function runModuleLifecycle<T extends ModuleDefinition>(
  modules: readonly T[],
  enabledIds: readonly string[],
  phase: 'onRegister' | 'onEnable' | 'onDisable'
): Promise<void> {
  const resolved = resolveModules(modules, enabledIds)
  const migrations = resolved.modules.flatMap(module => module.migrations ?? [])
  const context: ModuleLifecycleContext = { enabledModuleIds: resolved.enabledIds, migrations }
  for (const module of resolved.modules) {
    await module.lifecycle?.[phase]?.(context)
  }
}

export async function runModuleMigrations(
  migrations: readonly ModuleMigration[],
  executeOnce: (id: string, run: (executor?: unknown) => void | Promise<void>) => void | Promise<void>,
  executor: unknown
): Promise<void> {
  const seen = new Set<string>()
  for (const migration of migrations) {
    if (!migration.id.trim()) throw new TypeError('Module migration ID must not be empty')
    if (seen.has(migration.id)) throw new Error(`Duplicate module migration ID: ${migration.id}`)
    if (typeof migration.up !== 'function') throw new TypeError(`Module migration ${migration.id} requires an up handler`)
    seen.add(migration.id)
    await executeOnce(migration.id, migrationExecutor => migration.up(migrationExecutor ?? executor))
  }
}
