# Agent Note: 协作房间：按用户 fork 并发布

Status: proposed

[English](2026-10-12-collaboration-room-fork-publish.md) | 中文

## 问题

若干真人和具名 AI 占用者需要共用一个持久房间：彼此交谈，真人 @ 某个 AI 以启动该模型，该 AI 的回复成为房间的持久上下文。把同伴聊天写成 `user/message` 会唤醒房间 Agent（智能体），并把谈话混进 `deriveMessages()`。fork 子会话会拷贝前缀然后分叉；不存在 JSONL 合并，子会话自有的工具轨迹也不得灌进房间日志。对同一 AI 的后续 @ 若每次重发整屋记录，会与该子会话日志里已有的内容重复。[交互式侧会话](2026-07-08-interactive-side-sessions.zh.md)提案覆盖的是单用户从活跃会话探索、并向父会话写入一条 `context/message`。[LiveShare](../../../../packages/experimental/liveshare/README.zh.md) 随后交付的是把一个 Session 分享给远程 viewer，其 prompt 是 `user/message`。两者都不覆盖多人身份、AI 占用者、非表层房间聊天、或按占用者编译的上下文。

## 提案

选择性发布、工作分支和房间 ACL 见[后续笔记](2026-10-29-collaboration-branch-publish.zh.md)。本笔记仍负责非表层同伴聊天、overlay 隔离和按占用者的编译器。

以 overlay 插件交付实验性协作房间。房间 Session（会话）用非表层 `collaboration/*` 事件存储同伴聊天和 AI 回复。Config 列出真人 actor 和 AI 占用者（id、显示名、模型）。真人的 `collaboration/message` 除非在结构化 `mentions` 字段里点名 AI id，否则不开启 turn。每个 AI 占用者拥有一条持久子 Session：第一次 @ 通过 `agents.create` 和 `buildForkSeed` 拷贝当前房间前缀（与 `sessions.fork` 相同的前缀拷贝，不盖 `parentSession`、不设 `origin: 'subagent'`）；之后再 @ 同一 AI 是对该子会话 `followup`。编译器按占用者工作：第一次 @ A 编译截至该消息的全部房间可见事件；之后再 @ A 只编译 A 水位之后的事件；第一次 @ B 编译完整的房间可见誊本，包括 A 已贴出的回复，不包括 A 子会话的工具轨迹。被 @ 的子会话一轮结束后，把 assistant 文本作为该 AI 的 `collaboration/message` 追加到房间。不要改 `agent-loop`。第一期用 Config 白名单认证真人；随后用 Host 鉴权身份替换该名单。默认 Web、Desktop 与其它发行应用不得依赖这些包。文件级步骤由[实现实操手册](../../../../docs/cookbook/adding-a-collaboration-room.zh.md)负责。

## 包拓扑

四个实验性包，命名对齐 Agent Teams，隔离规则见[实验性包规则](../../../../packages/experimental/AGENTS.md)和[默认产品隔离](../../implemented/process/2026-09-12-default-product-experimental-isolation.zh.md)：

| 包目录 | npm 名称 | 职责 |
|---|---|---|
| `experimental/collaboration` | `@deepseek-ai/dsh-experimental-collaboration` | 事件、投影、按占用者的编译器、提及分发、`ctx.collaboration` |
| `experimental/api-collaboration` | `@deepseek-ai/dsh-experimental-api-collaboration` | Host `@Remote` 方法，namespace 为 `collaboration` |
| `experimental/client-ui-collaboration` | `@deepseek-ai/dsh-experimental-client-ui-collaboration` | Chat node、占用者名单、@ 选择器 |
| `experimental/collaboration-profile` | `@deepseek-ai/dsh-experimental-collaboration-profile` | `cordis.patch.yml` overlay |

## 持久化事件

用声明合并把事件写入 `SessionEventMap`，方式与 Agent Teams 的 `team/*` 相同。房间事件省略 `surfaceOp`，因此永不进入 `deriveMessages()`。拟议键名：`collaboration/message`（真人和 AI 回复；可选结构化 `mentions`）、`collaboration/branch-opened`（某 AI 子会话的第一次 fork）、`collaboration/actor-invoked`（`actorId`、`childSessionId`、`throughSeq` 水位）、可选的 `collaboration/branch-published` 供后续私有分支路径使用，以及可选的 `collaboration/branch-discarded`。未知读取方仍遵守[默认必读，除非 `ignorable: true`](../../implemented/architecture/2026-08-10-session-log-version-mechanism.zh.md)。新增这些键是持久化类型变更，须在同一改动中做[持久化承认](../../../../docs/cookbook/reviewing-persistence-type-changes.zh.md)。水位从 `actor-invoked` 事件重建，而不是从进程内存读取。

## AI 占用者与提及上下文

房间可见上下文是真人消息加上已经落在房间上的 AI 回复。子会话工具调用留在子日志里。编译出的任务是带说话人标记的誊本（`[Alice] …`、`[A] …`）加上「收件人是该占用者」的说明，而不是 JSONL 倾倒。

**第一次 @ A。** 确保 A 的子会话存在（只 `agents.create` 加 `buildForkSeed` 一次）。编译 `(start, mentionSeq]` 内的房间可见事件。对该批次在 A 的子会话上 `followup`。追加 `branch-opened` 和 `throughSeq = mentionSeq` 的 `actor-invoked`。

**之后再 @ 同一个 A。** 不再 fork。只编译 `(A 上次的 throughSeq, mentionSeq]` 内的房间可见事件。A 的子会话已经持有先前编译批次、A 的 assistant 文本和 A 的工具。重发整屋没有必要，只会重复占 token。若房间上除了这条提及没有新内容，该批次就是这条提及加上尚未编译的行。

