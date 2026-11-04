---
description: "Enable the collaboration room, local identity, and GitHub method advertisement with one experimental bundle."
kind: "package-bundle"
---

# @deepseek-ai/dsh-experimental-collaboration-profile

English | [中文](README.zh.md)

## Summary

`dsh-experimental-collaboration-profile` enables the collaboration room, local identity, and GitHub method advertisement with one bundle. Occupants register from the sidebar chip above New session. Clients call `listActors`. The bundle ships with dsh switched off. Enable it from the Plugins page or add it to an initialized Web profile.

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

### Install into a profile

Add the package to an initialized Web profile:

```sh
dsh plugin --profile web add @deepseek-ai/dsh-experimental-collaboration-profile
```

Enable Collaboration room on the Web or Desktop Plugins page. Removing the package with `dsh plugin --profile <name> remove @deepseek-ai/dsh-experimental-collaboration-profile` removes the bundle from the profile's ordered layer list.

On a contributor checkout, source-launch still accepts the same patch file:

```sh
pnpm dsh web --patch packages/experimental/collaboration-profile/cordis.patch.yml
```

The layer mounts identity plus collaboration, with `actors: []`, seed `lines` Core and Guest, Config `admins: [admin]`, and the GitHub method plugin after identity. Register username `admin` from the sidebar chip above New session to become admin, then join a line and choose models. That admin sees every user, line, and Session, and can promote later users in the account panel. Default Web isolation must still reject these rows until the bundle is enabled.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The package's runtime content is [`cordis.patch.yml`](cordis.patch.yml). Applied after the Web base, the patch inserts identity Host/Remote/UI, the GitHub method plugin, then `@deepseek-ai/dsh-experimental-collaboration`, `@deepseek-ai/dsh-experimental-api-collaboration`, and `@deepseek-ai/dsh-experimental-client-ui-collaboration`. This package has no runtime service. Enter still uses the ordinary Session prompt; the Client UI package owns the extra Post to room control.

| File | Role |
|---|---|
| [`cordis.patch.yml`](cordis.patch.yml) | Ordered patch over the Web base |
| [`src/index.ts`](src/index.ts) | Empty module entry; the patch is the runtime content |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Collaboration Host](../collaboration/README.md)
- [Local identity](../identity/README.md)
- [GitHub sign-in method](../identity-oauth-github/README.md)
- [Collaboration Remote](../api-collaboration/README.md)
- [Adding a collaboration room](../../../docs/cookbook/adding-a-collaboration-room.md)
- [Experimental packages](../README.md)

-----

<a id="model-experience"></a>
## Model Experience

None, as this bundle only mounts other plugins; the Host collaboration package owns compiled mention tasks.

#### KV Cache effect

No direct effect.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Opt-in only** — the package ships with the installation switched off; no shipped CLI, Web, SDK, ACP, or Python profile enables it.
- **Base profile required** — the patch depends on row ids supplied by the Web base; it is not a standalone profile.
- Composer Enter still follows up the room Agent; Post to room owns `@` chips.
- GitHub authorization is not implemented; the method plugin only advertises `kind: 'oauth'`.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

This Dev Note is working context for maintainers and is explicitly non-authoritative.

AI occupant `provider`/`model` in a custom patch must match a loaded LLM adapter.

</details>
