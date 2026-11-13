# 部署（Deployment）

> 实时与多实例细节见 [../architecture/PRODUCTION.md](../architecture/PRODUCTION.md)。
> 迁移规则见 [../architecture/DATABASE_MIGRATIONS.md](../architecture/DATABASE_MIGRATIONS.md)。

## 1. 前置条件

- Node.js 20+（CI 使用 22）。
- pnpm 11.x（`packageManager` 已固定）。
- PostgreSQL 14+。
- 生产环境必须设置强随机 `SESSION_SECRET`。

## 2. 环境变量

| 变量 | 必需 | 说明 |
|---|---|---|
| `DATABASE_URL` | 是 | PostgreSQL 连接串 |
| `SESSION_SECRET` | 是 | 会话签名密钥；`openssl rand -hex 32` |
| `FILE_SIGNING_SECRET` | 推荐 | 私有文件签名 URL；未设置时回退到 `NUXT_SESSION_PASSWORD` |
| `NUXT_PUBLIC_SITE_URL` | 推荐 | 生成绝对链接、支付回调、OAuth issuer |
| `ENABLED_MODULES` | 否 | 构建期启用的模块 ID（空格/逗号分隔） |
| `REALTIME_DRIVER` | 否 | `memory`（默认）或 `postgres`；多实例必须 `postgres` |
| `REALTIME_CHANNEL` | 否 | PostgreSQL NOTIFY 频道，默认 `app_realtime` |
| `BLOG_ENABLED` | 否 | `false` 时不加载 Blog layer |
| `DB_POOL_MAX` / `DB_POOL_IDLE_TIMEOUT` / `DB_POOL_CONNECT_TIMEOUT` | 否 | 连接池参数 |

> `AUTO_MIGRATE` 已不再使用。生产实例不会自动迁移；迁移由 `pnpm db:migrate:release` 显式执行。

## 3. 构建

```bash
pnpm install --frozen-lockfile
pnpm build
```

构建产物在 `.output/`。构建期需确定 `ENABLED_MODULES`；运行期修改不会加载新 layer。

## 4. 数据库迁移

发布前执行一次（不要在每个实例启动时执行）：

```bash
pnpm db:migrate:release
```

顺序：主库 Drizzle → 模块生命周期 → 模块迁移 → `module_states` → Blog。

建议流程：

```text
备份数据库
  → pnpm db:migrate:release
  → 启动新版本实例
  → GET /api/health 检查
  → 观察日志/错误率
```

## 5. 启动

```bash
pnpm server
# 等价于 node --env-file-if-exists=.env .output/server/index.mjs
```

PM2：

```bash
pnpm pm
# ecosystem.config.cjs
```

多实例：

- 所有实例使用同一 `DATABASE_URL`。
- 设置 `REALTIME_DRIVER=postgres`，否则跨实例私信/通知/presence 不互通。
- 迁移只在一个发布步骤执行，不要由实例启动触发。
- 全局限流需在网关/反向代理层实现（应用内限流是进程级）。

## 6. 健康检查

```http
GET /api/health
```

- 200：进程与数据库可用。
- 503：数据库不可用。
- 返回实时驱动、延迟等非敏感信息，不包含密钥。

## 7. 文件与存储

- 默认本地磁盘（`storage/`）；私有文件通过签名 URL 访问。
- 多实例共享本地磁盘需要共享卷；否则应使用对象存储（**Planned**，当前未内置 S3 适配器）。
- 文件保留/清理策略未内置（**Planned**）。

## 8. 备份与回滚

- 发布前做数据库备份；迁移不做自动回滚。
- 应用回滚：切换回上一版本构建产物。
- 数据库回滚：通过备份恢复或新增修复迁移。
- 模块卸载不会删除业务数据；需要清理时执行独立脚本。

## 9. 模块部署

```bash
# 1. 模块代码就位（clone / submodule）
# 2. 在 modules.catalog.ts 登记（首次）
# 3. 构建时启用
ENABLED_MODULES=example,my-module pnpm build
# 4. 发布迁移
pnpm db:migrate:release
```

运行期通过 `/dashboard/modules` 查看 manifest 校验、状态、迁移历史与错误；状态变更仅影响模块 API 可用性。

## 10. 安全检查清单

- [ ] `SESSION_SECRET` / `FILE_SIGNING_SECRET` 为随机长字符串，未提交仓库。
- [ ] LLM API Key 仅存在于服务端环境变量或 `configs`。
- [ ] 反向代理终止 TLS，限制上传大小。
- [ ] 数据库账号最小权限，备份加密。
- [ ] 多实例实时驱动为 `postgres`。
- [ ] 健康检查与日志监控已接入。
