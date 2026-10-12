# Agent Note: 协作房间：按用户 fork 并发布

Status: proposed

[English](2026-10-12-collaboration-room-fork-publish.md) | 中文

## 问题

多人需要共用一个持久房间：彼此交谈，每人可从私有分支调用模型，获准的模型结果成为房间的持久上下文。把同伴聊天写成 `user/message` 会唤醒房间 Agent（智能体），并把人类谈话混进 `deriveMessages()`。fork 子会话会拷贝前缀然后分叉；不存在 JSONL 合并，子会话自有的工具轨迹也不得灌进房间日志。[交互式侧会话](2026-07-08-interactive-side-sessions.zh.md)提案覆盖的是单用户从活跃会话探索、并向父会话写入一条 `context/message`。它不覆盖多人身份、非表层房间聊天、或把已发布成果复制为专用事件。

## 提案

以 overlay 插件交付实验性协作房间。房间 Session（会话）用非表层 `collaboration/*` 事件存储同伴聊天和已发布成果。每次模型调用从当前房间前缀 fork 子 Session，把聊天与已发布成果编译成一条子任务消息，并在该子会话上运行普通 Agent。发布是把选定的 assistant 文本复制进一条新的房间事件，而不是合并子日志。不要改 `agent-loop`。第一期用 Host 上的 Config 白名单认证 actor；随后用 Host 鉴权身份替换该名单。默认 Web、Desktop 与其它发行应用不得依赖这些包。文件级步骤由[实现实操手册](../../../../docs/cookbook/adding-a-collaboration-room.zh.md)负责。

## 包拓扑

四个实验性包，命名对齐 Agent Teams，隔离规则见[实验性包规则](../../../../packages/experimental/AGENTS.md)和[默认产品隔离](../../implemented/process/2026-09-12-default-product-experimental-isolation.zh.md)：

| 包目录 | npm 名称 | 职责 |
|---|---|---|
| `experimental/collaboration` | `@deepseek-ai/dsh-experimental-collaboration` | 事件、投影、编译器、`ctx.collaboration` |
| `experimental/api-collaboration` | `@deepseek-ai/dsh-experimental-api-collaboration` | Host `@Remote` 方法，namespace 为 `collaboration` |
| `experimental/client-ui-collaboration` | `@deepseek-ai/dsh-experimental-client-ui-collaboration` | Chat node 与 fork/发布动作 |
| `experimental/collaboration-profile` | `@deepseek-ai/dsh-experimental-collaboration-profile` | `cordis.patch.yml` overlay |

## 持久化事件

用声明合并把事件写入 `SessionEventMap`，方式与 Agent Teams 的 `team/*` 相同。房间事件省略 `surfaceOp`，因此永不进入 `deriveMessages()`。拟议键名：`collaboration/message`、`collaboration/branch-opened`、`collaboration/branch-published`，以及可选的 `collaboration/branch-discarded`。发布事件存储复制的正文、`childSessionId`、`actorId` 和 `baseSeq`。未知读取方仍遵守[默认必读，除非 `ignorable: true`](../../implemented/architecture/2026-08-10-session-log-version-mechanism.zh.md)。新增这些键是持久化类型变更，须在同一改动中做[持久化承认](../../../../docs/cookbook/reviewing-persistence-type-changes.zh.md)。

## Host 操作

`ctx.collaboration.postMessage` 追加 `collaboration/message` 并 flush；不得调用 `Agent.followup`。`openBranch` 调用 `ctx.sessions.fork`，把截至当前 seq 的房间事件编译出来，激活子 Agent，并对编译后的任务调用 `followup`。`publish` 读取选定的子会话 assistant 文本，在房间上追加 `collaboration/branch-published`。`discard` 记录放弃且不复制正文。子会话轮次走现有 `prompt` / follow 路径。

## 隔离

只通过 profile overlay 的 `--patch` 启用该组合，对齐 `packages/experimental/agent-team-profile/cordis.patch.yml`。不要把这些包加入 `dsh-web-app` 依赖、默认 Web HTML 或已交付的 bundle。

## 考虑过的替代方案

**把同伴聊天写成 `user/message`。** 否决，因为 `agent-loop` 会以 `surfaceOp: 'append'` 追加这些事件，它们会进入模型历史并开启新 turn。

**把子 JSONL 合并进房间。** 否决，因为 fork 拷贝前缀后即分叉；没有合并原语，子会话工具轨迹会污染共享日志。

**把已发布成果注入为父会话 `context/message`（侧会话合并回写）。** 对本产品否决：房间聊天与已发布成果需要独立的客户端渲染，并且必须离开房间 Agent 表层，直到子会话编译器选中它们。

**复用 `ctx.agentTeams`。** 否决，因为 Agent Teams 建模的是自动化队友和工具，不是共享房间的已认证人类。

**改 `agent-loop` 或 `deriveMessages` 为协作做特例。** 否决：新行为应落在扩展点上；编译器是把房间事件变成一条子任务的显式 resolve 步骤。

**把插件挂进默认 Web bundle。** 被实验性隔离否决：默认产品图不得点名实验性包。

## 验收标准

- 同一房间 Session 上的两个客户端能看到同伴的 `collaboration/message`，且房间不产生新的 `turn/start`。
- `openBranch` 创建的子会话其 `inheritedEventCount` 覆盖房间前缀，且第一条子任务包含编译后的聊天和先前已发布成果。
- 子 Agent 经现有循环作答；房间日志不接收该子会话的工具事件。
- `publish` 把选定的 assistant 文本作为 `collaboration/branch-published` 复制到房间。
- 之后的 `openBranch` 把该已发布文本编译进下一个子任务。
- 默认 Web 隔离检查仍然通过；只有显式 overlay 会加载这些插件。
- SessionEventMap 变更在同一改动中带有持久化承认。

## 风险

- Config 中的 actor id 不是登录。后续身份改动必须停止在没有 Host 主体的情况下信任 Client 提供的名字。
- 把不断增长的房间编译进每个子任务会挤压上下文；协作事件的压缩不在第一期范围内。
- 同一房间上的并发发布需要类似 `TeamJournal.transact` 的 journal 队列，否则后写者会打乱事件顺序。
- 对已压缩房间做 fork 会继承摘要而不是被替换的 turn；UI 应披露这一点。
