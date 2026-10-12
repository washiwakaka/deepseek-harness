---
description: "按实验性插件实现拟议的多人协作房间：共享 Session 上的非表层同伴聊天、按用户 fork，以及发布选定结果。"
---

# 实操手册：新增协作房间

[English](adding-a-collaboration-room.md) | 中文

## 摘要

用本教程在现有 Session（会话）、Agent（智能体）、Remote 与 Conversation API 上新增实验性协作房间，且不改 `agent-loop`。读者从一个已经能跑 Web 的贡献者工作区开始。结果是 overlay 插件：人们在一个房间 Session 上聊天，每次模型调用 fork 子会话，获准的回答作为房间事件复制回去。下文点名的包在后续改动加入之前不在工作区中；本页是[协作房间 Agent Note](../../.agents/notes/proposed/feature/2026-10-12-collaboration-room-fork-publish.zh.md) 的实现路径。

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

```421:422:packages/core/agent-loop/src/agent.ts
          this.session.append('user/message', message, { surfaceOp: 'append' })
```

`Session.append` 只对表层事件类型要求 `surfaceOp`。`turn/start` 这类非表层类型不能带该参数，因此 `collaboration/*` 事件不会进入 `deriveMessages()`：

```842:847:packages/core/session/src/index.ts
   * Derive the LLM message history by walking the ordered sequences of
   * message-producing events maintained by `surfaceOp` markers. The
   * surface is the single source of derived history: every message-producing
   * append records its `surfaceOp`, so a raw event with no marker (a chunk, a
   * turn boundary) is correctly absent
```

`ctx.sessions.fork` 拷贝闭区间前缀，盖上 `parentSession` / `isSeeded`，并且只把拷贝的事件计入 `inheritedEventCount`。它不会把之后的子会话追加合并回源会话：

```1239:1271:packages/core/session/src/index.ts
   * Create a live child session from an exact prefix of a live source.
   * `boundary` is an inclusive source event seq; omitted means the source's
   * current last event.
  fork(source: SessionForkSource, boundary?: SessionSeq, childSessionId?: SessionId): Session {
    ...
      inheritedEventCount: SessionLogOffset(resolved === undefined ? 0 : resolved + 1),
      meta: {
        ...liveSource.header.cwd !== undefined ? { cwd: liveSource.header.cwd } : {},
        parentSession: liveSource.id,
        isSeeded: true,
      },
```

拷贝过来的 `collaboration/*` 事件仍然没有 `surfaceOp`，所以子 Agent 仍无法通过 `deriveMessages()` 看见它们。`openBranch` 必须把这些事件编译成一条 `UserMessage`，并对子会话调用 `Agent.followup`。Agent Teams 已经用这种方式存储非表层插件事件：`packages/experimental/agent-team/src/types.ts` 的声明合并、`TeamJournal.appendAndFlush` 的无表层追加，以及 `packages/experimental/agent-team-profile/cordis.patch.yml` 的按需 overlay 行。

-----

<a id="scaffold"></a>
## 1. 搭建 Host 包骨架

按 Agent Teams 布局创建 `packages/experimental/collaboration/`：`package.json` 名称为 `@deepseek-ai/dsh-experimental-collaboration`，省略 `private`，设置 `publishConfig.access: public`，并在 `peerDependencies` 与 `devDependencies` 中同时保留 `@deepseek-ai/cordis`。在 `tsconfig.host.json` 里紧挨 `agent-team` 增加 `{ "path": "./packages/experimental/collaboration" }`。建议模块：`src/types.ts`（`SessionEventMap` 合并）、`src/journal.ts`、`src/projection.ts`、`src/compiler.ts`、`src/branches.ts`、`src/index.ts`（`ctx.collaboration`）。`tsconfig.json`、`tsdown.config.ts`、locale 文件和 README 对见[新增包](adding-a-package.zh.md)。

-----

<a id="tests"></a>
## 2. 先让测试失败，再实现

