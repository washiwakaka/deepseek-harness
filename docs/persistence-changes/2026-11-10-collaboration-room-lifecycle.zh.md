---
description: "记录持久化类型更改及其兼容性确认。"
kind: persistence-change
---

# 2026-11-10-collaboration-room-lifecycle

[English](2026-11-10-collaboration-room-lifecycle.md) | 中文

## 概述

新增 collaboration/occupant-removed 事件与 collaboration/message 上可选的发布来源字段（branchSessionId、assistantSeq），并把共享的消息 source 根线性化到合并后的历史。

## 目录

- [声明](#declaration)
- [兼容性](#compatibility)
- [验证](#verification)
- [开发备注](#dev-note)

<a id="declaration"></a>
## 声明

```yaml persistence-change
schemaVersion: 1
id: 2026-11-10-collaboration-room-lifecycle
baseline: false
changes:
  - root: "event:agent/inbox/spliced"
    previous: "2026-10-30-collaboration-occupant"
    after: "53deb4de18911bdc7093da57be58ca97f0725996c10d3abc32362faa1d07450e"
    decision: same-version
  - root: "event:collaboration/message"
    previous: "2026-10-29-collaboration-room-events"
    after: "82a29946ff8597e23752adcc5654c938bfb1e14cd2ca2ceb4daae174a4b46b73"
    decision: same-version
  - root: "event:collaboration/occupant-removed"
    previous: null
    after: "1e1cb9a2a9911622165101e57731e2b79502cca2d6313afa1c4a95fa9a0d54ef"
    decision: same-version
  - root: "event:developer/message"
    previous: "2026-10-30-collaboration-occupant"
    after: "88fc4a8591732d24bb0a5943a4e743c3657794734409019521efe89583afae37"
    decision: same-version
  - root: "event:session/title-llm-request"
    previous: "2026-10-30-collaboration-occupant"
    after: "bf5360f2cdecb1f7b649b5ad11f53f0f039de6a3057dfbaa33e8ce24bb2529ba"
    decision: same-version
  - root: "event:user/message"
    previous: "2026-10-30-collaboration-occupant"
    after: "752629d0134934b030b922c80bc50f4f9311d12298de31f2c5440bb6159fa657"
    decision: same-version
```

<a id="compatibility"></a>
## 兼容性

已有会话仍然有效。collaboration/occupant-removed 是新的 required-on-read 协作事件：不认识它的旧 harness 会拒绝该日志而不是跳过，与其他 collaboration/* 事件一致。branchSessionId 和 assistantSeq 是可选字段；旧读端会忽略，旧日志没有发布来源，因此重复发布检测不适用于本次变更之前发布的回复。共享根（user/message、developer/message、agent/inbox/spliced、session/title-llm-request）只是把较早的协作记录重新挂到合并后的 master 历史上：这里列出的 union 变体和可选属性都已由引入它们各自的记录确认过（子代理 settlement 归属、retry 控制输入、协作房间事件），读端行为不变。Session header 版本不变。

<a id="verification"></a>
## 验证

pnpm exec vitest run packages/experimental/collaboration/tests packages/experimental/api-collaboration/tests packages/experimental/client-ui-collaboration/tests：全部通过，覆盖占用者离开/移除、重复发布拒绝、指定回复发布与冷恢复发布。本记录后 pnpm --silent run verify-persistence-changes --json 通过。

<a id="dev-note"></a>
## 开发备注

无。
