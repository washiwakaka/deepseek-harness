# Agent Note: Collaboration room with per-user fork and publish

Status: proposed

English | [中文](2026-10-12-collaboration-room-fork-publish.zh.md)

## Problem

Several humans and named AI occupants need one durable room: they talk to each other, a human @-mentions an AI to start that model, and that AI's reply becomes persistent room context. Reusing `user/message` for peer chat would wake a room Agent and mix talk into `deriveMessages()`. Forking a child copies a prefix and then diverges; there is no JSONL merge, and child-owned tool traces must not flood the room log. Resending the whole room on every later @ of the same AI would duplicate what that child's log already holds. The [interactive side session](2026-07-08-interactive-side-sessions.md) proposal covers one user exploring from a live session and writing one `context/message` into the parent. [LiveShare](../../../../packages/experimental/liveshare/README.md) later shipped sharing of one Session with a remote viewer whose prompt is a `user/message`. Neither names multi-human identity, AI occupants, non-surface room chat, or per-actor compiled context.

## Proposal

Selective publish, working branches, and room ACL are specified in [the successor note](2026-10-29-collaboration-branch-publish.md). This note still owns non-surface peer chat, overlay isolation, and the per-actor compiler.

Ship an experimental collaboration room as overlay plugins. The room Session stores peer chat and AI replies as non-surface `collaboration/*` events. Config lists human actors and AI occupants (id, display name, model). A human `collaboration/message` does not start a turn unless it names AI ids in a structured `mentions` field. Each AI occupant has one persistent child Session: the first @ copies the current room prefix through `agents.create` and `buildForkSeed` (the same prefix copy as `sessions.fork`, without `parentSession` or `origin: 'subagent'`); later @ of the same AI is `followup` on that child. The compiler is per-actor: first @ of A compiles every room-visible event through that message; a later @ of A compiles only events after A's watermark; first @ of B compiles the full room-visible transcript, including A's posted reply, not A's child tool traces. When a mentioned child turn completes, append the assistant text to the room as that AI's `collaboration/message`. Do not change `agent-loop`. Phase one authenticates humans from a Config allowlist; later Host-authenticated identity replaces that list. Default Web, Desktop, and other release apps must not depend on these packages. The [implementation cookbook](../../../../docs/cookbook/adding-a-collaboration-room.md) owns the file-by-file steps.

## Package topology

Four experimental packages, named like Agent Teams, isolated by the [experimental package rules](../../../../packages/experimental/AGENTS.md) and [default-product isolation](../../implemented/process/2026-09-12-default-product-experimental-isolation.md):

| Package directory | npm name | Responsibility |
|---|---|---|
| `experimental/collaboration` | `@deepseek-ai/dsh-experimental-collaboration` | Events, projection, per-actor compiler, mention dispatcher, `ctx.collaboration` |
| `experimental/api-collaboration` | `@deepseek-ai/dsh-experimental-api-collaboration` | Host `@Remote` methods under namespace `collaboration` |
| `experimental/client-ui-collaboration` | `@deepseek-ai/dsh-experimental-client-ui-collaboration` | Chat nodes, occupant roster, @ picker |
| `experimental/collaboration-profile` | `@deepseek-ai/dsh-experimental-collaboration-profile` | `cordis.patch.yml` overlay |

## Durable events

Declaration-merge into `SessionEventMap` the same way Agent Teams does for `team/*`. Room events omit `surfaceOp`, so they never join `deriveMessages()`. Proposed keys: `collaboration/message` (humans and AI replies; optional structured `mentions`), `collaboration/branch-opened` (first fork of an AI child), `collaboration/actor-invoked` (`actorId`, `childSessionId`, `throughSeq` watermark), optional `collaboration/branch-published` for a later private-branch path, and optional `collaboration/branch-discarded`. Unknown readers keep the [required-on-read unless `ignorable: true`](../../implemented/architecture/2026-08-10-session-log-version-mechanism.md) rule. Adding these keys is a persistence-type change and needs a [persistence acknowledgement](../../../../docs/cookbook/reviewing-persistence-type-changes.md) in the same change. The watermark is reconstructed from `actor-invoked` events, not from process memory.

## AI occupants and mention context

Room-visible context is human messages plus AI replies that already landed on the room. Child tool calls stay in the child log. The compiled task is a labeled transcript (`[Alice] …`, `[A] …`) plus an instruction that the recipient is that occupant, not a dump of JSONL.

**First @ of A.** Ensure A's child exists (`agents.create` with `buildForkSeed` once). Compile room-visible events in `(start, mentionSeq]`. `followup` that batch on A's child. Append `branch-opened` and `actor-invoked` with `throughSeq = mentionSeq`.

