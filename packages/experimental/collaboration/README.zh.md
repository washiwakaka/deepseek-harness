---
description: "让真人共用一个房间，并通过 @ 唤醒已配置的 AI 占用者，每个占用者有自己的持久子上下文。"
kind: "package-reference"
---

# @deepseek-ai/dsh-experimental-collaboration

[English](README.md) | 中文

## 概述

`dsh-experimental-collaboration` 让若干真人在一个 Session 里交谈，并用 @ 启动已配置的 AI 占用者。未被提及的行不进入任何 Agent。第一次 @ 把房间前缀拷进该 AI 的子会话，并编译房间帖加上房间 Agent 的 user 与 assistant 轮次；之后再 @ 同一 AI 只发送尚未编译的增量。AI 的回答留在分支上，直到发起 @ 的真人调用 `publishFromChild` 把结论发到房间。侧边栏把分支归在房间下面。从协作房间组合包挂载，不要从默认 Web 应用挂载。

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

用包含真人和 AI 占用者的 Config 名单挂载插件，或挂载 `@deepseek-ai/dsh-experimental-identity` 并把 `actors` 留空，让真人在那边注册。调用 `ctx.collaboration.postMessage(session, { actorId, text, mentions })`。普通聊天省略 `mentions`。点名 AI id 以启动那些子会话。点名真人 id 即邀请该占用者；此前房间只对创建人可见。第一次 @ 模型把分支命名为 `{模型} · {房间标题}`，在 header 上写入 `parentSession` 指向房间（从不写 `origin: 'subagent'`），侧边栏只把该分支给发起 @ 的真人看，并归在来源房间下面。发起 @ 的真人从分支发布后，最新 assistant 文本才进入房间。同一房间同一真人再 @ 同一模型会复用这条子会话；另一占用者 @ 同一模型会新建仅自己可见的子会话；换一个房间再 @ 会新建子会话。进程重启后下一次 @ 会冷恢复已持久化的子会话。

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
| `actors` | Alice（`core`）和 Bob–James（`guest`）；空 `providers` 和 `models` 表示设置里已接入的全部模型 | 真人作者和可选 Config AI 占用者。省略时用 Host 默认的十个 overlay 真人。`ctx.identity` 提供真人时名单可为空。真人可设 `group`、`providers` 和 `models`。identity 占用者只用当前业务线。`@` 模型来自 `listMentionModels`，不是 Config AI 占用者 |
| `maxMessageBytes` | `65,536` | 一条房间消息的最大 UTF-8 字节数 |
| `maxCompileBytes` | `32,768` | 一次编译出的提及任务或房间 Agent 上下文增量的最大 UTF-8 字节数；超出的较早房间行只从编译副本中丢弃（不动持久日志），并留下一行省略标记 |

