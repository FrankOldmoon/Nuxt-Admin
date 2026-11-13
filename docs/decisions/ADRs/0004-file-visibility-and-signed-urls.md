# ADR 0004 — 文件可见性与签名 URL

- Status: Accepted
- Date: 2026-06-30

## Context

早期 `/api/files/serve/*` 与 `/download/*` 完全公开，任何知道路径的人都能读取文件。需要在不引入对象存储的前提下提供可控的私有访问。

## Decision

- `files.visibility` 为 `public | private`；新上传默认 `private`，历史数据回填 `public`。
- 私有文件授权：owner、admin、或同组织且拥有 `files:read`/`*` 的成员。
- 支持 HMAC 签名 URL（`expires` + `signature`），可在限定时间内分享私有文件。
- 路径必须先命中数据库文件记录，再经 `getAbsolutePath` 校验，防止目录穿越。
- 拒绝访问写审计；签名校验失败关闭（过期/格式错误/密钥缺失都拒绝）。

## Consequences

正面：

- 不需要额外基础设施即可实现私有文件与临时分享。
- 公开文件保持原有行为。

负面：

- 签名 URL 一旦泄露在有效期内可被使用，TTL 应尽量短。
- 多实例共享本地磁盘需要共享卷；对象存储仍是后续方向。

## 相关实现

- `server/core/fileAccess.ts`
- `server/utils/fileRequest.ts`
- `server/api/files/{upload,serve,download}`
- 迁移 `0011_wealthy_storm.sql`
