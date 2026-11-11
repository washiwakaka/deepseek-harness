---
description: "Sidebar chip above New session that opens a register-or-sign-in dialog."
kind: "package-reference"
---

# @deepseek-ai/dsh-experimental-client-ui-identity

English | [中文](README.zh.md)

## Summary

The Client export mounts the identity Remote and occupies `sidebar.account` with a chip. Clicking it opens a modal for password sign-in or register. After sign-in the same modal manages business-line membership and the models that line may `@`. An admin also sees every account and every line in that modal. `ctx.identitySession` publishes the signed-in account, lines, accounts, and Settings catalog to other Client plugins.

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

Load from the collaboration-profile bundle. The chip sits above New session. Wide sidebars show the display name, or the name plus active line; the rail shows the user icon. After sign-in, join a line and check the models you may `@` on that line; every box checked means unrestricted. Register the username listed in Config `admins` to become admin, then create lines and check later users to promote them. Config admins stay checked and cannot be demoted. Collaboration then lists every Session on the Host. Enter in the conversation composer still sends the ordinary Session prompt.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Maintainer details — click to expand</summary>

`status()` and `listCatalogModels` fill `IdentitySessionStore`. Password register then calls `loginPassword`. The signed-in panel calls `joinLine`, `leaveLine`, `setLineModels`, and `setActiveLine`. When `current.admin` is true the panel also shows the create-line form, lists `status().accounts`, and calls `createLine` and `setAccountAdmin`. An account with `seedAdmin` has a disabled Admin checkbox and can grant later users Host capabilities such as Workspace. Methods with `kind: 'oauth'` render as disabled coming-later buttons until a Host method and Remote exist. A change of `current.id` calls `sessions.refresh()` and `workspaces.refreshList()` so the sidebar Session and Workspace lists match the signed-in account, including after sign-out; the Host filters the Workspace baseline by account, so a fresh browser only sees its Workspaces after this refetch. Disposing the plugin fiber removes the slot and the Remote mount.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

[Local identity](../identity/README.md)

-----

<a id="model-experience"></a>
## Model Experience

None, as the dialog never submits to an Agent.

#### KV Cache effect

No direct effect.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- Third-party buttons are placeholders until OAuth methods register.

-----

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Maintainer details — click to expand</summary>

None.

</details>
