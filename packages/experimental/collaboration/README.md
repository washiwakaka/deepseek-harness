---
description: "Share a room among humans and @-mention configured AI occupants, each with its own persistent child context."
kind: "package-reference"
---

# @deepseek-ai/dsh-experimental-collaboration

English | [中文](README.zh.md)

## Summary

`dsh-experimental-collaboration` lets several humans talk in one Session and @ a configured AI occupant to start that model. Unmentioned lines stay off every Agent. The first @ copies the room prefix into that AI's child and compiles room posts plus the room Agent's user and assistant turns; a later @ of the same AI sends only the uncompiled delta. The AI works on that branch; the mentioning human calls `publishFromChild` when they want that conclusion on the room. The sidebar nests the branch under the room. Mount it from the collaboration-profile bundle, not from the default Web app.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Mount the plugin with a Config roster of humans and AI occupants, or mount `@deepseek-ai/dsh-experimental-identity` with empty `actors` so humans register there. Call `ctx.collaboration.postMessage(session, { actorId, text, mentions })`. Omit `mentions` for ordinary chat. Name AI ids to start those children. Name a human id to invite that occupant; until then the room is creator-only. The first @ of a model names the branch `{model} · {room title}`, stamps `parentSession` to the room (never `origin: 'subagent'`), and the sidebar groups that branch under the room for the mentioning human only. The mentioning human publishes from the branch when they want that reply on the room. The same room reuses that child on a later @ of the same model by the same human; another occupant @-mentioning the same model opens a private child. A different room always opens a new child. After a process restart, the next @ cold-resumes the persisted child.

### When to choose it

Choose it for a shared room whose occupants include named models addressed by @. Agent Teams is for automated teammates and tools. LiveShare is for one Session shared with a remote viewer.

### Smallest working setup

<a id="smallest-working-setup"></a>

Durable session storage plus this plugin. Omit `actors` to use the Host demo roster; Clients call `listActors` and `listMentionModels`:

```yaml
- name: '@deepseek-ai/dsh-session-persistence-jsonl'
- name: '@deepseek-ai/dsh-experimental-collaboration'
```

| Field | Default | Meaning |
|---|---|---|
| `actors` | Alice (`core`) and Bob–James (`guest`); empty `providers` and `models` means every connected Settings model | Human authors and optional Config AI occupants. Omit to use the Host default of ten overlay humans. Empty is valid when `ctx.identity` supplies humans. Humans may set `group`, `providers`, and `models`. Identity occupancy uses the active business line only. `@` models come from `listMentionModels`, not Config AI occupants |
| `maxMessageBytes` | `65,536` | Maximum UTF-8 bytes in one room message |
| `maxCompileBytes` | `32,768` | Maximum UTF-8 bytes in one compiled mention task or room-Agent context delta; older room lines drop out of the compiled copy (never the durable log) behind an omission marker |

The generated [configuration catalog](../../../docs/config-catalog.md#deepseek-aidsh-experimental-collaboration) is the exhaustive source for every accepted field and its JSDoc.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The first human who posts or `claimRoom`s becomes the creator. When identity is loaded, a signed-in root Agent start writes that account as creator before `session/create` returns. Later humans cannot post, publish, or send until a current occupant `@`s them. Room lines are non-surface `collaboration/message` events. They never join `deriveMessages()` on the room Session, so posting does not start a room turn. Before each room-Agent step (`agent/pre-step`), any uncompiled room delta is prepended as a `collaboration-room-context` user message, so both ordinary Send and `sendWithRoom` include recent room lines. `admitRoomContext` logs that delta explicitly without followup. A mention dispatcher reads structured `mentions`, creates one child per mentioning human and AI occupant with `agents.create` and `buildForkSeed` (or `agents.resume` when the projection already stores that child's id), compiles a per-actor transcript of room posts and room-Agent user/assistant turns (inherited seed events stay off the child's `deriveMessages()`), and `followup`s that child. `collaboration/actor-invoked` stores the compiled-through seq so a later @ of the same AI sends only the uncompiled delta. The child's tool events stay on the child log. The room journal releases after that invoke is flushed. The mentioning human calls `publishFromChild` to copy the latest assistant text onto the room, or names an `assistantSeq` to copy an earlier reply; publishing cold-resumes the room Agent when it is not live, and publishing the same branch reply twice is refused. A later `publishFromChild` copies a newer branch reply. When one mentioned branch fails to start, the room line stays durable and the post returns that occupant in `failedActorIds` instead of failing the whole post. Only a root Session (no `parentSession`) can be claimed as a room; branch and subagent Sessions refuse room posts even though their projection folds the inherited occupants. An occupant may `leaveRoom` (the creator only once nobody else remains), and the creator may `removeOccupant` another occupant; both append `collaboration/occupant-removed`.

Source map: `src/types.ts` events, `src/projection.ts` fold, `src/compiler.ts` transcript, `src/journal.ts` queue, `src/index.ts` service.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Collaboration-room Agent Note](../../../.agents/notes/proposed/feature/2026-10-12-collaboration-room-fork-publish.md) — non-surface room events and per-actor compile.
- [Branches, publish, and ACL](../../../.agents/notes/proposed/feature/2026-10-29-collaboration-branch-publish.md) — answers stay on the branch until publish.
- [Adding a collaboration room](../../../docs/cookbook/adding-a-collaboration-room.md) — bundle install and Client `@` models.
- [Experimental packages](../README.md) — isolation and naming.
- [Agent Teams](../../team/agent-team/README.md) — automated teammates, not this room.
- [LiveShare](../liveshare/README.md) — remote sharing of one Session.