在 journal 之前写 `tests/message.spec.ts`：两次 `postMessage` 产生两条 `collaboration/message`；投影列出作者和正文；房间 Agent 不开 turn。在 `openBranch` / `publish` 之前写 `tests/branch.spec.ts`：子会话 `inheritedEventCount > 0`；第一条子任务含带作者名的编译聊天；子会话上现有 `prompt` 得到 assistant 文本；`publish` 写入带该文本的 `collaboration/branch-published`；第二次 `openBranch` 编译已发布文本。把 `postMessage` 实现为只追加并 flush、不调用 `followup`。把 `openBranch` 实现为 `sessions.fork` 加编译器加子会话 `followup`。把 `publish` 实现为把正文复制到房间，而不是 JSONL 合并。

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
pnpm --silent run persistence-changes --record 2026-10-12-collaboration-room-events --prose .artifacts/persistence-change.prose.json
```

若记录当天不是 2026-10-12，使用该改动的日期。不要在没有承认的情况下落地 SessionEventMap 键。

-----

<a id="package-checks"></a>
## 4. 包级检查

在 Host 测试变绿之前只跑新包：

```sh
pnpm exec vitest run packages/experimental/collaboration/tests
pnpm exec tsc -b packages/experimental/collaboration --pretty false
```

`test:coverage` 要求 `packages/*/*/src` 达到 100%。同一改动覆盖 journal、编译器和分支路径。不要为这个孤立包跑整仓套件。

-----

<a id="remote"></a>
## 5. Remote

新增 `packages/experimental/api-collaboration`，作为 `namespace: 'collaboration'` 的 `TypertRemoteService`。用 `@Remote` 暴露 `postMessage`、`openBranch`、`publish` 和 `discard`，`signal: AbortSignal` 放在最后，`RemoteError` 码留在本包。遵循[新增 Remote API](adding-a-remote-api.zh.md)。从 overlay 挂载该贡献，而不是从默认 Web remotes 列表。

-----

<a id="client-ui"></a>
## 6. Client UI

新增 `packages/experimental/client-ui-collaboration`。为 `collaboration/*` 注册会话事件类型，并贡献同伴行与已发布成果卡片的 Chat node。为房间聊天与 fork 增加 Composer 动作，并为子会话增加发布动作。文案走 locale 词典和 `t()`。不要改 `ui-conversation` 核心路径；通过现有 slot 注入。见 [Conversation 子系统](../subsystems/conversation.zh.md)和 [Agent Teams Client UI](../../packages/experimental/client-ui-agent-team/README.zh.md)。

-----

<a id="overlay"></a>
## 7. Overlay profile

新增 `packages/experimental/collaboration-profile/cordis.patch.yml`，在 Web base 之后插入三个插件，并带 Config actor 白名单。插入风格对齐 `packages/experimental/agent-team-profile/cordis.patch.yml`。overlay 存在之后，预期启动命令是：

```sh
pnpm dsh web --patch packages/experimental/collaboration-profile/cordis.patch.yml
```

在第 7 步的文件出现之前，该命令会失败。隔离检查仍须拒绝默认 Web 加载这些行。

-----

<a id="manual"></a>
## 8. 手工验收

在 overlay Web 上用两个浏览器：

1. Actor A 发一条房间消息；actor B 在同一 Session 的 follow 流上看到它；房间日志没有新的 `turn/start`。
2. Actor A fork，在子会话里用普通 Composer 与模型交谈，然后发布。
3. Actor B 在房间看到已发布卡片；B 下一次 fork 把 A 的聊天和已发布文本编译进子任务。
4. 打开房间 `session.v4.jsonl`，确认其中是 `collaboration/*` 事件，而不是子会话的工具调用。

按该顺序拆 PR：Host 消息、Host 分支、持久化承认、Remote、UI 与 overlay。

-----

<a id="further-exploration"></a>
## 延伸阅读

- [协作房间 Agent Note](../../.agents/notes/proposed/feature/2026-10-12-collaboration-room-fork-publish.zh.md) — 为何采用 fork 再发布，以及哪些替代方案被否决。
- [交互式侧会话](../../.agents/notes/proposed/feature/2026-07-08-interactive-side-sessions.zh.md) — 单用户顾问 fork，用 `context/message` 合并回写。
- [新增包](adding-a-package.zh.md) — 新 workspace 包的文件检查清单。
- [评审持久化类型变更](reviewing-persistence-type-changes.zh.md) — 如何记录 SessionEventMap 键。
- [Agent Teams 包](../../packages/experimental/agent-team/README.zh.md) — 本工作所复制的非表层事件与 overlay 模式。

-----

<a id="dev-note"></a>
## 开发备注

本手册点名的协作包、overlay 和持久化记录在撰写时还不在源码树中。第 4、7、8 步中的命令只有在对应文件存在之后才能执行。本页不是产品承诺，也不上文档网站。
