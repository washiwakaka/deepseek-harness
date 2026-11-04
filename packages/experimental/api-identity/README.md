---
description: "Authenticated Remote for overlay register, password sign-in, and account status."
kind: "package-reference"
---

# @deepseek-ai/dsh-experimental-api-identity

English | [中文](README.zh.md)

## Summary

`ctx.identityController` exposes Host identity to the browser. Clients call `status`, `registerPassword`, `loginPassword`, `logout`, plus line and model membership calls.

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

Mount with `@deepseek-ai/dsh-experimental-identity` and Typert from the collaboration-profile bundle. `status()` returns `current: null` when nobody is signed in, plus advertised methods and Host business lines. `status().accounts` and `listAccounts()` list every account only for the signed-in admin; other callers get an empty list or `identity/unauthorized`. `setAccountAdmin` promotes or demotes another account. Duplicate usernames or line ids return `identity/conflict`. Wrong passwords and unsigned mutations return `identity/unauthorized`. `listCatalogModels` lists Settings mention routes. `createLine` joins the signed-in account; `setLineModels` and `setActiveLine` apply only to that account.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Maintainer details — click to expand</summary>

The Remote namespace is `identity`. Password register does not sign in; the Client UI signs in after a successful register. `loginPassword` binds the current Remote caller Peer, so two browsers can stay signed in as different accounts. Future OAuth methods stay Host `registerMethod` plus new Remote calls.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

[Local identity](../identity/README.md)

-----

<a id="model-experience"></a>
## Model Experience

None, as this Remote only transports accounts.

#### KV Cache effect

No direct effect.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- There is no OAuth Remote yet.

-----

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Maintainer details — click to expand</summary>

None.

</details>
