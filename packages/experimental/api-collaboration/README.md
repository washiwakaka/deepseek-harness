---
description: "Expose collaboration-room posts and the occupant roster through the authenticated Web Remote."
kind: "package-reference"
---

# @deepseek-ai/dsh-experimental-api-collaboration

English | [中文](README.zh.md)

## Summary

The `collaboration` Remote lets a browser list Config occupants, list Settings models a human may `@`, post a room line, publish a branch answer onto the room, admit uncompiled room context, and send a composer draft with that context. Child mention turns stay on `ctx.collaboration`.

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

Mount with `@deepseek-ai/dsh-experimental-collaboration` and Typert from an overlay, not from the default Web remotes list. `listActors()` returns id, kind, and name. `listMentionModels(actorId, signal)` returns Settings-connected models that human may `@`. `postMessage(agent, { actorId, text, mentions }, signal)` appends on that Agent's Session and returns started branch ids; a human mention invites that occupant. `claimRoom(agent, actorId, signal)` records the creator on an empty room. `publish(agent, actorId, signal)` copies the branch's latest assistant text onto the room. `admitRoomContext(agent, actorId, signal)` logs the uncompiled room delta without followup. `sendWithRoom(agent, text, actorId, signal)` admits then followups the room Agent. Non-occupants receive `collaboration/forbidden`.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The controller maps `CollaborationError` codes onto `RemoteError` codes in this package. Lookup uses the live Agent; the room log is `agent.session`. Mention dispatch and compile remain in the Host collaboration plugin.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Collaboration Host](../collaboration/README.md) — room events and per-actor compile.
- [Adding a Remote API](../../../docs/cookbook/adding-a-remote-api.md) — `@Remote` conventions.
- [Overlay](../collaboration-profile/README.md) — `--patch` launch.
- [Experimental packages](../README.md) — isolation.

-----

<a id="model-experience"></a>
## Model Experience

Indirectly, through `@deepseek-ai/dsh-experimental-collaboration`, which compiles mentioned-AI child tasks.

#### KV Cache effect

No additional effect beyond the Host collaboration child turns.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- The Client still supplies `actorId`; Host login is not yet the authority.
- Chat nodes, `@` models, and Send with room live in `@deepseek-ai/dsh-experimental-client-ui-collaboration`.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

This Dev Note is working context for maintainers and is explicitly non-authoritative.

`pnpm run build:lib` emits `./typert` and `./remote` after signature changes.

</details>
