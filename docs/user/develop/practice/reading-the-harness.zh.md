# 阅读 harness

[English](reading-the-harness.md) | 中文

本教程是 [Cordis 教程](../../../cordis-tutorial/index.zh.md)之后的源码阅读路径。它不在 `tmp/` 下新增文件。完成后，你应能讲述一次轮次如何从 inbox 走到模型请求再走到工具结果，并在包裹该轮次的实时事件上挂载插件。

## 前置条件

先完成 [Cordis 教程第 1–7 章](../../../cordis-tutorial/index.zh.md)，尤其是[进入 harness](../../../cordis-tutorial/07-into-the-harness.zh.md)。在做需要 patch 进 Web 或 headless 的练习前，[第一个 Harness 插件](../basic/index.zh.md)会有帮助，但阅读循环本身并不依赖它。

## 完成标准

在不查阅架构页的情况下，你应能做到：

- 指出 [`packages/core/agent-loop/src/agent.ts`](../../../../packages/core/agent-loop/src/agent.ts) 中的 `kick`、`turn`、`preStep` 和 `step`，并说明各自追加或派发了什么。
- 区分持久会话事件（`turn/start`、`tool/result`）与实时扩展点（`agent/pre-step`、`tools/result`）。
- 把 [`dsh-base`](../../../../packages/bundle/base/cordis.patch.yml) 或 [`dsh-headless`](../../../../packages/bundle/headless/cordis.patch.yml) 中的一行对应到某个 `ctx` 键，包括 headless patch 只重述或插入的行。

## 三层结构

Harness 由三层叠成。Cordis 是插件运行时：`inject`、effect 和事件，对应第 1–6 章。产品主干是 `sessions`、`systemPrompt`、`tools`、`agents`、`agentLoop` 和 `llm`。[能力 seam](index.zh.md) 是可替换的 Service Definition、Service Provider 与 Consumer，通常是一个面向模型的工具。

对每个包都先问：它是在驱动循环、提供可替换能力，还是在监听扩展点？大多数包属于后者。新行为附加到已有文档记录的扩展点；改动循环时更新 [architecture.zh.md](../../../architecture.zh.md)。

模型看见的一切都必须已经在会话日志中。UI、持久化、fork 和回放都从这条仅追加日志投影。

## 走完一次轮次

### 架构与生命周期图

