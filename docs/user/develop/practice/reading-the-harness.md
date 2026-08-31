# Reading the harness

English | [中文](reading-the-harness.zh.md)

This tutorial is a source-reading path after the [Cordis tutorial](../../../cordis-tutorial/index.md). It does not add files under `tmp/`. The outcome is that you can narrate one turn from inbox to model request to tool result, and hang a plugin on the live events that wrap that turn.

## Prerequisites

Finish [Cordis tutorial chapters 1–7](../../../cordis-tutorial/index.md), especially [Into the harness](../../../cordis-tutorial/07-into-the-harness.md). The [first Harness plugin](../basic/index.md) path is useful before the exercises that patch into Web or headless, but you can read the loop without it.

## Outcome

You can do all of the following without looking up the architecture page:

- Point at `kick`, `turn`, `preStep`, and `step` in [`packages/core/agent-loop/src/agent.ts`](../../../../packages/core/agent-loop/src/agent.ts) and say what each appends or dispatches.
- Distinguish durable session events (`turn/start`, `tool/result`) from live extension points (`agent/pre-step`, `tools/result`).
- Map a row in [`examples/headless-agent/cordis.yml`](../../../../examples/headless-agent/cordis.yml) to a `ctx` key, including rows that exist only because [`agent-spine-demo`](../../../../packages/examples/agent-spine-demo/src/index.ts) mounts them.

## Three layers

Harness is three stacked layers. Cordis is the plugin runtime: `inject`, effects, and events, as in chapters 1–6. The product spine is `sessions`, `systemPrompt`, `tools`, `agents`, `agentLoop`, and `llm`. A [capability seam](index.md) is a replaceable Service Definition, Service Provider, and Consumer, commonly a model-facing tool.

Ask of every package: does it drive the loop, provide a replaceable capability, or listen to an extension point? Most packages listen. New behavior attaches to a documented extension point; changing the loop updates [architecture.md](../../../architecture.md).

Anything the model sees must already be in the session log. UI, persistence, fork, and replay project from that append-only log.

## Walk one turn

### Architecture and the lifecycle diagram