生成的[配置目录](../../../docs/config-catalog.zh.md#deepseek-aidsh-experimental-collaboration)是每个已接受字段及其 JSDoc 的穷尽来源。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现内部 — 点击展开</summary>

第一个发帖或 `claimRoom` 的真人是创建人。加载了 identity 时，已登录的根 Agent 启动会在 `session/create` 返回前把该账号写成创建人。之后的真人在现有占用者 `@` 他们之前不能发帖、发布或发送。房间行是非表层 `collaboration/message` 事件。它们永不进入房间 Session 的 `deriveMessages()`，因此发帖不会开启房间 turn。每次房间 Agent 进入模型步之前（`agent/pre-step`），尚未编译的房间增量都会作为 `collaboration-room-context` 用户消息前置进入本步，因此普通发送和 `sendWithRoom` 都会把最近的房间对话带给模型。`admitRoomContext` 可显式写入该增量而不 followup。提及分发读取结构化 `mentions`，按「发起 @ 的真人 × AI 占用者」用 `agents.create` 和 `buildForkSeed` 创建子会话（投影里已有该真人的子会话 id 时改为 `agents.resume`），编译按占用者的誊本（房间帖加上房间 Agent 的 user/assistant 轮次；继承前缀不会进入子会话的 `deriveMessages()`），并对该子会话 `followup`。`collaboration/actor-invoked` 存储编译截止 seq，以便同一真人之后再 @ 同一 AI 只发送尚未编译的增量。子会话的工具事件留在子日志。房间 journal 在 flush 这次 invoke 后释放。发起 @ 的真人调用 `publishFromChild` 把最新 assistant 文本拷到房间，也可以指定 `assistantSeq` 拷某一条较早回复；房间 Agent 不在线时发布会把它冷恢复，同一分支回复重复发布会被拒绝。之后再 `publishFromChild` 会拷更新的分支回复。某个被 @ 的分支启动失败时，房间行仍然落盘，发帖结果用 `failedActorIds` 报告那个占用者，而不是让整帖失败。只有根 Session（没有 `parentSession`）可以认领为房间；分支和子代理 Session 即使投影折叠了继承来的占用者，也拒绝按房间发帖。占用者可 `leaveRoom`（创建人须等房间里没有其他人），创建人可 `removeOccupant` 移除另一位占用者；两者都写入 `collaboration/occupant-removed`。

源码对照：`src/types.ts` 事件、`src/projection.ts` 折叠、`src/compiler.ts` 誊本、`src/journal.ts` 队列、`src/index.ts` 服务。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [协作房间 Agent Note](../../../.agents/notes/proposed/feature/2026-10-12-collaboration-room-fork-publish.zh.md) — 非表层房间事件和按占用者编译。
- [分支、发布与 ACL](../../../.agents/notes/proposed/feature/2026-10-29-collaboration-branch-publish.zh.md) — 答案留在分支上直到发布。
- [新增协作房间](../../../docs/cookbook/adding-a-collaboration-room.zh.md) — 组合包安装与 Client `@` 模型。
- [实验性包](../README.zh.md) — 隔离与命名。
- [Agent Teams](../../team/agent-team/README.zh.md) — 自动化 teammate，不是这个房间。
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

- **已登录身份发帖** — 加载了 `ctx.identity` 时，房间发帖必须使用该 Host 当前登录账号。登录在 identity 插件上，不在本包。
- **在线占用 ACL** — `remoteAccess` 策略 `local-identity` 按占用关系过滤 Session 的列出、打开和事件——占用关系来自在线房间，或启动时从持久化日志重放。占用者可写自己的房间和分支。房间第一位占用者是创建人，对其房间和自己的分支拥有全部会话级 Host 动作，与角色和已勾选能力无关。开出分支的真人对该分支同样拥有全部会话级动作，即使他只是被邀请进房间的占用者。占用者可在这些 Session 上开关 Agent Teams、置顶和归档。管理员可读全部 Session，不能写别人的房间。`session/create` 是 Workspace 资源调用：策略为每个已列出的 Workspace 发绑定，已登录账号才能在其中建 Session。被勾选「工作区」能力的账号和种子管理员在这些 Workspace 上拥有全部工作区级 Host 动作；其他管理员可新增、重命名和删除。创建在返回前写入创建人。遗留空房间对普通成员仍不进列表，但开放 `claimRoom` 和第一次发到房间；管理员的只读绑定不再盖住这两项。占用情况未知或非根的 Session 永不给认领绑定。启动时 Host 会把每个持久化 Session 日志重放进占用缓存，因此冷房间在任何人恢复它之前就对占用者可列出、可读（管理员只读）；打开时按需恢复。
- **实验性原型，无稳定性承诺** — 本包公开，但孵化期间契约可以改。
- **没有旁听、@all 或 AI 之间互相 @** — 只有真人的 `mentions` 列表会开启子会话 turn。
- **默认 Web 隔离** — 发行应用不得依赖本包；从协作房间组合包加载。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>给维护者的工作上下文 — 点击展开</summary>

本开发备注是给维护者的工作上下文，明确不具权威性。

Composer 提交拦截以 `ui-conversation` 拥有的 `conversation/before-send` 串行事件落地：带房间提及 chip 的发送成为 `collaboration/postMessage`，其余发送保持普通 prompt 路径。加载了 identity 插件时房间发帖优先使用已登录的 identity 账号；否则由 Config roster 提供占用者。

</details>