-----

<a id="model-experience"></a>
## Model Experience

### Mention task

#### What the model sees

The mentioned AI receives one user-role message. The text starts with a fixed instruction naming that occupant (`{name}` is the Config display name), then labeled `[name] text` lines for room posts from other occupants and the room Agent's user and assistant turns through the mention, skipping that AI's own published replies.

##### Mention instruction

```markdown
You are {name} in a shared room. Use the room conversation below. Answer as yourself.
```

#### Token effect

The first @ of an occupant adds every prior room-visible line except that occupant's own replies, plus the room Agent conversation in that window. Each later @ of the same occupant adds only lines after its watermark plus the new mention. Another occupant's first @ still receives the full room-visible transcript.

#### KV Cache effect

The child's own prior turns remain a reusable prefix. Each later @ appends one new user message after that prefix. A different occupant's child starts a separate history.

### Room context

#### What the model sees

When the Client admits room context, the room Agent receives one user-role message. The text starts with a fixed instruction, then labeled `[name] text` lines for the uncompiled delta.

##### Room context instruction

```markdown
Shared room transcript.
```

#### Token effect

Each admit adds only room-visible lines after the previous watermark. An admit with no new lines writes nothing.

#### KV Cache effect

The admitted message stays on the room log. The following Send is a separate user message, so later turns reuse the admitted prefix.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

These limits describe what the room cannot do yet.

- **Signed-in identity posts** — when `ctx.identity` is loaded, room posts require that Host's signed-in account. Sign-in lives on the identity plugin, not this package.
- **Live occupancy ACL** — `remoteAccess` policy `local-identity` filters Session list/open/events from occupancy — live, or replayed from the persisted log at startup. Occupants write their rooms and own branches. The first occupant is the creator and receives every session-scoped Host action on that room and their own branches, regardless of role or granted capabilities. A human who opens a branch receives every session-scoped Host action on that branch even when they are only an invited occupant of the room. Occupants may toggle Agent Teams, pin, and archive on those Sessions. Admins read every Session and do not write others' rooms. `session/create` is a workspace-resource call: the policy binds every listed Workspace so a signed-in account can create Sessions there. Accounts granted the Workspace capability (and seed admins) receive every workspace-scoped Host action on those Workspaces; other admins may add, rename, and delete. Creation stamps the creator before it returns. Leftover empty rooms stay off ordinary members' lists and expose `claimRoom` plus the first room post; an admin read binding does not swallow those actions. Sessions whose occupancy is unknown, and non-root Sessions, are never offered a claim binding. At startup the Host replays every persisted Session log into the occupancy cache, so a cold room stays listable and readable by its occupants (and read-only to admins) before anyone resumes it; opening it resumes it on demand.
- **Experimental prototype with no stability promise** — the package is public, but its contracts can change while it incubates.
- **No ambient listening, @all, or AI-to-AI mentions** — only a human `mentions` list starts a child turn.
- **Default Web isolation** — release apps must not depend on this package; load it from the collaboration-profile bundle.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

This Dev Note is working context for maintainers and is explicitly non-authoritative.

The composer submit intercept ships as the `conversation/before-send` serial event owned by `ui-conversation`: a Send carrying room mention chips becomes `collaboration/postMessage`, and any other Send keeps the ordinary prompt path. Room posts prefer the signed-in identity account when the identity plugin is loaded; the Config roster supplies the occupants otherwise.

</details>
