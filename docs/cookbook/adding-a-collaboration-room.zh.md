---
description: "按实验性插件实现拟议的协作房间：共享 Session 上的非表层同伴聊天、按 @ 唤醒的具名 AI 占用者、按占用者持久子会话，以及从分支选择性发布。"
---

# 实操手册：新增协作房间

[English](adding-a-collaboration-room.md) | 中文

## 摘要

用本教程在现有 Session（会话）、Agent（智能体）、Remote 与 Conversation API 上新增实验性协作房间，且不改 `agent-loop`。读者从一个已经能跑 Web 的贡献者工作区开始。结果是 overlay 插件：真人和具名 AI 占用者共用一个房间 Session；未被提及的消息不进入任何 Agent；@ 对该 AI 的子会话 fork 一次，按占用者编译增量，答案留在分支上直到发布。Host、Remote、overlay 与 Client UI 包已在工作区。本页是[协作房间 Agent Note](../../.agents/notes/proposed/feature/2026-10-12-collaboration-room-fork-publish.zh.md) 与[分支发布 Agent Note](../../.agents/notes/proposed/feature/2026-10-29-collaboration-branch-publish.zh.md) 的实现路径。

## 目录

- [前置条件](#prerequisites)
- [所属机制](#owning-seams)
- [1. 搭建 Host 包骨架](#scaffold)
- [2. 先让测试失败，再实现](#tests)
- [3. 承认持久化](#persistence)
- [4. 包级检查](#package-checks)
- [5. Remote](#remote)
- [6. Client UI](#client-ui)
- [7. Overlay profile](#overlay)
- [8. 手工验收](#manual)
- [延伸阅读](#further-exploration)
- [开发备注](#dev-note)

-----

<a id="prerequisites"></a>
## 前置条件

阅读[包检查清单](adding-a-package.zh.md)、[实验性包规则](../../packages/experimental/AGENTS.md)、[实验性状态](../../packages/experimental/README.zh.md#status)和[默认产品隔离](../../.agents/notes/implemented/process/2026-09-12-default-product-experimental-isolation.zh.md)。不要把这些包加入 `dsh-web-app` 或默认 Web HTML。第一期 actor 来自 Host Config，而不是 Client 提供的显示名。

-----

<a id="owning-seams"></a>
## 所属机制

同伴聊天不得使用 `user/message`。循环会把收件箱消息写入表层，它们会成为模型历史：

```471:472:packages/core/agent-loop/src/agent.ts
            this.session.append('user/message', message, { surfaceOp: 'append' })
```

`Session.append` 只对表层事件类型要求 `surfaceOp`。`turn/start` 这类非表层类型不能带该参数，因此 `collaboration/*` 事件不会进入 `deriveMessages()`：

```982:987:packages/core/session/src/index.ts
   * Derive the LLM message history by walking the ordered sequences of
   * message-producing events maintained by `surfaceOp` markers. The
   * surface is the single source of derived history: every message-producing
   * append records its `surfaceOp`, so a raw event with no marker (a chunk, a
   * turn boundary) is correctly absent
```

`ctx.sessions.fork` 拷贝闭区间前缀，复制 cwd，设置 `isSeeded`，并且只把拷贝的事件计入 `inheritedEventCount`。它不盖 `parentSession`，也不会把之后的子会话追加合并回源会话：

```1387:1419:packages/core/session/src/index.ts
   * Create an independent live session from an exact prefix of a live source.
  fork(source: SessionForkSource, boundary?: SessionSeq, childSessionId?: SessionId): Session {
    ...
      inheritedEventCount: SessionLogOffset(resolved === undefined ? 0 : resolved + 1),
      meta: {
        ...liveSource.header.cwd !== undefined ? { cwd: liveSource.header.cwd } : {},
        isSeeded: true,
      },
```

拷贝过来的 `collaboration/*` 事件仍然没有 `surfaceOp`，所以子 Agent 仍无法通过 `deriveMessages()` 看见它们。继承来的房间 `user/message` 与 `assistant/message` 也不在子会话自己的历史里。提及分发必须把房间帖和这些房间 Agent 轮次按被 @ 的 AI 编译成一条 `UserMessage`，对该占用者的持久子会话调用 `Agent.followup`，并把 `throughSeq` 记在 `collaboration/actor-invoked` 上。该 AI 的第一次 @ 还会用 `buildForkSeed` 调用 `agents.create` 并写入 `collaboration/branch-opened`。不要设置 `origin: 'subagent'`。编译器按占用者工作：A 的第二次 @ 只发送 A 水位之后的事件；B 的第一次 @ 发送完整的房间可见誊本，包括 A 已发布的回复，绝不包括 A 的子会话工具。答案留在分支上，直到 `publishFromChild` 把最新 assistant 文本拷到房间。Agent Teams 已经用这种方式存储非表层插件事件：`packages/experimental/agent-team/src/types.ts` 的声明合并、`TeamJournal.appendAndFlush` 的无表层追加，以及 `packages/experimental/agent-team-profile/cordis.patch.yml` 的按需 overlay 行。LiveShare 不是这个模式：viewer 的 prompt 是源 Session 上的 `user/message`。

-----

<a id="scaffold"></a>
## 1. 搭建 Host 包骨架

按 Agent Teams 布局创建 `packages/experimental/collaboration/`：`package.json` 名称为 `@deepseek-ai/dsh-experimental-collaboration`，省略 `private`，设置 `publishConfig.access: public`，并在 `peerDependencies` 与 `devDependencies` 中同时保留 `@deepseek-ai/cordis`。在 `tsconfig.host.json` 里紧挨 `agent-team` 增加 `{ "path": "./packages/experimental/collaboration" }`。建议模块：`src/types.ts`（`SessionEventMap` 合并）、`src/journal.ts`、`src/projection.ts`、`src/compiler.ts`、`src/mentions.ts`、`src/branches.ts`、`src/index.ts`（`ctx.collaboration`）。`tsconfig.json`、`tsdown.config.ts`、locale 文件和 README 对见[新增包](adding-a-package.zh.md)。

-----

<a id="tests"></a>
## 2. 先让测试失败，再实现

在 journal 之前写 `tests/message.spec.ts`：两次未被提及的 `postMessage` 产生两条 `collaboration/message`；投影列出作者和正文；房间和子会话都不 `followup`。在分发器之前写 `tests/mention.spec.ts`：第一次 @ A 只 fork 一次，编译此前的房间可见行和房间 Agent 轮次，并对 A 的子会话 `followup`；之后再 @ A 不再 fork，只编译 `actor-invoked.throughSeq` 之后的增量；第一次 @ B 编译完整的房间可见誊本（含 A 已发布的回复），并排除 A 的工具事件。把 `postMessage` 实现为只追加并 flush、不对房间 `followup`。把分发器实现为 `ensureChild` 加按占用者的编译器加子会话 `followup` 再加 `actor-invoked`。`postMessage` 返回子会话 id。用 `publishFromChild` 把最新 assistant 文本作为该 AI 的房间消息拷过去；不要合并子 JSONL。

-----

<a id="persistence"></a>
## 3. 承认持久化

`SessionEventMap` 声明合并是持久化类型变更。类型能编译之后，在仓库根目录运行：

```sh
pnpm run gen-persistence-catalog
pnpm --silent run verify-persistence-changes --json
```

写双语兼容性说明，再按[持久化实操手册](reviewing-persistence-type-changes.zh.md)记录：

```sh
pnpm --silent run persistence-changes --record 2026-10-29-collaboration-room-events --prose .artifacts/persistence-change.prose.json
```

若记录当天不是 2026-10-29，使用该改动的日期。不要在没有承认的情况下落地 SessionEventMap 键。

-----

<a id="package-checks"></a>
## 4. 包级检查

在 Host 测试变绿之前只跑新包：

```sh
pnpm exec vitest run packages/experimental/collaboration/tests
pnpm exec tsc -b packages/experimental/collaboration --pretty false
```

`test:coverage` 要求 `packages/*/*/src` 达到 100%。同一改动覆盖 journal、编译器和提及分发路径。不要为这个孤立包跑整仓套件。

-----

<a id="remote"></a>
## 5. Remote

新增 `packages/experimental/api-collaboration`，作为 `namespace: 'collaboration'` 的 `TypertRemoteService`。用 `@Remote` 暴露带结构化 `mentions` 的 `postMessage` 和 `publish`，`signal: AbortSignal` 放在最后，`RemoteError` 码留在本包。遵循[新增 Remote API](adding-a-remote-api.zh.md)。从 overlay 挂载该贡献，而不是从默认 Web remotes 列表。

-----

<a id="client-ui"></a>
## 6. Client UI

新增 `packages/experimental/client-ui-collaboration`。为 `collaboration/*` 注册会话事件类型，并贡献真人行、AI 回复，以及从 `collaboration/actor-invoked` 开始的「深度求索中」行。注册名为 `models`、`order: -10` 的 `@` source，让设置模型排在会话和文件前面。把测试真人选择器放在 `conversation.header.leading` 上。在 `conversation.input.right` 注入小按钮，分别通过 `collaboration.postMessage` 发帖或通过 `collaboration.sendWithRoom` 发送，并在这些调用未返回时在 Composer dock 显示思考指示。带提及的发帖之后，`openSession` 返回的分支 id。在分支上注入「推到主会话」，调用 `collaboration.publish`。文案走 locale 词典和 `t()`。不要改 `ui-conversation` 核心路径；通过现有 slot 注入。见 [Conversation 子系统](../subsystems/conversation.zh.md)和 [Agent Teams Client UI](../../packages/experimental/client-ui-agent-team/README.zh.md)。

-----

<a id="overlay"></a>
## 7. Overlay profile

`packages/experimental/collaboration-profile/cordis.patch.yml` 在 Web base 之后插入 Host、Remote 与 Client UI 插件。占用者来自 Host 插件默认名单或可选 Config 覆盖；Client 调 `listActors`。回车仍走普通 Session prompt。overlay 存在之后，预期启动命令是：

```sh
pnpm dsh web --patch packages/experimental/collaboration-profile/cordis.patch.yml
```

该 overlay 加载 Host、Remote，以及 Client UI 的标题栏标记、房间消息行、设置模型 `@` source 和「发到房间」按钮。回车仍走普通 Session prompt。隔离检查仍须拒绝默认 Web 加载这些行。不要用选中 LiveShare bundle 来代替。

-----

<a id="manual"></a>
## 8. 手工验收

在 overlay Web 上用两个浏览器：

1. 真人 Alice 发一条未被提及的房间消息；切到 Bob 后该 Session 从侧栏消失，直到 Alice `@` Bob；房间日志没有新的 `turn/start`，也没有子会话 `followup`。
2. Alice @ A；A 的子会话只 fork 一次；Client 打开该分支；第一条子任务含截至该提及的编译房间行；房间在「推到主会话」之前没有新的 AI 行。
3. 真人继续交谈，然后 Alice 再次 @ A；A 不再 fork；新的子任务只是 A 水位之后的增量。
4. Alice @ B；B 的第一条任务含完整房间可见誊本（包括 A 已发布的回复），不含 A 的工具调用。
5. 打开房间 `session.v4.jsonl`，确认其中是 `collaboration/*` 事件（含 `actor-invoked` 水位），而不是子会话的工具调用。

按该顺序拆 PR：Host 消息、Host 提及与编译器、持久化承认、Remote、UI 与 overlay。

-----

<a id="further-exploration"></a>
## 延伸阅读

- [协作房间 Agent Note](../../.agents/notes/proposed/feature/2026-10-12-collaboration-room-fork-publish.zh.md) — 为何采用持久子会话和按占用者增量，以及哪些替代方案被否决。
- [分支、发布与 ACL](../../.agents/notes/proposed/feature/2026-10-29-collaboration-branch-publish.zh.md) — 答案留在分支上直到发布；创建人独占直到 `@` 真人。
- [交互式侧会话](../../.agents/notes/proposed/feature/2026-07-08-interactive-side-sessions.zh.md) — 单用户顾问 fork，用 `context/message` 合并回写。
- [新增包](adding-a-package.zh.md) — 新 workspace 包的文件检查清单。
- [评审持久化类型变更](reviewing-persistence-type-changes.zh.md) — 如何记录 SessionEventMap 键。
- [Agent Teams 包](../../packages/experimental/agent-team/README.zh.md) — 本工作所复制的非表层事件与 overlay 模式。
- [LiveShare 包](../../packages/experimental/liveshare/README.zh.md) — 远程分享一个 Session；不是房间模型。

-----

<a id="dev-note"></a>
## 开发备注

Host、Remote、overlay、持久化承认、Chat 行、`@` 模型、「发到房间」、打开分支、「推到主会话」，以及创建人独占直到 `@` 真人的 ACL 已在源码树中。回车仍走 Session prompt。本页不是产品承诺，也不上文档网站。引用与 LiveShare 区分已按 `0.2.2-alpha.2` 核对。
