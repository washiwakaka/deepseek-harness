---
description: "记录持久化类型更改及其兼容性确认。"
kind: persistence-change
---

# 2026-11-02-collaboration-branch-owner

[English](2026-11-02-collaboration-branch-owner.md) | 中文

## 概述

为 collaboration 的 branch-opened 与 actor-invoked 事件增加可选 ownerId，使每个真人拥有私有的模型分支。

## 目录

- [声明](#declaration)
- [兼容性](#compatibility)
- [验证](#verification)
- [开发备注](#dev-note)

<a id="declaration"></a>
## 声明

```yaml persistence-change
schemaVersion: 1
id: 2026-11-02-collaboration-branch-owner
baseline: false
changes:
  - root: "event:collaboration/actor-invoked"
    previous: "2026-10-29-collaboration-room-events"
    after: "483180bc7536a02616b78ae5d0e899764c2bfd57a672465b67dcda73d66e1621"
    decision: same-version
  - root: "event:collaboration/branch-opened"
    previous: "2026-10-29-collaboration-room-events"
    after: "fa605f13ff1b8713a6436b953d87febc025da73fdd67ae83be1dfba13c0ea88a"
    decision: same-version
```

<a id="compatibility"></a>
## 兼容性

已有记录仍然有效。读取方把缺失的 ownerId 视为对房间全部占用者可见的共享子会话。新的写入方始终把 ownerId 设为发起 @ 的真人。Session header 版本不变。

<a id="verification"></a>
## 验证

pnpm exec vitest run packages/experimental/collaboration/tests/mention.spec.ts packages/experimental/collaboration/tests/projection-events.spec.ts packages/experimental/client-ui-collaboration/tests/visibility.client.spec.ts：相关套件 47 个测试通过。

<a id="dev-note"></a>
## 开发备注

无。
