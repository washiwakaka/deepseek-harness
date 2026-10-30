---
description: "记录持久化类型更改及其兼容性确认。"
kind: persistence-change
---

# 2026-10-30-collaboration-occupant

[English](2026-10-30-collaboration-occupant.md) | 中文

## 概述

新增 collaboration/occupant 以及 collaboration-room-context 用户消息来源，用于房间 ACL 与房间增量 admit。

## 目录

- [声明](#declaration)
- [兼容性](#compatibility)
- [验证](#verification)
- [开发备注](#dev-note)

<a id="declaration"></a>
## 声明

```yaml persistence-change
schemaVersion: 1
id: 2026-10-30-collaboration-occupant
baseline: false
changes:
  - root: "event:agent/inbox/spliced"
    previous: "2026-10-29-collaboration-room-events"
    after: "4c3f6c62fd067f5a281474e69204e08fe76a9d4e176d787717e9941aa70ef184"
    decision: same-version
  - root: "event:collaboration/occupant"
    previous: null
    after: "d5de270abb6ff987522d6dba99d384c6efb6594df50297b3f93d3bdce666b1fe"
    decision: same-version
  - root: "event:developer/message"
    previous: "2026-10-29-collaboration-room-events"
    after: "b75e18b690301de4db585fc4dde0f45382f1daa15929cd3bf64f844c0a76eeee"
    decision: same-version
  - root: "event:session/title-llm-request"
    previous: "2026-10-29-collaboration-room-events"
    after: "8a5b6393d7d0802c02a954554cd41865245c089172ef4acdd1112b5d0522a333"
    decision: same-version
  - root: "event:user/message"
    previous: "2026-10-29-collaboration-room-events"
    after: "a67a187014232619fa853d2c4e1d0ed928e69671fda981067b9611dc7ef3aa6a"
    decision: same-version
```

<a id="compatibility"></a>
## 兼容性

没有这些键的已有会话仍然有效。新的 collaboration/occupant 事件是 required-on-read：未列入该类型的旧 harness 会拒绝日志，而不是跳过。MessageSource.kind 可合并扩展；不认识 collaboration-room-context 的读取方会落入未知 kind，仍能重建 user 角色文本。写入方只在认领或邀请真人时写 occupant，只在 admit 尚未编译的房间增量时写 collaboration-room-context。

<a id="verification"></a>
## 验证

pnpm exec vitest run packages/experimental/collaboration/tests packages/experimental/api-collaboration/tests packages/experimental/client-ui-collaboration/tests：协作与 ui-workspace 合计 641 项测试通过，覆盖占用者 admit、COLLAB_ACCESS_DENIED 和侧栏可见性。

<a id="dev-note"></a>
## 开发备注

无。
