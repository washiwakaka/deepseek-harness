# Agent Note: Collaboration room with per-user fork and publish

Status: proposed

English | [中文](2026-10-12-collaboration-room-fork-publish.zh.md)

## Problem

Several people need one durable room: they talk to each other, each person may call a model from a private branch, and approved model results become persistent room context. Reusing `user/message` for peer chat would wake the room Agent and mix human talk into `deriveMessages()`. Forking a child copies a prefix and then diverges; there is no JSONL merge, and child-owned tool traces must not flood the room log. The [interactive side session](2026-07-08-interactive-side-sessions.md) proposal covers one user exploring from a live session and writing one `context/message` into the parent. It does not name multi-human identity, non-surface room chat, or copying published results as dedicated events.

## Proposal

Ship an experimental collaboration room as overlay plugins. The room Session stores peer chat and published results as non-surface `collaboration/*` events. Each model call forks a child Session from the current room prefix, compiles chat plus published results into one child task message, and runs the ordinary Agent on that child. Publishing copies selected assistant text into a new room event; it does not merge child logs. Do not change `agent-loop`. Phase one authenticates actors from a Config allowlist on the Host; later Host-authenticated identity replaces that list. Default Web, Desktop, and other release apps must not depend on these packages. The [implementation cookbook](../../../../docs/cookbook/adding-a-collaboration-room.md) owns the file-by-file steps.

## Package topology

Four experimental packages, named like Agent Teams, isolated by the [experimental package rules](../../../../packages/experimental/AGENTS.md) and [default-product isolation](../../implemented/process/2026-09-12-default-product-experimental-isolation.md):

| Package directory | npm name | Responsibility |
|---|---|---|
| `experimental/collaboration` | `@deepseek-ai/dsh-experimental-collaboration` | Events, projection, compiler, `ctx.collaboration` |
| `experimental/api-collaboration` | `@deepseek-ai/dsh-experimental-api-collaboration` | Host `@Remote` methods under namespace `collaboration` |
| `experimental/client-ui-collaboration` | `@deepseek-ai/dsh-experimental-client-ui-collaboration` | Chat nodes and fork/publish actions |
| `experimental/collaboration-profile` | `@deepseek-ai/dsh-experimental-collaboration-profile` | `cordis.patch.yml` overlay |

## Durable events

Declaration-merge into `SessionEventMap` the same way Agent Teams does for `team/*`. Room events omit `surfaceOp`, so they never join `deriveMessages()`. Proposed keys: `collaboration/message`, `collaboration/branch-opened`, `collaboration/branch-published`, and optional `collaboration/branch-discarded`. A published event stores the copied content, `childSessionId`, `actorId`, and `baseSeq`. Unknown readers keep the [required-on-read unless `ignorable: true`](../../implemented/architecture/2026-08-10-session-log-version-mechanism.md) rule. Adding these keys is a persistence-type change and needs a [persistence acknowledgement](../../../../docs/cookbook/reviewing-persistence-type-changes.md) in the same change.

## Host operations

`ctx.collaboration.postMessage` appends `collaboration/message` and flushes; it must not call `Agent.followup`. `openBranch` calls `ctx.sessions.fork`, compiles room events through the current seq, activates a child Agent, and `followup`s the compiled task. `publish` reads selected child assistant text and appends `collaboration/branch-published` on the room. `discard` records abandonment without copying content. Child turns use the existing `prompt` / follow path.

## Isolation

Enable the composition only with `--patch` on a profile overlay, following `packages/experimental/agent-team-profile/cordis.patch.yml`. Do not add these packages to `dsh-web-app` dependencies, default Web HTML, or shipped bundles.

## Alternatives considered

**Reuse `user/message` for peer chat.** Rejected because `agent-loop` appends those events with `surfaceOp: 'append'` and they become model history and a new turn.

**Merge child JSONL into the room.** Rejected because fork copies a prefix and then diverges; there is no merge primitive, and child tool traces would pollute the shared log.

**Inject published results as parent `context/message` (side-session merge-back).** Rejected for this product: room chat and published results need distinct client rendering and must stay off the room Agent surface until a child compiler selects them.

**Reuse `ctx.agentTeams`.** Rejected because Agent Teams models automated teammates and tools, not authenticated humans sharing a room.

**Change `agent-loop` or `deriveMessages` to special-case collaboration.** Rejected: new behavior belongs on extension points; the compiler is the explicit resolve step that turns room events into one child task.

**Mount the plugins in the default Web bundle.** Rejected by experimental isolation: the default product graph must not name experimental packages.

## Acceptance criteria

- Two clients on one room Session see peer `collaboration/message` events without a new room `turn/start`.
- `openBranch` creates a child whose `inheritedEventCount` covers the room prefix and whose first child task contains compiled chat and prior published results.
- The child Agent answers through the existing loop; the room log does not receive that child's tool events.
- `publish` copies selected assistant text onto the room as `collaboration/branch-published`.
- A later `openBranch` compiles that published text into the next child task.
- Default Web isolation checks still pass; only an explicit overlay loads the plugins.
- SessionEventMap changes have a persistence acknowledgement in the same change.

## Risks

- Config actor ids are not login. A later identity change must stop trusting Client-supplied names without a Host principal.
- Compiling growing rooms into every child task will pressure context; compaction of collaboration events is out of scope for phase one.
- Concurrent publishes on one room need a journal queue like `TeamJournal.transact`, or last-writer races will reorder events.
- Fork of a compacted room inherits summaries, not replaced turns; the UI should disclose that.