Read the turn-flow section of [architecture.md](../../../architecture.md#turn-flow), then the sequence diagram and walkthrough in [agent-lifecycle.md](../../../agent-lifecycle.md#reading-the-sequence). The [durable vs live](../../../agent-lifecycle.md#durable-vs-live) section classifies each name. `agent/pre-step`, `agent/request`, `llm/stream`, and the three `tools/*` waterfalls require `next()`; `agent/turn-stopping` is serial and has no `next()`.

### The event matrix as an index

[event-producer-consumer.md](../../../event-producer-consumer.md) is a lookup table, not a lesson. The producer column names who owns the control flow. The consumer column names which plugins hang off that event. The mode column names how to listen.

Start with these eight: `session/event`, `agent/pre-step`, `agent/request`, `llm/stream`, `system-prompt/assemble`, `tools/pre-execute`, `tools/execute`, `tools/result`. Open the declaration for the payload, then the producer for when it fires.

### `kick`, `turn`, `preStep`, and `step`

The one file to read closely is [`packages/core/agent-loop/src/agent.ts`](../../../../packages/core/agent-loop/src/agent.ts). Skip the package README on the first pass; it is the full driver contract.

| Function | Role |
|---|---|
| `kick()` | Runs `while (await this.turn())` and returns the driver to idle. |
| `turn()` | Appends `turn/start`, runs zero or more steps, then appends `turn/end`. |
| `preStep()` | Claims inbox messages, calls `systemPrompt.assemble`, then the `agent/pre-step` waterfall. |
| `step()` | Builds the model request from `session.deriveMessages()`, streams, then runs tools. |

User input enters the inbox, not the model. `followup`, `steer`, and `inject` on the [Agent handle](../../../../packages/core/agent/README.md) share that inbox and differ in whether they wake the driver. `agent/pre-step` may rewrite or reject the claimed batch; a rejected or empty first claim still closes a durable turn that spent no model call. History sent to the model comes from `session.deriveMessages()`. A step that still owes a model request after tools stays inside the same turn and opens another step. Read that file against the stages in [Reading `agent.ts` against the lifecycle](../../../agent-lifecycle.md#reading-agent-ts).

Then read [`tool-calls.ts`](../../../../packages/core/agent-loop/src/tool-calls.ts) for exclusive barriers versus the bounded parallel pool ([Reading `tool-calls.ts`](../../../tool-execution-pipeline.md#reading-tool-calls)), and [`index.ts`](../../../../packages/core/agent-loop/src/index.ts) for `create` / `resume` / `setFactory`. Loop logic lives in `agent.ts`; the plugin shell that publishes agents lives in `index.ts`.

## The five core packages

For each package, read the opening of its README, the service class in `src/index.ts`, and the generated `cordis-surface` region on its [subsystem page](../../../subsystems/README.md). Do not start from the full README.

### `core/session`

[`packages/core/session`](../../../../packages/core/session) is the in-memory append-only log, not the [`packages/session/`](../../../../packages/session/README.md) persistence family. `Session.append` commits a durable event and notifies `session/event`. `deriveMessages()` projects model history from the surface; `assistant/chunk` keeps replay and UI fidelity. A new model-visible input requires a new `SessionEventMap` member. Event names live in the generated [persistence catalog](../../../persistence-catalog.md).

### `core/system-prompt`

[`packages/core/system-prompt`](../../../../packages/core/system-prompt) assembles sections, variables, and tool schemas once per step. That is why `@deepseek-ai/dsh-tools` injects `systemPrompt`, as in chapter 7. `preStep()` calls `assemble()` before `agent/pre-step`.

### `core/tools`

[`packages/core/tools`](../../../../packages/core/tools) is the registry you used with `greet`. `defineTool({ execute })` is the tool body. `ctx.tools.execute(...)` is the pipeline: `tools/pre-execute` → `guard()` → `tools/execute` → the body → `tools/post-execute` → `finalizeContent` → live `tools/result`. The loop then appends durable `tool/result`. Those two names are different events; the [tool pipeline diagram and walkthrough](../../../tool-execution-pipeline.md#reading-the-pipeline) show the order.

### `core/agent` and `core/agent-loop`

[`dsh-agent`](../../../../packages/core/agent/README.md) owns the `Agent` handle, the registry, and the `agent/*` event names. [`dsh-agent-loop`](../../../../packages/core/agent-loop/README.md) is the default driver. UI, ACP, and hooks program against `ctx.agents` so the driver stays replaceable.

### `llm`

[`dsh-llm`](../../../../packages/llm/llm) declares `ctx.llm` and the `llm/stream` waterfall. [`dsh-llm-deepseek`](../../../../packages/llm/llm-deepseek) is one adapter. `step()` calls `preparedCall?.stream(request) ?? this.loopCtx.llm.stream(request)`; the loop does not `fetch` the provider itself. Credentials resolve through the credentials service, not inline keys in `cordis.yml`.

## Composition

[`examples/headless-agent/cordis.yml`](../../../../examples/headless-agent/cordis.yml) looks short because `@deepseek-ai/dsh-agent-spine-demo` mounts the spine as child plugins: session store, tools, agent loop, bash consumer, and others. The leaf YAML only names replaceable providers and extra consumers: the LLM adapter, bash executor, filesystem, persistence, subagent.

Dump the flattened tree:

```sh
pnpm dsh --profile headless --dump-config
```

Group the printed rows as Definition / Provider / Consumer rather than by file order. The [three-role tutorial](index.md) uses Bash as the template; the [capability graph](../../../capability-seams.md) lists the built-in families. Profile stacking is in [architecture.md](../../../architecture.md#cordis) and [app-boot](../../../../packages/boot/app-boot/README.md#profiles).

The `packages/session/` group — persistence, projection, title, telemetry — consumes `session/event`. Read it after `append` and `deriveMessages()` are clear.

## Exercises

**A. Flatten composition (no API key).** Run `--dump-config` and mark each printed id on the core-package table in [architecture.md](../../../architecture.md). Find which rows come from `agent-spine-demo` rather than the leaf YAML.

**B. Let the model call `greet`.** Remove the self-`ctx.tools.execute` block from chapter 7's tool and load it through [your first Harness plugin](../basic/index.md) or a copy of the headless composition, following [Build a tool](../basic/tool.md).

**C. Observe without changing the loop.** Mount a plugin that injects `agents` and wraps `agent/pre-step` with `next()`. Run one headless or Web turn and print `payload.turn`, `payload.step`, and `payload.messages.length`. Then listen to `session/event` and print `event.type`. You should see live events and durable events as two sequences.

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

**D. Open the Bash seam.** Read `packages/shell/shell`, `packages/shell/bash-local`, and `packages/shell/tool-bash`. The tool injects `'shell'` and does not import the local provider.

**E. Persistence family.** After A–C, read [packages/session/README.md](../../../../packages/session/README.md) and follow `session/event` to `session-persistence`. The headless JSONL root is `./.sessions`.

## How to open an unfamiliar package

1. Read the group README, then the package README's first section, `ctx` key, and `inject` list.
2. Open `src/index.ts` and list what `apply` or the `Service` constructor registers.
3. Search the package name in [event-producer-consumer.md](../../../event-producer-consumer.md).
4. Open an Agent Note only when you need the rationale a README links.

| Question | Home |
|---|---|
| Where does control flow go? Where does new code attach? | [architecture.md](../../../architecture.md) |
| What does this package promise? | Package `README.md` |
| Exact event and service signatures | [subsystems](../../../subsystems/README.md) `cordis-surface` |
| Who produces and who consumes? | [event-producer-consumer.md](../../../event-producer-consumer.md) |
| Why this design? | `.agents/notes/implemented/` |
| How do I add a tool, package, or adapter? | [cookbook](../../../cookbook/extension-cookbook.md) |

## What to postpone

Leave these until the turn path is fluent: Web conversation nodes and settings cards; ACP and the JSON-RPC SDK (they drive `ctx.agents`, they are not the loop); Agent Teams, workflow, and Ralph; Code Mode and compaction internals; native landlock and E2B; `vendor/` unless you are changing Cordis itself.

The [extension cookbook](../../../cookbook/extension-cookbook.md) maps a feature to an attachment point. Use it when you already know which capability you are adding.