阅读 [architecture.zh.md](../../../architecture.zh.md#turn-flow) 的轮次流程，再看 [agent-lifecycle.zh.md](../../../agent-lifecycle.zh.md#reading-the-sequence) 的时序图与详解。[持久与实时](../../../agent-lifecycle.zh.md#durable-vs-live)一节标出每个名称。`agent/pre-step`、`agent/request`、`llm/stream` 以及三个 `tools/*` waterfall（瀑布式事件）必须调用 `next()`；`agent/turn-stopping` 是 serial 事件，没有 `next()`。

### 把事件矩阵当索引

[event-producer-consumer.zh.md](../../../event-producer-consumer.zh.md) 是查找表，不是课文。派发方列标明谁拥有这段控制流。监听方列标明哪些插件挂在该事件上。模式列标明如何监听。

先盯这八个：`session/event`、`agent/pre-step`、`agent/request`、`llm/stream`、`system-prompt/assemble`、`tools/pre-execute`、`tools/execute`、`tools/result`。打开声明处查看 payload，再打开派发方查看何时触发。

### `kick`、`turn`、`preStep` 和 `step`

需要精读的文件只有 [`packages/core/agent-loop/src/agent.ts`](../../../../packages/core/agent-loop/src/agent.ts)。第一次不要读完整包 README；那是驱动器的全部约定。

| 函数 | 职责 |
|---|---|
| `kick()` | 运行 `while (await this.turn())`，并把驱动器收回空闲。 |
| `turn()` | 追加 `turn/start`，运行零个或多个步骤，再追加 `turn/end`。 |
| `preStep()` | 领取 inbox 消息，调用 `systemPrompt.assemble`，再进入 `agent/pre-step` waterfall。 |
| `step()` | 用 `session.deriveMessages()` 组装模型请求，流式读取，然后运行工具。 |

用户输入进入 inbox，而不是直接进入模型。[Agent 句柄](../../../../packages/core/agent/README.zh.md) 上的 `followup`、`steer` 和 `inject` 共用该 inbox，差别在于是否唤醒驱动器。`agent/pre-step` 可以改写或拒绝已领取批次；首次领取被拒绝或为空时，仍会关闭一个没有模型调用的持久轮次。发给模型的历史来自 `session.deriveMessages()`。工具之后仍欠一次模型请求的步骤留在同一轮次内，并再开一个步骤。对着各阶段读该文件见[对着生命周期读 `agent.ts`](../../../agent-lifecycle.zh.md#reading-agent-ts)。

接着读 [`tool-calls.ts`](../../../../packages/core/agent-loop/src/tool-calls.ts) 了解独占屏障与有界并行池（[对着 `tool-calls.ts` 读](../../../tool-execution-pipeline.zh.md#reading-tool-calls)），以及 [`index.ts`](../../../../packages/core/agent-loop/src/index.ts) 中的 `create` / `resume` / `setFactory`。循环逻辑在 `agent.ts`；发布 agent（智能体）的插件外壳在 `index.ts`。

## 五个核心包

对每个包，先读 README 开头、`src/index.ts` 里的服务类，以及其[子系统页面](../../../subsystems/README.zh.md)上生成的 `cordis-surface` 区块。不要从完整 README 读起。

### `core/session`

[`packages/core/session`](../../../../packages/core/session) 是内存中的仅追加日志，不是 [`packages/session/`](../../../../packages/session/README.zh.md) 那组持久化族。`Session.append` 提交一条持久事件并通知 `session/event`。`deriveMessages()` 从 surface 投影模型历史；`assistant/chunk` 保留回放和 UI 保真。新增模型可见输入需要新的 `SessionEventMap` 成员。事件名称见生成的[持久化目录](../../../persistence-catalog.zh.md)。

### `core/system-prompt`

[`packages/core/system-prompt`](../../../../packages/core/system-prompt) 在每个步骤组装一次段、变量和工具 schema。这就是第 7 章中 `@deepseek-ai/dsh-tools` 注入 `systemPrompt` 的原因。`preStep()` 在 `agent/pre-step` 之前调用 `assemble()`。

### `core/tools`

[`packages/core/tools`](../../../../packages/core/tools) 就是你用 `greet` 用过的注册表。`defineTool({ execute })` 是工具本体。`ctx.tools.execute(...)` 是流水线：`tools/pre-execute` → `guard()` → `tools/execute` → 本体 → `tools/post-execute` → `finalizeContent` → 实时 `tools/result`。循环随后追加持久的 `tool/result`。这两个名字是不同事件；[工具流水线图与详解](../../../tool-execution-pipeline.zh.md#reading-the-pipeline)给出顺序。

### `core/agent` 与 `core/agent-loop`

[`dsh-agent`](../../../../packages/core/agent/README.zh.md) 拥有 `Agent` 句柄、注册表和 `agent/*` 事件名。[`dsh-agent-loop`](../../../../packages/core/agent-loop/README.zh.md) 是默认驱动器。UI、ACP（Agent Client Protocol）和钩子面向 `ctx.agents` 编程，因此驱动器可以替换。

### `llm`

[`dsh-llm`](../../../../packages/llm/llm) 声明 `ctx.llm` 和 `llm/stream` waterfall。[`dsh-llm-deepseek`](../../../../packages/llm/llm-deepseek) 是其中一个适配器。`step()` 调用 `preparedCall?.stream(request) ?? this.loopCtx.llm.stream(request)`；循环本身并不 `fetch` 提供方。凭据通过 credentials 服务解析，而不是写在 `cordis.yml` 里。

## 组合

[`dsh --profile headless`](../../../../packages/bundle/headless/README.zh.md) 先叠 [`dsh-base`](../../../../packages/bundle/base/cordis.patch.yml)，再叠 [`dsh-headless`](../../../../packages/bundle/headless/cordis.patch.yml)。base patch 插入共享产品树：会话存储、工具、agent loop（智能体循环）、bash 消费方等。headless patch 重述其中若干行，并插入一次性运行器。

导出扁平后的配置树：

```sh
pnpm dsh --profile headless --dump-config
```

把打印出的行按 Definition / Provider / Consumer 分组，而不是按文件顺序。[三层角色教程](index.zh.md)以 Bash 为样板；[能力图](../../../capability-seams.zh.md)列出内置族。profile 叠加见 [architecture.zh.md](../../../architecture.zh.md#cordis) 和 [app-boot](../../../../packages/boot/app-boot/README.zh.md#profiles)。

`packages/session/` 这一组——持久化、投影、标题、遥测——消费 `session/event`。等 `append` 和 `deriveMessages()` 清楚后再读。

## 练习

**A. 摊平组合（无需 API 密钥）。** 运行 `--dump-config`，把打印出的每个 id 标到 [architecture.zh.md](../../../architecture.zh.md) 的核心包表上。找出哪些行来自 `dsh-base`，哪些由 headless patch 重述或插入。

**B. 让模型调用 `greet`。** 去掉第 7 章工具里自行调用 `ctx.tools.execute` 的代码块，再按[第一个 Harness 插件](../basic/index.zh.md)或 headless 组合的副本加载它，步骤见[开发一个工具](../basic/tool.zh.md)。

**C. 观察循环，不改循环。** 挂载一个注入 `agents` 并用 `next()` 包装 `agent/pre-step` 的插件。跑一轮 headless 或 Web 轮次，打印 `payload.turn`、`payload.step` 和 `payload.messages.length`。再监听 `session/event` 并打印 `event.type`。你应看到实时事件和持久事件是两条序列。

```ts ignore-check
import type { Context } from '@deepseek-ai/cordis'

export const name = 'turn-observer'
export const inject = ['agents']

export function apply(ctx: Context) {
  ctx.on('agent/pre-step', async (payload, next) => {
    console.log('pre-step', payload.turn, payload.step, payload.messages.length)
    return next()
  })
}
```

**D. 打开 Bash seam。** 阅读 `packages/shell/shell`、`packages/shell/bash-local` 和 `packages/shell/tool-bash`。工具注入 `'shell'`，并不 import 本地提供方。

**E. 持久化族。** 完成 A–C 后，阅读 [packages/session/README.zh.md](../../../../packages/session/README.zh.md)，并顺着 `session/event` 走到 `session-persistence`。headless JSONL 根目录是 `./.sessions`。

## 如何打开一个陌生包

1. 先读组 README，再读包 README 的第一节、`ctx` 键和 `inject` 列表。
2. 打开 `src/index.ts`，列出 `apply` 或 `Service` 构造函数注册了什么。
3. 在 [event-producer-consumer.zh.md](../../../event-producer-consumer.zh.md) 中搜索该包名。
4. 只有在需要 README 所链出的设计理由时，才打开 Agent Note。

| 问题 | 归属 |
|---|---|
| 控制流走向哪里？新代码挂在哪里？ | [architecture.zh.md](../../../architecture.zh.md) |
| 这个包对外承诺什么？ | 包 `README.zh.md` |
| 事件与服务的准确签名 | [子系统](../../../subsystems/README.zh.md) 的 `cordis-surface` |
| 谁生产、谁消费？ | [event-producer-consumer.zh.md](../../../event-producer-consumer.zh.md) |
| 为什么这样设计？ | `.agents/notes/implemented/` |
| 如何添加工具、包或适配器？ | [cookbook](../../../cookbook/extension-cookbook.zh.md) |

## 先不要碰的内容

在轮次路径变熟练之前，先放下这些：Web 的 Conversation 节点和设置卡片；ACP 和 JSON-RPC SDK（它们驱动 `ctx.agents`，并不是循环本身）；Agent Teams、workflow 和 Ralph；Code Mode 与压缩内部实现；native landlock 和 E2B；以及 `vendor/`（除非你在改 Cordis 本身）。

[扩展实操手册](../../../cookbook/extension-cookbook.zh.md) 把功能映射到挂载点。在你已经知道要添加哪项能力时再使用它。