**A 说过话之后第一次 @ B。** B 没有子会话记忆。编译截至该提及的完整房间可见誊本，包括 A 已贴出的回复。不要拷贝 A 的子 JSONL。B 由此知道 A 已经作答，但看不见 A 的工具。

**未被提及的消息。** 只追加。它们提高每个占用者的待编译增量，但在该占用者被 @ 之前不开启子会话 turn。

**自动贴回。** @-AI 的约定是答案在房间里。子会话一轮结束后，以该 AI 的身份 `postMessage` assistant 文本。手动 `publish` 留给后续的真人私有分支；提及轮次不需要它。

第一期在房间存续期间冻结每个 AI 占用者的模型，把对同一 AI 的并发 @ 排进该子会话队列，并把一条消息里提及多个 AI 视为对着同一房间快照的并行调用。无 @ 的旁听、@all、AI 之间互相 @、以及同一房间里的真人私有分支都不进第一期。

## Host 操作

`ctx.collaboration.postMessage` 追加 `collaboration/message` 并 flush；不得对房间 Session 调用 `followup`。提及分发用 `ctx.effect` 读取 `mentions`，对每个 AI 占用者调用 `ensureChild`，按占用者把增量编译到新 seq，对子会话 `followup`，并记录 `actor-invoked`。`ensureChild` 仅在该占用者还没有子会话时调用带 `buildForkSeed` 的 `ctx.agents.create`；子会话会复制 cwd 和 `isSeeded`，但不盖 `parentSession`。第一次子会话记在 `collaboration/branch-opened` 上。子会话一轮结束后，把 assistant 文本作为该 AI 的房间消息追加。可选的 `publish` / `discard` 仍是后续私有分支路径上的正文复制与放弃。子会话轮次走现有 `prompt` / follow 路径。不要把子会话的 `origin` 设成 `subagent`。

## 隔离

只通过 profile overlay 的 `--patch` 启用该组合，对齐 `packages/experimental/agent-team-profile/cordis.patch.yml`。不要把这些包加入 `dsh-web-app` 依赖、默认 Web HTML 或已交付的 bundle。不要靠选中 LiveShare bundle 来启用房间。

## 考虑过的替代方案

**把同伴聊天写成 `user/message`。** 否决，因为 `agent-loop` 会以 `surfaceOp: 'append'` 追加这些事件，它们会进入模型历史并开启新 turn。

**把子 JSONL 合并进房间。** 否决，因为 fork 拷贝前缀后即分叉；没有合并原语，子会话工具轨迹会污染共享日志。

**把已发布成果注入为父会话 `context/message`（侧会话合并回写）。** 对本产品否决：房间聊天与 AI 回复需要独立的客户端渲染，并且必须离开房间 Agent 表层，直到子会话编译器选中它们。

**复用 LiveShare。** 否决，因为 viewer 的 prompt 是源 Session 上带 `share-viewer` 主体的 `user/message`，会驱动该 Session 的 Agent。房间需要的是不会开启房间 turn 的同伴聊天。

**复用 `ctx.agentTeams`。** 否决，因为 Agent Teams 建模的是自动化队友和工具，不是真人加按 @ 唤醒的 AI 占用者共用的房间。

**改 `agent-loop` 或 `deriveMessages` 为协作做特例。** 否决：新行为应落在扩展点上；按占用者的编译器是把房间事件变成一条子任务的显式 resolve 步骤。

**把插件挂进默认 Web bundle。** 被实验性隔离否决：默认产品图不得点名实验性包。

**对同一 AI 的后续 @ 每次重发整屋。** 否决：该占用者的持久子会话已经持有先前编译结果和它自己的回复；只有尚未编译的房间增量是新的。

**每次 @ 都 fork 新的子会话。** 否决：第二次 @ A 会丢掉 A 的工具记忆，除非编译器把一切重发一遍；每个占用者一条子会话才是 resolve 步骤。

**把 A 的子日志拷给 B。** 否决：B 只应看见房间可见文本。A 的工具不是房间上下文。

## 验收标准

- 同一房间 Session 上的两个客户端能看到同伴的 `collaboration/message`，且房间不产生新的 `turn/start`。
- 未被提及的真人消息不对任何 AI 子会话 `followup`。
- 第一次 @ A 只 fork 一次，编译此前全部房间可见事件，并对 A 的子会话 `followup`。
- 之后再 @ A 不再 fork；子任务只包含 A 水位之后的房间增量加上这条提及。
- 第一次 @ B 编译完整的房间可见誊本（含 A 已贴出的回复），并排除 A 子会话的工具事件。
- A 的提及轮次完成后追加一条来自 A 的房间 `collaboration/message`；房间日志不接收 A 的工具事件。
- 默认 Web 隔离检查仍然通过；只有显式 overlay 会加载这些插件。
- SessionEventMap 变更在同一改动中带有持久化承认。

## 风险

- Config 中的 actor id 不是登录。后续身份改动必须停止在没有 Host 主体的情况下信任 Client 提供的名字。
- 晚加入的 AI 第一次被 @ 仍会编译整段房间可见日志；按占用者的压缩不在第一期范围内。
- 同一房间上的并发发帖和提及调用需要类似 `TeamJournal.transact` 的 journal 队列，否则后写者会打乱事件顺序和水位。
- 对已压缩房间做 fork 会继承摘要而不是被替换的 turn；UI 应披露这一点。
- 自动贴回的 AI 文本是共享日志上的模型输出；编译器必须标记说话人和收件人，以免后来的占用者把另一个 AI 的回复当成自己的先前轮次。
