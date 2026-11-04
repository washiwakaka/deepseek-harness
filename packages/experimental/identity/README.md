---
description: "Local overlay accounts with a password method and a registry for later third-party sign-in."
kind: "package-reference"
---

# @deepseek-ai/dsh-experimental-identity

English | [中文](README.zh.md)

## Summary

`ctx.identity` stores overlay humans as a credentials grant and signs one of them in for the current Remote caller. The password method is built in. Other plugins may `registerMethod` for later OAuth ids. After sign-in, the same account joins independent business lines and sets which Settings models that line may `@`. This is not a DeepSeek account.

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

Mount from the collaboration-profile bundle, not from the default Web app. Call `registerPassword`, then `loginPassword`. `listMethods()` returns `{ id: 'password', kind: 'password' }` until another plugin registers more. Config `lines` seed the Host catalog when the store is empty. Config `admins` stores those usernames as admin when they register; a signed-in admin calls `setAccountAdmin` to promote or demote later accounts. Config admins cannot be demoted. Overlay browsers become `local-identity` Peers; an unsigned list stays empty, and a signed-in admin lists every live Session. A signed-in admin calls `createLine`. The signed-in account calls `joinLine`, `setLineModels`, and `setActiveLine`. Collaboration occupancy uses `occupancyOf` on the active line only: empty `modelIds` means every connected Settings model; no active line uses `IDENTITY_CLOSED_PROVIDER` so `@` catalogs stay empty. Collaboration posts require `currentAccount()` when this service is loaded.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Maintainer details — click to expand</summary>

Passwords are scrypt-hashed into credentials key `identity/local-users`. The grant payload stores `users` (including `role` and per-line `memberships`) and Host-wide `lines`. `registerMethod` fails on duplicate ids and returns a disposer. Credentials may load after this plugin; register and login fail loud until `ctx.credentials` exists. When `ctx.connection` is present, identity registers a browser principal factory so each v3 cookie Peer is `{ kind: 'local-identity', browserSessionId }`. A Remote call binds the signed-in account to `invocation.peer.id`; two Peers can stay signed in as different accounts. Login and logout call `remoteAccess.invalidate` for that Peer. Host-only calls (no invocation) share one process session. Memberships and model allowlists do not union across lines. An admin still occupies rooms through the active line; listing other Sessions does not admit posting into them.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Collaboration room bundle](../collaboration-profile/README.md)
- [GitHub sign-in method](../identity-oauth-github/README.md)

-----

<a id="model-experience"></a>
## Model Experience

None, as accounts never enter model requests.

#### KV Cache effect

No direct effect.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- GitHub is advertised by `@deepseek-ai/dsh-experimental-identity-oauth-github`; authorization is not implemented. Other OAuth providers stay later plugins.
- Cold Sessions that are not live in `ctx.sessions.list()` stay out of the Host occupancy policy until they resume. Session write ACL and create ownership live in the collaboration plugin.
- An admin can list every account, line, and Session, promote later users, and cannot reset another account's password.

-----

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Maintainer details — click to expand</summary>

None.

</details>
