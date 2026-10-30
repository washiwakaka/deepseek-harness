---
description: "Launch the collaboration room Host and Remote plugins from a source --patch overlay."
kind: "package-library"
---

# @deepseek-ai/dsh-experimental-collaboration-profile

English | [中文](README.zh.md)

## Summary

Use this overlay to load the collaboration room on a contributor checkout without adding it to the default Web app. Pass the patch file to `dsh web --patch`. Occupants live on the Host plugin; Clients call `listActors`.

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

Stop a default `pnpm run dev:web` process, then:

```sh
pnpm dsh web --patch packages/experimental/collaboration-profile/cordis.patch.yml
```

Override Host `actors` on the collaboration plugin when the demo roster is wrong. Default Web isolation must still reject these rows.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The patch inserts `@deepseek-ai/dsh-experimental-collaboration`, `@deepseek-ai/dsh-experimental-api-collaboration`, and `@deepseek-ai/dsh-experimental-client-ui-collaboration`. This package is a patch carrier; it has no runtime service. Enter still uses the ordinary Session prompt; the Client UI package owns the extra Post to room control.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Collaboration Host](../collaboration/README.md)
- [Collaboration Remote](../api-collaboration/README.md)
- [Adding a collaboration room](../../../docs/cookbook/adding-a-collaboration-room.md)
- [Experimental packages](../README.md)

-----

<a id="model-experience"></a>
## Model Experience

None, as this overlay only mounts other plugins; the Host collaboration package owns compiled mention tasks.

#### KV Cache effect

No direct effect.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- This overlay is not an Official bundle and has no plugin-manager icon.
- Composer send still follows up the room Agent; @ picking is not registered yet.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

This Dev Note is working context for maintainers and is explicitly non-authoritative.

AI occupant `provider`/`model` in the sample patch must match a loaded LLM adapter.

</details>
