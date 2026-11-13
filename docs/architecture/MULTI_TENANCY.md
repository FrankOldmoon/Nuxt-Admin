# 多租户（Multi-Tenancy）

> 状态：**Implemented**（应用层隔离）；数据库 RLS 为 **Planned**。

## 1. 数据模型

```text
tenants
  └─ organizations (tenant_id)
       ├─ departments (organization_id)
       ├─ organization_memberships (organization_id, user_id, role_id, department_id, status)
       └─ 业务数据（organization_id / tenant_id）
```

- 一个用户可属于多个组织；`organization_memberships.status = 'active'` 才生效。
- 组织内成员角色（`membership.role_id`）优先于全局 `users.role_id`。
- 组织上下文由服务端根据成员关系解析（详见 [AUTHORIZATION.md](./AUTHORIZATION.md) 第 3 节）。

## 2. 表的归属分类

| 类别 | 表 | 隔离方式 |
|---|---|---|
| 全局 | `tenants`、`users`、`roles`、`configs`、`templates`、`categories`、认证/token 表 | 无归属列；由权限与 `ADMIN_ONLY_TABLES` 保护 |
| 租户级 | `organizations` | `tenant_id` |
| 组织级 | `departments`、`organization_memberships`、`files`、`audit_logs`、全部 SIS 业务表 | `organization_id`（部分同时有 `tenant_id`） |

## 3. 元数据声明

`TableMeta.features`：

```ts
features: {
  organizationScoped: true,   // 约定列为 organizationId
  tenantScoped: true,         // 约定列为 tenantId
  contextColumns: {           // 显式列名优先于约定
    organization: 'orgId',
    tenant: 'tenantId'
  }
}
```

`resolveContextColumns(meta)`（`server/utils/dashboard/crudService.ts`）返回最终列映射：

1. 显式 `contextColumns` 优先。
2. 否则 `organizationScoped` → `organizationId`，`tenantScoped` → `tenantId`。

## 4. 写入路径

### 4.1 创建

- 服务端从 `AuthContext` 注入 `organizationId` / `tenantId`，忽略浏览器提交值。
- SIS 等模块通过 `registerTableValidator` 再校验业务外键（例如班级必须属于同一组织）。
- 无组织上下文的请求不能写入组织级表。

### 4.2 更新

- 更新前删除浏览器提交的归属列，防止“把记录迁移到别的组织”。
- 关联字段同样经过归属校验。

### 4.3 关系与 many-to-many

`assertRelationScope()`：

- 仅检查目标表自身有归属列的关系。
- `relation` 与 many-to-many 字段在 create/update/import 时校验目标记录的组织/租户与 actor 一致。
- 目标不存在 → 400；跨组织 → 400 `Cross-organization relation rejected`；跨租户 → 400（双方都有值时）。
- 全局查找表（users/categories 等）不受限制。
- 旧数据 `tenant_id` 为 NULL 时只比较组织，避免误伤历史行。

### 4.4 读取

- 列表/详情/导出先执行表级权限，再执行数据范围（`organization`/`tenant`/`assigned` 等）。
- 单条记录读取后用 `recordMatchesScope()` 复核。
- 关联下拉选项（`loadRelationOptions`）同样可带数据范围，避免泄露其他组织数据。

## 5. 数据库约束

| 迁移 | 内容 |
|---|---|
| `0011_wealthy_storm.sql` | `files.visibility` + `organization_id` + `tenant_id` |
| `0012_*.sql` | `audit_logs_tenant_created_idx`、`files_tenant_idx` |
| `sis-demo:002/003` | SIS 表组织/租户外键与索引；`sis_students(organization_id, student_no)`、`sis_classes(organization_id, name)` 等作用域唯一索引 |

作用域唯一索引示例：

```sql
CREATE UNIQUE INDEX ... ON sis_students (organization_id, student_no);
CREATE UNIQUE INDEX ... ON sis_classes (organization_id, name);
```

## 6. 文件隔离

- `files.organization_id` 记录上传者组织。
- 私有文件仅 owner / admin / 同组织且 `files:read` 可访问。
- `tenant_id` 用于跨实例审计与后续租户级过滤。

## 7. SIS/SMS 模块实践（外部仓库）

SIS/SMS 模块位于独立仓库 `Nuxt-Extend-SMS`，克隆到 `modules/sms` 后使用。其隔离策略：

- 所有业务表 org 级；服务层在写入前校验组织归属。
- 角色范围：
  - admin：组织全量。
  - teacher：仅所授班级（`sis_teacher_assignments`）。
  - student：仅自己的学生记录与选课。
  - guardian：仅显式关联的学生（`sis_student_guardians`）。
- 选课历史保留：退课不删除记录，只改变状态。
- 详细实体见 [UPGRADE_PROGRESS.md](./UPGRADE_PROGRESS.md) Phase 4（历史实现记录）。

## 8. 已知限制

| 项 | 状态 | 说明 |
|---|---|---|
| PostgreSQL RLS | Planned | 当前为应用层隔离，直连数据库的进程需自行遵守约束 |
| 组织管理员角色 | Planned | admin 仍是全局角色；成员角色已参与授权 |
| 历史数据回填 | Partial | `tenant_id` 可能为 NULL；关系校验对 NULL 做兼容 |
| 跨租户共享数据 | 未支持 | 共享资源需显式设计为全局表 |
| `migrationScope: 'tenant'` | 已定义、未广泛使用 | 迁移可按租户初始化，但必须先有明确策略，禁止破坏性租户数据迁移 |
