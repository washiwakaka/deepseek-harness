---
description: "让真人共用一个房间，并通过 @ 唤醒已配置的 AI 占用者，每个占用者有自己的持久子上下文。"
kind: "package-reference"
---

# @deepseek-ai/dsh-experimental-collaboration

[English](README.md) | 中文

## 概述

`dsh-experimental-collaboration` 让若干真人在一个 Session 里交谈，并用 @ 启动已配置的 AI 占用者。未被提及的行不进入任何 Agent。第一次 @ 把房间前缀拷进该 AI 的子会话，并编译房间帖加上房间 Agent 的 user 与 assistant 轮次；之后再 @ 同一 AI 只发送尚未编译的增量。AI 的回答留在分支上，直到有人发布到房间。从 overlay 挂载，不要从默认 Web 应用挂载。

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

用包含真人和 AI 占用者的 Config 名单挂载插件。调用 `ctx.collaboration.postMessage(session, { actorId, text, mentions })`。普通聊天省略 `mentions`。点名 AI id 以启动那些子会话。点名真人 id 即邀请该占用者；此前房间只对创建人可见。第一次 @ 模型把分支命名为 `{模型} · {房间标题}`，并挂到与房间相同的 Workspace、紧挨房间那一行。

### 何时选择

适用于占用者包含按 @ 寻址的具名模型的共享房间。Agent Teams 面向自动化 teammate 和工具。LiveShare 面向把一个 Session 分享给远程 viewer。

### 最小工作配置

<a id="smallest-working-setup"></a>

持久会话存储加本插件。省略 `actors` 即用 Host 演示名单；Client 调 `listActors` 和 `listMentionModels`：

```yaml
- name: '@deepseek-ai/dsh-session-persistence-jsonl'
- name: '@deepseek-ai/dsh-experimental-collaboration'
```

| 字段 | 默认值 | 含义 |
|---|---|---|
| `actors` | Alice（`core`，全部提供方）和 Bob（`guest`，`deepseek-official`） | 真人作者和可选 Config AI 占用者。省略则用 Host 默认。真人可设 `group` 和 `providers`（空 `providers` 表示设置里已接入的全部提供方）。`@` 模型来自 `listMentionModels`，不是 A/B 占用者 |
| `maxMessageBytes` | `65,536` | 一条房间消息的最大 UTF-8 字节数 |

生成的[配置目录](../../../docs/config-catalog.zh.md#deepseek-aidsh-experimental-collaboration)是每个已接受字段及其 JSDoc 的穷尽来源。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现内部 — 点击展开</summary>

第一个发帖或 `claimRoom` 的真人是创建人。之后的真人在现有占用者 `@` 他们之前不能发帖、发布或发送。房间行是非表层 `collaboration/message` 事件。它们永不进入房间 Session 的 `deriveMessages()`，因此发帖不会开启房间 turn。房间 Agent 的发送仍走 `user/message`，不读取同伴聊天。`admitRoomContext` 把尚未编译的房间增量记成 `collaboration-room-context` 用户消息且不 followup。`sendWithRoom` 先 admit 再对房间 Agent `followup` 草稿，这样 Client 不必在表层 `user/message` 之后再 submit。提及分发读取结构化 `mentions`，用 `agents.create` 和 `buildForkSeed` 为每个 AI 占用者创建一条子会话，编译按占用者的誊本（房间帖加上房间 Agent 的 user/assistant 轮次；继承前缀不会进入子会话的 `deriveMessages()`），并对该子会话 `followup`。`collaboration/actor-invoked` 存储编译截止 seq，以便之后再 @ 同一 AI 只发送尚未编译的增量。子会话的工具事件留在子日志。房间 journal 在 flush 这次 invoke 后释放。答案留在分支上。`publishFromChild` 把最新 assistant 文本拷到房间。

源码对照：`src/types.ts` 事件、`src/projection.ts` 折叠、`src/compiler.ts` 誊本、`src/journal.ts` 队列、`src/index.ts` 服务。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [协作房间 Agent Note](../../../.agents/notes/proposed/feature/2026-10-12-collaboration-room-fork-publish.zh.md) — 非表层房间事件和按占用者编译。
- [分支、发布与 ACL](../../../.agents/notes/proposed/feature/2026-10-29-collaboration-branch-publish.zh.md) — 答案留在分支上直到发布。
- [新增协作房间](../../../docs/cookbook/adding-a-collaboration-room.zh.md) — overlay 启动与 Client `@` 模型。
- [实验性包](../README.zh.md) — 隔离与命名。
- [Agent Teams](../agent-team/README.zh.md) — 自动化 teammate，不是这个房间。
- [LiveShare](../liveshare/README.zh.md) — 远程分享一个 Session。

-----

<a id="model-experience"></a>
## 模型体验

### 提及任务

#### 模型看到什么

被提及的 AI 收到一条 user 角色消息。正文以一条点名该占用者的固定说明开头（`{name}` 是 Config 显示名），随后是截至该提及的、来自其他占用者的房间帖以及房间 Agent 的 user 与 assistant 轮次的 `[name] text` 行，并跳过该 AI 自己已发布的回复。

##### 提及说明

```markdown
You are {name} in a shared room. Use the room conversation below. Answer as yourself.
```

#### Token 影响

某个占用者的第一次 @ 加入此前全部房间可见行（不含该占用者自己的回复），再加上该窗口内的房间 Agent 交谈。之后再 @ 同一占用者只加入其水位之后的行加上这条新提及。另一个占用者的第一次 @ 仍会收到完整的房间可见誊本。

#### KV Cache 影响

子会话自己的先前轮次仍是可复用前缀。之后每一次 @ 都在该前缀之后追加一条新的 user 消息。另一个占用者的子会话开始一段独立历史。

### 房间上下文

#### 模型看到什么

Client 写入房间上下文时，房间 Agent 收到一条 user 角色消息。正文以一条固定说明开头，随后是尚未编译增量的 `[name] text` 房间行。

##### 房间上下文说明

```markdown
Shared room transcript.
```

#### Token 影响

每一次写入只加入上一水位之后的房间可见行。没有新行时不写任何内容。

#### KV Cache 影响

写入的消息留在房间日志上。随后的发送是另一条 user 消息，因此之后的轮次复用这段已写入的前缀。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

这些限制描述房间目前还不能做的事。

- **Config 名单是 overlay 身份，不是 Host 登录** — 本 overlay 用 Alice/Bob 切换 id 做房间 ACL；以后若有 Host 鉴权身份，会替换这套切换。
- **实验性原型，无稳定性承诺** — 本包公开，但孵化期间契约可以改。
- **没有旁听、@all 或 AI 之间互相 @** — 只有真人的 `mentions` 列表会开启子会话 turn。
- **子会话留在本进程** — 重启后还不能从存储冷恢复 AI 子会话。
- **默认 Web 隔离** — 发行应用不得依赖本包；从 overlay 加载。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>给维护者的工作上下文 — 点击展开</summary>

本开发备注是给维护者的工作上下文，明确不具权威性。

Composer 发送拦截仍在实操手册路径上。房间 ACL 使用 Config actor id：创建人独占，直到 `@` 另一个真人。

</details>
