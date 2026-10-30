---
description: "Implement the proposed collaboration room as experimental plugins: non-surface peer chat on a shared Session, named AI occupants invoked by @, per-actor persistent children, and selective publish from the branch."
---

# Cookbook: adding a collaboration room

English | [中文](adding-a-collaboration-room.zh.md)

## Summary

Use this tutorial to add an experimental collaboration room on existing Session, Agent, Remote, and Conversation APIs without changing `agent-loop`. Readers start from a contributor checkout that already runs Web. The outcome is overlay plugins: humans and named AI occupants share one room Session; an unmentioned message stays off every Agent; an @ forks that AI's child once, compiles a per-actor delta, and leaves the answer on the branch until publish. Host, Remote, overlay, and Client UI packages are in the checkout. This page is the implementation path for the [collaboration-room Agent Note](../../.agents/notes/proposed/feature/2026-10-12-collaboration-room-fork-publish.md) and the [branch-publish note](../../.agents/notes/proposed/feature/2026-10-29-collaboration-branch-publish.md).

## Table of Contents

- [Prerequisites](#prerequisites)
- [Owning mechanisms](#owning-seams)
- [1. Scaffold the Host package](#scaffold)
- [2. Fail the tests, then implement](#tests)
- [3. Acknowledge persistence](#persistence)
- [4. Package checks](#package-checks)
- [5. Remote](#remote)
- [6. Client UI](#client-ui)
- [7. Overlay profile](#overlay)
- [8. Manual verification](#manual)
- [Further Exploration](#further-exploration)
- [Dev Note](#dev-note)

-----

<a id="prerequisites"></a>
## Prerequisites

Read the [package checklist](adding-a-package.md), [experimental package rules](../../packages/experimental/AGENTS.md), [experimental status](../../packages/experimental/README.md#status), and [default-product isolation](../../.agents/notes/implemented/process/2026-09-12-default-product-experimental-isolation.md). Do not add these packages to `dsh-web-app` or the default Web HTML. Phase-one actors come from Host Config, not from a Client-supplied display name.

-----

<a id="owning-seams"></a>
## Owning mechanisms

Peer chat must not use `user/message`. The loop admits inbox messages onto the surface and they become model history:

```471:472:packages/core/agent-loop/src/agent.ts
            this.session.append('user/message', message, { surfaceOp: 'append' })
```

`Session.append` requires `surfaceOp` only for surface event types. Non-surface types such as `turn/start` cannot take that argument, so a `collaboration/*` event stays off `deriveMessages()`:

```982:987:packages/core/session/src/index.ts
   * Derive the LLM message history by walking the ordered sequences of
   * message-producing events maintained by `surfaceOp` markers. The
   * surface is the single source of derived history: every message-producing
   * append records its `surfaceOp`, so a raw event with no marker (a chunk, a
   * turn boundary) is correctly absent
```

`ctx.sessions.fork` copies an inclusive prefix, copies cwd, sets `isSeeded`, and counts only the copied events in `inheritedEventCount`. It does not stamp `parentSession` and does not merge later child appends back to the source:

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

Copied `collaboration/*` events still lack `surfaceOp`, so the child Agent still cannot see them through `deriveMessages()`. Inherited room `user/message` and `assistant/message` events are also outside the child's own history. A mention dispatcher must compile room posts and those room-Agent turns into one `UserMessage` per mentioned AI, call `Agent.followup` on that occupant's persistent child, and record `throughSeq` on `collaboration/actor-invoked`. First @ of that AI also `agents.create`s with `buildForkSeed` and writes `collaboration/branch-opened`. Do not set `origin: 'subagent'`. The compiler is per-actor: A's second @ sends only events after A's watermark; B's first @ sends the full room-visible transcript, including A's published reply, never A's child tools. The answer stays on the branch until `publishFromChild` copies latest assistant text onto the room. Agent Teams already stores non-surface plugin events this way: declaration merge in `packages/experimental/agent-team/src/types.ts`, append-without-surface in `TeamJournal.appendAndFlush`, and opt-in overlay rows in `packages/experimental/agent-team-profile/cordis.patch.yml`. LiveShare is not this pattern: a viewer prompt is a source-Session `user/message`.

-----

<a id="scaffold"></a>
## 1. Scaffold the Host package

Create `packages/experimental/collaboration/` from the Agent Teams layout: `package.json` name `@deepseek-ai/dsh-experimental-collaboration`, omit `private`, set `publishConfig.access: public`, and keep `@deepseek-ai/cordis` in both `peerDependencies` and `devDependencies`. Add a `{ "path": "./packages/experimental/collaboration" }` reference in `tsconfig.host.json` next to `agent-team`. Suggested modules: `src/types.ts` (`SessionEventMap` merge), `src/journal.ts`, `src/projection.ts`, `src/compiler.ts`, `src/mentions.ts`, `src/branches.ts`, `src/index.ts` (`ctx.collaboration`). Follow [adding a package](adding-a-package.md) for `tsconfig.json`, `tsdown.config.ts`, locale files, and the README pair.

-----

<a id="tests"></a>
## 2. Fail the tests, then implement

Write `tests/message.spec.ts` before the journal: two unmentioned `postMessage` calls produce two `collaboration/message` events; the projection lists author and text; no room or child `followup` runs. Write `tests/mention.spec.ts` before the dispatcher: first @ of A forks once, compiles prior room-visible lines and room-Agent turns, and `followup`s A's child; a later @ of A does not fork and compiles only the delta after `actor-invoked.throughSeq`; first @ of B compiles the full room-visible transcript including A's published reply and excludes A's tool events. Implement `postMessage` as append-and-flush with no room `followup`. Implement the dispatcher as `ensureChild` plus per-actor compiler plus child `followup` plus `actor-invoked`. Return child Session ids from `postMessage`. Implement `publishFromChild` to copy the latest assistant text as that AI's room message; do not merge child JSONL.

-----

<a id="persistence"></a>
## 3. Acknowledge persistence

`SessionEventMap` declaration merge is a persistence-type change. From the repository root, after the types compile:

```sh
pnpm run gen-persistence-catalog
pnpm --silent run verify-persistence-changes --json
```

Write the bilingual compatibility prose, then record with the [persistence cookbook](reviewing-persistence-type-changes.md):

```sh
pnpm --silent run persistence-changes --record 2026-10-29-collaboration-room-events --prose .artifacts/persistence-change.prose.json
```

Use the date of the recording change if it is not 2026-10-29. Do not land SessionEventMap keys without this acknowledgement.

-----

<a id="package-checks"></a>
## 4. Package checks

Run only the new package until the Host tests are green:

```sh
pnpm exec vitest run packages/experimental/collaboration/tests
pnpm exec tsc -b packages/experimental/collaboration --pretty false
```

`test:coverage` requires 100% on `packages/*/*/src`. Cover journal, compiler, and mention-dispatch paths in the same change. Do not run the full repository suite for this isolated package.

-----

<a id="remote"></a>
## 5. Remote

Add `packages/experimental/api-collaboration` as a `TypertRemoteService` with `namespace: 'collaboration'`. Expose `postMessage` (with structured `mentions`) and `publish` with `@Remote`, `signal: AbortSignal` last, and `RemoteError` codes in this package. Follow [adding a Remote API](adding-a-remote-api.md). Mount the contribution from an overlay, not from the default Web remotes list.

-----

<a id="client-ui"></a>
## 6. Client UI

Add `packages/experimental/client-ui-collaboration`. Register conversation event types for `collaboration/*` and contribute Chat nodes for human lines, AI replies, and the Deep diving row that starts on `collaboration/actor-invoked`. Register an `@` source named `models` at `order: -10` so Settings models list above sessions and files. Put the test-human select on `conversation.header.leading`. Inject compact `conversation.input.right` buttons that post through `collaboration.postMessage` or send through `collaboration.sendWithRoom`, and a composer-dock thinking indicator while those calls are in flight. After a mention post, `openSession` the returned branch ids. On a branch, inject Push to room, which calls `collaboration.publish`. Keep copy in locale dictionaries and `t()`. Do not edit `ui-conversation` core paths; inject through existing slots. See the [Conversation subsystem](../subsystems/conversation.md) and [Agent Teams client UI](../../packages/experimental/client-ui-agent-team/README.md).

-----

<a id="overlay"></a>
## 7. Overlay profile

`packages/experimental/collaboration-profile/cordis.patch.yml` inserts the Host, Remote, and Client UI plugins after the Web base. Occupants come from the Host plugin default roster or an optional Config override; Clients call `listActors`. Enter still uses the ordinary Session prompt. After the overlay exists, the intended launch is:

```sh
pnpm dsh web --patch packages/experimental/collaboration-profile/cordis.patch.yml
```

The overlay loads Host, Remote, and the Client UI header badge, room-message rows, the `@` Settings-model source, and the Post to room composer button. Enter still uses the ordinary Session prompt. Isolation checks must still reject default Web loading these rows. Do not select the LiveShare bundle as a substitute.

-----

<a id="manual"></a>
## 8. Manual verification

With two browsers on the overlay Web:

1. Human Alice posts an unmentioned room message; switching to Bob hides that Session until Alice `@`s Bob; the room log has no new `turn/start` and no child `followup`.
2. Alice @ A; A's child is forked once; the Client opens that branch; the first child task contains compiled room lines through that mention; the room has no new AI line until Push to room.
3. Humans talk further, then Alice @ A again; A does not fork; the new child task is only the delta after A's watermark.
4. Alice @ B; B's first task contains the full room-visible transcript including A's published reply, not A's tool calls.
5. Open the room `session.v4.jsonl` and confirm it holds `collaboration/*` events, including `actor-invoked` watermarks, not child tool calls.

Split implementation across PRs in that order: Host messages, Host mentions and compiler, persistence acknowledgement, Remote, UI and overlay.

-----

<a id="further-exploration"></a>
## Further Exploration

- [Collaboration-room Agent Note](../../.agents/notes/proposed/feature/2026-10-12-collaboration-room-fork-publish.md) — why persistent children and per-actor deltas, and which alternatives lost.
- [Branches, publish, and ACL](../../.agents/notes/proposed/feature/2026-10-29-collaboration-branch-publish.md) — answers stay on the branch until publish; creator-only until `@` a human.
- [Interactive side sessions](../../.agents/notes/proposed/feature/2026-07-08-interactive-side-sessions.md) — one-user advisor fork with `context/message` merge-back.
- [Adding a package](adding-a-package.md) — file checklist for a new workspace package.
- [Reviewing persistence-type changes](reviewing-persistence-type-changes.md) — how to record SessionEventMap keys.
- [Agent Teams package](../../packages/experimental/agent-team/README.md) — the non-surface event and overlay pattern this work copies.
- [LiveShare package](../../packages/experimental/liveshare/README.md) — remote sharing of one Session; not the room model.

-----

<a id="dev-note"></a>
## Dev Note

Host, Remote, overlay, persistence acknowledgement, Chat rows, `@` models, Post to room, open-branch, Push to room, and creator-only ACL until `@` a human are in the tree. Enter still uses the Session prompt. This page is not a product promise and is not on the documentation website. Citations and the LiveShare distinction were checked against `0.2.2-alpha.2`.
