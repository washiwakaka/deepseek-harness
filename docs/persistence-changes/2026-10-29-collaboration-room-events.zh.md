---
description: "记录持久化类型更改及其兼容性确认。"
kind: persistence-change
---

# 2026-10-29-collaboration-room-events

[English](2026-10-29-collaboration-room-events.md) | 中文

## 概述

新增协作房间事件，以及 user 消息上的 collaboration-mention 来源 kind。

## 目录

- [声明](#declaration)
- [兼容性](#compatibility)
- [验证](#verification)
- [开发备注](#dev-note)

<a id="declaration"></a>
## 声明

```yaml persistence-change
schemaVersion: 1
id: 2026-10-29-collaboration-room-events
baseline: false
changes:
  - root: "event:agent/inbox/spliced"
    previous: "2026-10-13-liveshare-share-viewer-principal"
    after: "9a47e7fb53153160b1c9581d6f28bfcbd2774449c23372d0d7d291aad8a9166a"
    decision: same-version
  - root: "event:collaboration/actor-invoked"
    previous: null
    after: "bf10691a9740d98f8e961c9b8a3a9c8a37aafb61868117e89b56f6a99342a038"
    decision: same-version
  - root: "event:collaboration/branch-opened"
    previous: null
    after: "a6f6874579dd4ab45962a63ae3b4a7dd0b4e8fd16b5c4485de595d96043b5fc3"
    decision: same-version
  - root: "event:collaboration/message"
    previous: null
    after: "45c740e5ac499b705b9ef6e03223f8c212710ca2472ed2c67432174c52bfcedb"
    decision: same-version
  - root: "event:developer/message"
    previous: "2026-10-13-liveshare-share-viewer-principal"
    after: "76442d016b49e5d1ba326befae77bedff0a14f4c110c6bd1ab9f75dd3af680ca"
    decision: same-version
  - root: "event:session/title-llm-request"
    previous: "2026-10-13-liveshare-share-viewer-principal"
    after: "1784eabe636e0a187ed88bd5a4c97223e9623ce2cc4e03e8ecc263f4e7dacd18"
    decision: same-version
  - root: "event:user/message"
    previous: "2026-10-13-liveshare-share-viewer-principal"
    after: "353872376262b8b7c110dd8bbf6f2ff1bc29fde4083a8a36fa1a76e686468d29"
    decision: same-version
```

<a id="compatibility"></a>
## 兼容性

不含这些键的既有会话仍然有效。新的 collaboration/* 事件默认必读：未列入这些类型的旧 harness 会拒绝该日志，而不是跳过它们。MessageSource.kind 可声明合并；不认识 collaboration-mention 的读取方会落入未知 kind，仍能重建 user 角色正文。写入方只在 AI 占用者的子任务上写这个新 kind。

<a id="verification"></a>
## 验证

pnpm exec vitest run packages/experimental/collaboration/tests：13 个测试通过，覆盖未被提及的发帖、同一 AI 的第一次与后续 @、第二个 AI 的 @，以及非法载荷。

<a id="dev-note"></a>
## 开发备注

无。