**Later @ of the same A.** Do not fork again. Compile only room-visible events in `(A's last throughSeq, mentionSeq]`. A's child already holds prior compiled batches, A's assistant text, and A's tools. Resending the whole room is unnecessary and would duplicate tokens. If nothing new landed on the room except this mention, the batch is that mention plus any still-uncompiled lines.

**First @ of B after A has spoken.** B has no child memory. Compile the full room-visible transcript through the mention, including A's posted reply. Do not copy A's child JSONL. B then learns that A already answered, without seeing A's tools.

**Unmentioned messages.** Append only. They raise every occupant's pending delta but start no child turn until that occupant is @-mentioned.

**Auto-post.** The @-AI contract is that the answer is in the room. When the child turn completes, `postMessage` as that AI with the assistant text. Manual `publish` stays available for a later private human branch; it is not required for mention turns.

Phase one freezes each AI occupant's model for the life of the room, queues concurrent @ of the same AI on that child, and treats one message that mentions several AIs as parallel invokes against the same room snapshot. Ambient listening (no @), @all, AI-to-AI mentions, and human private branches in the same room stay out of phase one.

## Host operations

`ctx.collaboration.postMessage` appends `collaboration/message` and flushes; it must not `followup` the room Session. A mention dispatcher `ctx.effect` reads `mentions`, and for each AI occupant calls `ensureChild`, compiles the per-actor delta through the new seq, `followup`s the child, and records `actor-invoked`. `ensureChild` calls `ctx.agents.create` with `buildForkSeed` only when that occupant has no child; the child copies cwd and `isSeeded` but does not stamp `parentSession`. Record the first child on `collaboration/branch-opened`. When the child turn completes, append the assistant text as that AI's room message. Optional `publish` / `discard` remain content copy and abandonment for a later private-branch path. Child turns use the existing `prompt` / follow path. Do not set the child's `origin` to `subagent`.

## Isolation

Enable the composition only with `--patch` on a profile overlay, following `packages/experimental/agent-team-profile/cordis.patch.yml`. Do not add these packages to `dsh-web-app` dependencies, default Web HTML, or shipped bundles. Do not enable the room by selecting the LiveShare bundle.

## Alternatives considered

**Reuse `user/message` for peer chat.** Rejected because `agent-loop` appends those events with `surfaceOp: 'append'` and they become model history and a new turn.

**Merge child JSONL into the room.** Rejected because fork copies a prefix and then diverges; there is no merge primitive, and child tool traces would pollute the shared log.

**Inject published results as parent `context/message` (side-session merge-back).** Rejected for this product: room chat and AI replies need distinct client rendering and must stay off the room Agent surface until a child compiler selects them.

**Reuse LiveShare.** Rejected because a viewer's prompt is a `user/message` with a `share-viewer` principal on the source Session and drives that Session's Agent. The room needs peer chat that does not start a room turn.

**Reuse `ctx.agentTeams`.** Rejected because Agent Teams models automated teammates and tools, not a shared room of humans and @-invoked AI occupants.

**Change `agent-loop` or `deriveMessages` to special-case collaboration.** Rejected: new behavior belongs on extension points; the per-actor compiler is the explicit resolve step that turns room events into one child task.

**Mount the plugins in the default Web bundle.** Rejected by experimental isolation: the default product graph must not name experimental packages.

**Resend the whole room on every later @ of the same AI.** Rejected: that occupant's persistent child already holds prior compiles and its own replies; only the uncompiled room delta is new.

**Fork a new child on every @.** Rejected: the second @ of A would drop A's tool memory unless the compiler resent everything; one child per occupant is the resolve step.

**Give B a copy of A's child log.** Rejected: B should see room-visible text only. A's tools are not room context.

## Acceptance criteria

- Two clients on one room Session see peer `collaboration/message` events without a new room `turn/start`.
- An unmentioned human message does not `followup` any AI child.
- The first @ of A forks once, compiles all prior room-visible events, and `followup`s A's child.
- A later @ of A does not fork; the child task contains only the room delta after A's watermark plus this mention.
- The first @ of B compiles the full room-visible transcript including A's posted reply and excludes A's child tool events.
- A's completed mention turn appends a room `collaboration/message` from A; the room log does not receive A's tool events.
- Default Web isolation checks still pass; only an explicit overlay loads the plugins.
- SessionEventMap changes have a persistence acknowledgement in the same change.

## Risks

- Config actor ids are not login. A later identity change must stop trusting Client-supplied names without a Host principal.
- The first @ of a late-joining AI still compiles the whole room-visible log; per-actor compaction is out of scope for phase one.
- Concurrent posts and mention invokes on one room need a journal queue like `TeamJournal.transact`, or last-writer races will reorder events and watermarks.
- Fork of a compacted room inherits summaries, not replaced turns; the UI should disclose that.
- Auto-posted AI text is model output on the shared log; the compiler must label speaker and recipient so a later occupant does not treat another AI's reply as its own prior turn.
