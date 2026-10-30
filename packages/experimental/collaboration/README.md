---
description: "Share a room among humans and @-mention configured AI occupants, each with its own persistent child context."
kind: "package-reference"
---

# @deepseek-ai/dsh-experimental-collaboration

English | [中文](README.zh.md)

## Summary

`dsh-experimental-collaboration` lets several humans talk in one Session and @ a configured AI occupant to start that model. Unmentioned lines stay off every Agent. The first @ copies the room prefix into that AI's child and compiles room posts plus the room Agent's user and assistant turns; a later @ of the same AI sends only the uncompiled delta. The AI's answer stays on the branch until a human publishes it to the room. Mount it from an overlay, not from the default Web app.

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

Mount the plugin with a Config roster of humans and AI occupants. Call `ctx.collaboration.postMessage(session, { actorId, text, mentions })`. Omit `mentions` for ordinary chat. Name AI ids to start those children. Name a human id to invite that occupant; until then the room is creator-only. The first @ of a model names the branch `{model} · {room title}` and attaches it beside the room in the same Workspace.

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
| `actors` | Alice (`core`, all providers) and Bob (`guest`, `deepseek-official`) | Human authors and optional Config AI occupants. Omit to use the Host default. Humans may set `group` and `providers` (empty providers means every connected Settings provider). `@` models come from `listMentionModels`, not A/B occupants |
| `maxMessageBytes` | `65,536` | Maximum UTF-8 bytes in one room message |

The generated [configuration catalog](../../../docs/config-catalog.md#deepseek-aidsh-experimental-collaboration) is the exhaustive source for every accepted field and its JSDoc.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The first human who posts or `claimRoom`s becomes the creator. Later humans cannot post, publish, or send until a current occupant `@`s them. Room lines are non-surface `collaboration/message` events. They never join `deriveMessages()` on the room Session, so posting does not start a room turn. A room-Agent Send still uses `user/message` and does not read peer chat. `admitRoomContext` logs the uncompiled room delta as a `collaboration-room-context` user message without followup. `sendWithRoom` admits then `followup`s the room Agent with the composer draft so the Client does not submit after a surface `user/message`. A mention dispatcher reads structured `mentions`, creates one child per AI occupant with `agents.create` and `buildForkSeed`, compiles a per-actor transcript of room posts and room-Agent user/assistant turns (inherited seed events stay off the child's `deriveMessages()`), and `followup`s that child. `collaboration/actor-invoked` stores the compiled-through seq so a later @ of the same AI sends only the uncompiled delta. The child's tool events stay on the child log. The room journal releases after that invoke is flushed. The answer stays on the branch. `publishFromChild` copies the latest assistant text onto the room.

Source map: `src/types.ts` events, `src/projection.ts` fold, `src/compiler.ts` transcript, `src/journal.ts` queue, `src/index.ts` service.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Collaboration-room Agent Note](../../../.agents/notes/proposed/feature/2026-10-12-collaboration-room-fork-publish.md) — non-surface room events and per-actor compile.
- [Branches, publish, and ACL](../../../.agents/notes/proposed/feature/2026-10-29-collaboration-branch-publish.md) — answers stay on the branch until publish.
- [Adding a collaboration room](../../../docs/cookbook/adding-a-collaboration-room.md) — overlay launch and Client `@` models.
- [Experimental packages](../README.md) — isolation and naming.
- [Agent Teams](../agent-team/README.md) — automated teammates, not this room.
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

- **Config roster is overlay identity, not Host login** — Alice/Bob switch ids are the room ACL in this overlay; a later Host-authenticated identity would replace that switch.
- **Experimental prototype with no stability promise** — the package is public, but its contracts can change while it incubates.
- **No ambient listening, @all, or AI-to-AI mentions** — only a human `mentions` list starts a child turn.
- **Children stay live in this process** — a restart does not yet cold-resume an AI child from storage.
- **Default Web isolation** — release apps must not depend on this package; load it from an overlay.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

This Dev Note is working context for maintainers and is explicitly non-authoritative.

Composer submit intercept is still on the cookbook path. Room ACL uses Config actor ids: creator-only until `@` another human.

</details>
