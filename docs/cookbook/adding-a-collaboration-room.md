---
description: "Implement the proposed multi-human collaboration room as experimental plugins: non-surface peer chat on a shared Session, per-user fork, and publish of selected results."
---

# Cookbook: adding a collaboration room

English | [中文](adding-a-collaboration-room.zh.md)

## Summary

Use this tutorial to add an experimental collaboration room on existing Session, Agent, Remote, and Conversation APIs without changing `agent-loop`. Readers start from a contributor checkout that already runs Web. The outcome is overlay plugins: people chat on one room Session, each model call forks a child, and approved answers are copied back as room events. The packages named below are not in the checkout until a later change adds them; this page is the implementation path for the [collaboration-room Agent Note](../../.agents/notes/proposed/feature/2026-10-12-collaboration-room-fork-publish.md).

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

```421:422:packages/core/agent-loop/src/agent.ts
          this.session.append('user/message', message, { surfaceOp: 'append' })
```

`Session.append` requires `surfaceOp` only for surface event types. Non-surface types such as `turn/start` cannot take that argument, so a `collaboration/*` event stays off `deriveMessages()`:

```842:847:packages/core/session/src/index.ts
   * Derive the LLM message history by walking the ordered sequences of
   * message-producing events maintained by `surfaceOp` markers. The
   * surface is the single source of derived history: every message-producing
   * append records its `surfaceOp`, so a raw event with no marker (a chunk, a
   * turn boundary) is correctly absent
```

`ctx.sessions.fork` copies an inclusive prefix, stamps `parentSession` / `isSeeded`, and counts only the copied events in `inheritedEventCount`. It does not merge later child appends back to the source:

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

Copied `collaboration/*` events still lack `surfaceOp`, so the child Agent still cannot see them through `deriveMessages()`. `openBranch` must compile those events into one `UserMessage` and call `Agent.followup` on the child. Agent Teams already stores non-surface plugin events this way: declaration merge in `packages/experimental/agent-team/src/types.ts`, append-without-surface in `TeamJournal.appendAndFlush`, and opt-in overlay rows in `packages/experimental/agent-team-profile/cordis.patch.yml`.

-----

<a id="scaffold"></a>
## 1. Scaffold the Host package

Create `packages/experimental/collaboration/` from the Agent Teams layout: `package.json` name `@deepseek-ai/dsh-experimental-collaboration`, omit `private`, set `publishConfig.access: public`, and keep `@deepseek-ai/cordis` in both `peerDependencies` and `devDependencies`. Add a `{ "path": "./packages/experimental/collaboration" }` reference in `tsconfig.host.json` next to `agent-team`. Suggested modules: `src/types.ts` (`SessionEventMap` merge), `src/journal.ts`, `src/projection.ts`, `src/compiler.ts`, `src/branches.ts`, `src/index.ts` (`ctx.collaboration`). Follow [adding a package](adding-a-package.md) for `tsconfig.json`, `tsdown.config.ts`, locale files, and the README pair.

-----

<a id="tests"></a>
## 2. Fail the tests, then implement

Write `tests/message.spec.ts` before the journal: two `postMessage` calls produce two `collaboration/message` events; the projection lists author and text; the room Agent does not start a turn. Write `tests/branch.spec.ts` before `openBranch` / `publish`: the child has `inheritedEventCount > 0`; the first child task contains compiled chat with author names; an existing `prompt` on the child yields assistant text; `publish` writes `collaboration/branch-published` with that text; a second `openBranch` compiles the published text. Implement `postMessage` as append-and-flush with no `followup`. Implement `openBranch` as `sessions.fork` plus compiler plus child `followup`. Implement `publish` as a content copy onto the room, not a JSONL merge.

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
pnpm --silent run persistence-changes --record 2026-10-12-collaboration-room-events --prose .artifacts/persistence-change.prose.json
```

Use the date of the recording change if it is not 2026-10-12. Do not land SessionEventMap keys without this acknowledgement.

-----

<a id="package-checks"></a>
## 4. Package checks

Run only the new package until the Host tests are green:

```sh
pnpm exec vitest run packages/experimental/collaboration/tests
pnpm exec tsc -b packages/experimental/collaboration --pretty false
```

`test:coverage` requires 100% on `packages/*/*/src`. Cover journal, compiler, and branch paths in the same change. Do not run the full repository suite for this isolated package.

-----

<a id="remote"></a>
## 5. Remote

Add `packages/experimental/api-collaboration` as a `TypertRemoteService` with `namespace: 'collaboration'`. Expose `postMessage`, `openBranch`, `publish`, and `discard` with `@Remote`, `signal: AbortSignal` last, and `RemoteError` codes in this package. Follow [adding a Remote API](adding-a-remote-api.md). Mount the contribution from an overlay, not from the default Web remotes list.

-----

<a id="client-ui"></a>
## 6. Client UI

Add `packages/experimental/client-ui-collaboration`. Register conversation event types for `collaboration/*` and contribute Chat nodes for peer lines and published-result cards. Add Composer actions for room chat versus fork, and a child-session action for publish. Keep copy in locale dictionaries and `t()`. Do not edit `ui-conversation` core paths; inject through existing slots. See the [Conversation subsystem](../subsystems/conversation.md) and [Agent Teams client UI](../../packages/experimental/client-ui-agent-team/README.md).

-----

<a id="overlay"></a>
## 7. Overlay profile

Add `packages/experimental/collaboration-profile/cordis.patch.yml` that inserts the three plugins after the Web base, with a Config actor allowlist. Mirror the insert style in `packages/experimental/agent-team-profile/cordis.patch.yml`. After the overlay exists, the intended launch is:

```sh
pnpm dsh web --patch packages/experimental/collaboration-profile/cordis.patch.yml
```

That command fails until step 7's files exist. Isolation checks must still reject default Web loading these rows.

-----

<a id="manual"></a>
## 8. Manual verification

With two browsers on the overlay Web:

1. Actor A posts a room message; actor B sees it on the same Session follow stream; the room log has no new `turn/start`.
2. Actor A forks, talks to a model in the child through the ordinary Composer, then publishes.
3. Actor B sees the published card on the room; B's next fork compiles A's chat and the published text into the child task.
4. Open the room `session.v4.jsonl` and confirm it holds `collaboration/*` events, not the child's tool calls.

Split implementation across PRs in that order: Host messages, Host branches, persistence acknowledgement, Remote, UI and overlay.

-----

<a id="further-exploration"></a>
## Further Exploration

- [Collaboration-room Agent Note](../../.agents/notes/proposed/feature/2026-10-12-collaboration-room-fork-publish.md) — why fork-and-publish, and which alternatives lost.
- [Interactive side sessions](../../.agents/notes/proposed/feature/2026-07-08-interactive-side-sessions.md) — one-user advisor fork with `context/message` merge-back.
- [Adding a package](adding-a-package.md) — file checklist for a new workspace package.
- [Reviewing persistence-type changes](reviewing-persistence-type-changes.md) — how to record SessionEventMap keys.
- [Agent Teams package](../../packages/experimental/agent-team/README.md) — the non-surface event and overlay pattern this work copies.

-----

<a id="dev-note"></a>
## Dev Note

The collaboration packages, overlay, and persistence record named in this cookbook are not in the tree at the time of writing. Commands in steps 4, 7, and 8 become executable only after the corresponding files exist. This page is not a product promise and is not on the documentation website.
