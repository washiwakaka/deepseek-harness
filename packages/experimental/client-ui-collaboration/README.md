---
description: "Show collaboration-room chat rows, a header badge, and a composer button that posts to the room."
kind: "package-reference"
---

# @deepseek-ai/dsh-experimental-client-ui-collaboration

English | [中文](README.zh.md)

## Summary

This package is the Web presentation for the collaboration room: a header badge showing the overlay loaded, Chat rows for durable `collaboration/message` events, a composer `@` group for Config AI occupants, and a compact button that posts the draft through `collaboration.postMessage`. Enter and the ordinary Send button still use the Session prompt, except that a draft carrying mention chips routes to `collaboration.postMessage` instead, so mentioned models and humans are never silently dropped. Inside a mention branch, a Send carrying model chips routes to `collaboration.postBranchMessage`, waking those models in sub-branches so the owner can cross-check them in place.

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

Enable the collaboration-profile bundle, then restart:

```sh
dsh plugin --profile web add @deepseek-ai/dsh-experimental-collaboration-profile
```

Left of the session title, the conversation header shows Collaboration room and occupant names from `listActors`. Sign-in is the identity sidebar chip, not this badge. The control stays visible with no Session and on a blank Session. Signing in as another registered human restores that human's last Session: Host ACL hides Alice's room from Bob until Alice `@`s Bob and posts; an admin lists every Session and does not write rooms they do not occupy; Bob with no Session of their own sees an empty main panel until they create one. Then Bob can open it, fork, and post. Leftover empty rooms stay off the list until someone calls `claimRoom`. When the collaboration projection for the open Session is loaded, the header badge also lists that room's actual occupants; the creator can remove another occupant from that list, and an occupant can leave (the creator only once nobody else remains). Existing `collaboration/message` events render as named rows with four bubble fills: Send/`user/message` keeps the Chat bubble token, the selected human’s room posts use the overlay fill, other humans use the warn tint, and AI room posts use the success tint. Assistant replies from Send stay the Chat default on the left. The composer tool row, left of Send, has Post to room and Send with room. Post to room posts as the selected Host human and does not follow up. Send with room calls `sendWithRoom` when the draft has no model chips, so the Host admits the uncompiled room transcript then followups the room Agent. Model chips and other-human chips in the draft become `mentions` on Post to room and Send with room; a human mention invites that occupant. Composer `@` lists other humans then Settings models this human may use, searchable by name, then sessions, then files and folders. `@` opens after whitespace anywhere in the draft. Picking a person or a model inserts a chip for the next Post to room. AI room rows show which model wrote the answer. @ a model keeps you on the room Session; the sidebar nests that model's branch, titled `{model} · {room}`, under the room for the mentioning human only. That human publishes from the branch when they want the latest assistant text on the room. Send with room and a mention post show Chat’s Deep diving shimmer while the Remote call is in flight. Enter and Send still follow up the room Agent with no extra room context, unless the draft carries room mention chips, in which case it is posted to the room and the mentioned models start on their branches.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The Client export mounts the generated collaboration Remote, then registers locale dictionaries, an `@` source named `models` at `order: -10`, the `conversation.header.leading` badge, keyed Chat renderers, a `conversation.input.right` control, and a `sidebar.session.row.trailing` users mark that tells a room's sidebar row from ordinary Sessions and branches, through Cordis effects. The header badge loads occupants from `listActors` into an `ActorRosterStore`. When `ctx.identitySession` is present, it follows that signed-in account instead of the Config human switch. Session visibility is Host ACL, not a Client sidebar filter. Switching humans treats the next human as a fresh view: it restores that human's last Session or calls `clearSession` when they have none, and does not keep the previous human's conversation. `isOwnedBranch` still gates Post to room on a mention branch. `@` candidates load other humans from `listActors` and Settings models from `listMentionModels` for that human. The Conversation Definitions match `collaboration/message` and `collaboration/actor-invoked`. A message builds a `collaboration-message` Chat node that includes `actorId` so the row can sit against the selected test human. An invoke starts a room thinking row that stays until that AI's published room line arrives; the work itself stays on the branch until Push to room. Push to room is also offered after a page reload: the button asks the Host (`collaboration/branchInfo`) whether the open Session is a branch instead of relying only on this Client's memory. Post to room reads the session `useInput` draft and mention chips, calls `postMessage` with the selected human and those mention ids, and clears the draft after a successful post. The `conversation/before-send` route applies the same split to the ordinary Send: mention chips in a room become a `postMessage`, and model chips inside a branch become a `postBranchMessage` that opens sub-branches; `isNestedBranch` switches the publish labels to the parent branch when the open Session is itself a sub-branch. Send with room calls `postMessage` with the same mentions when the draft names a model or another human; otherwise it calls `sendWithRoom`. Either button sets the roster `thinking` flag for the composer-dock Deep diving row while the Remote call is in flight. Disposing the plugin fiber removes every registration and the Remote mount.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Collaboration room bundle](../collaboration-profile/README.md)
- [Collaboration Host](../collaboration/README.md)
- [Collaboration Remote](../api-collaboration/README.md)
- [Adding a collaboration room](../../../docs/cookbook/adding-a-collaboration-room.md)
- [Experimental packages](../README.md)

-----

<a id="model-experience"></a>
## Model Experience

None, as unmentioned room posts stay off Agents; Host mention compile owns later model-visible text.

#### KV Cache effect

No direct effect; Host mention compile owns later model-visible use.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- Sign-in UI lives on `client-ui-identity`; this badge only shows the signed-in name when that session is present.
- Composer `@` still lists sessions and files after people and models.
- The header badge lists room occupants only when the collaboration projection for the open Session has loaded; it is not a full roster panel.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

This Dev Note is working context for maintainers and is explicitly non-authoritative.

This package posts through `ctx.remote.collaboration.postMessage` and sends drafts through `sendWithRoom`.

</details>
