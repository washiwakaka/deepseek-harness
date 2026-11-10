---
description: "通过带认证的 Web Remote 暴露协作房间发帖和占用者名单。"
kind: "package-reference"
---

# @deepseek-ai/dsh-experimental-api-collaboration

[English](README.md) | 中文

## 概述

`collaboration` Remote 让浏览器列出 Config 占用者、列出某个真人可以 `@` 的设置模型、发送一条房间行、把分支答案发布到房间、识别分支 Session、离开或移除占用者、写入尚未编译的房间上下文，以及带着该上下文发送草稿。提及子会话轮次仍由 `ctx.collaboration` 负责。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

与 `@deepseek-ai/dsh-experimental-collaboration` 和 Typert 一起从 overlay 挂载，不要从默认 Web remotes 列表挂载。`listActors()` 返回 id、kind 和 name。登录 Remote 在 `@deepseek-ai/dsh-experimental-api-identity`。`listMentionModels(actorId, signal)` 返回该真人可以 `@` 的设置模型。`postMessage(agent, { actorId, text, mentions }, signal)` 追加到该 Agent 的 Session，并返回已启动的分支 id 以及 `failedActorIds`（没能启动分支的被 @ 模型）；提及真人即邀请该占用者。`claimRoom(agent, actorId, signal)` 在空房间上记下创建人。`publish(agent, actorId, assistantSeq, signal)` 把分支上最新 assistant 文本拷到房间；给了 `assistantSeq` 就拷那一条回复。房间 Agent 不在线时 Host 会冷恢复，同一回复重复发布会被拒绝（`collaboration/already-published`）。`branchInfo(agent, signal)` 返回分支 Session 所属的房间和 AI 占用者，不是分支时返回 `null`。`leaveRoom(agent, actorId, signal)` 移除调用者本人；`removeOccupant(agent, actorId, targetId, signal)` 让创建人移除另一位占用者。`admitRoomContext(agent, actorId, signal)` 记下尚未编译的房间增量且不 followup。`sendWithRoom(agent, text, actorId, signal)` 先 admit 再 followup 房间 Agent。非占用者得到 `collaboration/forbidden`。未登录发帖得到 `collaboration/unauthorized`。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现内部 — 点击展开</summary>

控制器把 `CollaborationError` 码映射到本包的 `RemoteError` 码。查找使用存活 Agent；房间日志是 `agent.session`。提及分发和编译仍在 Host 协作插件里。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [协作 Host](../collaboration/README.zh.md) — 房间事件与按占用者编译。
- [新增 Remote API](../../../docs/cookbook/adding-a-remote-api.zh.md) — `@Remote` 约定。
- [协作房间组合包](../collaboration-profile/README.zh.md) — 插件页或 `dsh plugin add`。
- [实验性包](../README.zh.md) — 隔离。

-----

<a id="model-experience"></a>
## 模型体验

间接通过 `@deepseek-ai/dsh-experimental-collaboration`，由它编译被 @ 的 AI 子任务。

#### KV Cache 影响

除 Host 协作子会话轮次外没有额外影响。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- Client 仍提供 `actorId`；Host 登录还不是权限依据。
- Chat node、`@` 模型，以及「带房间发送」在 `@deepseek-ai/dsh-experimental-client-ui-collaboration`。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>给维护者的工作上下文 — 点击展开</summary>

本开发备注是给维护者的工作上下文，明确不具权威性。

签名变更后需要 `pnpm run build:lib` 才能发出 `./typert` 和 `./remote`。

</details>
