---
description: "Registers GitHub as an identity OAuth method without completing authorization."
kind: "package-reference"
---

# @deepseek-ai/dsh-experimental-identity-oauth-github

English | [中文](README.zh.md)

## Summary

This plugin calls `ctx.identity.registerMethod({ id: 'github', kind: 'oauth' })`. The account chip then lists GitHub as coming later. It does not run a GitHub OAuth flow or create accounts.

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

Insert the row after `@deepseek-ai/dsh-experimental-identity`. The [collaboration-profile](../collaboration-profile/README.md) bundle already does that. `listMethods()` then includes `{ id: 'github', kind: 'oauth' }`. Disposing the plugin fiber withdraws that method. Password register and login stay on the identity plugin.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Maintainer details — click to expand</summary>

`apply` registers through `ctx.effect`, so the disposer from `registerMethod` runs when the fiber disposes. Duplicate `github` ids fail in identity. There is no Config and no Remote.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Local identity](../identity/README.md)
- [Collaboration room bundle](../collaboration-profile/README.md)

-----

<a id="model-experience"></a>
## Model Experience

None, as advertised sign-in methods never enter model requests.

#### KV Cache effect

No direct effect.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- GitHub authorization, token exchange, and account linking are not implemented.
- The Client chip renders `kind: 'oauth'` as a disabled coming-later control.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Maintainer details — click to expand</summary>

None.

</details>
