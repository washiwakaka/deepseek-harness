---
description: "Show collaboration-room chat rows, a header badge, and a composer button that posts to the room."
kind: "package-reference"
---

# @deepseek-ai/dsh-experimental-client-ui-collaboration

English | [中文](README.zh.md)

## Summary

This package is the Web presentation for the collaboration room. It adds a header badge so you can see the overlay loaded, Chat rows for durable `collaboration/message` events, a composer `@` group for Config AI occupants, and a compact composer button that posts the draft through `collaboration.postMessage`. Enter and the ordinary Send button still use the Session prompt.

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

Mount it from [`@deepseek-ai/dsh-experimental-collaboration-profile`](../collaboration-profile/README.md). The Web Client loader mounts the `/client` export; the Host export is inert.

Restart after adding the overlay row:

```sh
pnpm dsh web --patch packages/experimental/collaboration-profile/cordis.patch.yml
```

Left of the session title, the conversation header shows Collaboration room, a test-human select, and occupant names from `listActors`. The control stays visible with no Session and on a blank Session. Switching Alice/Bob filters the sidebar and restores that human's last Session: a Session Alice created stays hidden from Bob until Alice `@`s Bob and posts; Bob with no Session of their own sees an empty main panel until they create one. Then Bob can open it, fork, and post. Existing `collaboration/message` events render as named rows with four bubble fills: Send/`user/message` keeps the Chat bubble token, the selected human’s room posts use the overlay fill, other humans use the warn tint, and AI room posts use the success tint. Assistant replies from Send stay the Chat default on the left. The composer tool row, left of Send, has Post to room and Send with room. Post to room posts as the selected Host human and does not follow up. Send with room calls `sendWithRoom` when the draft has no model chips, so the Host admits the uncompiled room transcript then followups the room Agent. Model chips and other-human chips in the draft become `mentions` on Post to room and Send with room; a human mention invites that occupant. Composer `@` lists other humans then Settings models this human may use, searchable by name, then sessions, then files and folders. `@` opens after whitespace anywhere in the draft. Picking a person or a model inserts a chip for the next Post to room. AI room rows show which model wrote the answer. @ a model opens that model's branch Session, titled `{model} · {room}` beside the room; the answer stays there until Push to room copies the latest assistant text onto the room. Send with room and a mention post show Chat’s Deep diving shimmer while the Remote call is in flight; an invoked AI also keeps a thinking Chat row from `collaboration/actor-invoked` until that model’s room line arrives. Enter and Send still follow up the room Agent with no extra room context.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The Client export mounts the generated collaboration Remote, then registers locale dictionaries, an `@` source named `models` at `order: -10`, the `conversation.header.leading` test-human switch, keyed Chat renderers, and a `conversation.input.right` control through Cordis effects. The header badge loads occupants from `listActors` into an `ActorRosterStore` that holds the selected test human, and the select calls `selectHuman`. `uiWorkspace.filterSessions` keeps the sidebar to rooms whose projected `occupants` include that human, plus those rooms' branches. Switching humans treats the next human as a fresh view: it restores that human's last Session or calls `clearSession` when they have none, and does not keep the previous human's conversation. Blank Sessions the selected human opens are `claimRoom`ed as creator-only. `@` candidates load other humans from `listActors` and Settings models from `listMentionModels` for that human. The Conversation Definitions match `collaboration/message` and `collaboration/actor-invoked`. A message builds a `collaboration-message` Chat node that includes `actorId` so the row can sit against the selected test human. An invoke builds a `collaboration-thinking` Chat node until that AI posts a room line. Post to room reads the session `useInput` draft and mention chips, calls `postMessage` with the selected human and those mention ids, and clears the draft after a successful post. Send with room calls `postMessage` with the same mentions when the draft names a model or another human; otherwise it calls `sendWithRoom`. Either button sets the roster `thinking` flag for the composer-dock Deep diving row while the Remote call is in flight. Disposing the plugin fiber removes every registration and the Remote mount.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Collaboration overlay](../collaboration-profile/README.md)
- [Collaboration Host](../collaboration/README.md)
- [Collaboration Remote](../api-collaboration/README.md)
- [Adding a collaboration room](../../../docs/cookbook/adding-a-collaboration-room.md)
- [Experimental packages](../README.md)

-----

<a id="model-experience"></a>
## Model Experience

None. Unmentioned room posts are non-surface `collaboration/message` events. Send with room logs them as `collaboration-room-context` then followups the room Agent.

#### KV Cache effect

No direct effect; Host mention compile owns later model-visible use.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- Enter and Send still follow up the room Agent.
- Occupant switching is overlay identity for this ACL, not Host-authenticated login.
- Composer `@` still lists sessions and files after people and models. Enter and Send ignore model chips.
- The header badge is a load marker, not a roster panel.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

This Dev Note is working context for maintainers and is explicitly non-authoritative.

This package posts through `ctx.remote.collaboration.postMessage` and sends drafts through `sendWithRoom`.

</details>
