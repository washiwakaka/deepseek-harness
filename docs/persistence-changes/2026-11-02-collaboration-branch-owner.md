---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-11-02-collaboration-branch-owner

English | [中文](2026-11-02-collaboration-branch-owner.zh.md)

## Summary

Adds optional ownerId on collaboration branch-opened and actor-invoked events so each human keeps a private model branch.

## Table of Contents

- [Declaration](#declaration)
- [Compatibility](#compatibility)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="declaration"></a>
## Declaration

```yaml persistence-change
schemaVersion: 1
id: 2026-11-02-collaboration-branch-owner
baseline: false
changes:
  - root: "event:collaboration/actor-invoked"
    previous: "2026-10-29-collaboration-room-events"
    after: "483180bc7536a02616b78ae5d0e899764c2bfd57a672465b67dcda73d66e1621"
    decision: same-version
  - root: "event:collaboration/branch-opened"
    previous: "2026-10-29-collaboration-room-events"
    after: "fa605f13ff1b8713a6436b953d87febc025da73fdd67ae83be1dfba13c0ea88a"
    decision: same-version
```

<a id="compatibility"></a>
## Compatibility

Existing records remain valid. Readers treat a missing ownerId as a shared child visible to every room occupant. New writers always set ownerId to the mentioning human. Same Session header version.

<a id="verification"></a>
## Verification

pnpm exec vitest run packages/experimental/collaboration/tests/mention.spec.ts packages/experimental/collaboration/tests/projection-events.spec.ts packages/experimental/client-ui-collaboration/tests/visibility.client.spec.ts: 47 tests passed in the related suite.

<a id="dev-note"></a>
## Dev Note

None.
