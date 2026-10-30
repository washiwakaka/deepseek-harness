---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-10-29-collaboration-room-events

English | [中文](2026-10-29-collaboration-room-events.zh.md)

## Summary

Adds collaboration-room events and a collaboration-mention user-message source kind.

## Table of Contents

- [Declaration](#declaration)
- [Compatibility](#compatibility)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="declaration"></a>
## Declaration

```yaml persistence-change
schemaVersion: 1
id: 2026-10-29-collaboration-room-events
baseline: false
changes:
  - root: "event:agent/inbox/spliced"
    previous: "2026-10-13-liveshare-share-viewer-principal"
    after: "9a47e7fb53153160b1c9581d6f28bfcbd2774449c23372d0d7d291aad8a9166a"
    decision: same-version
  - root: "event:collaboration/actor-invoked"
    previous: null
    after: "bf10691a9740d98f8e961c9b8a3a9c8a37aafb61868117e89b56f6a99342a038"
    decision: same-version
  - root: "event:collaboration/branch-opened"
    previous: null
    after: "a6f6874579dd4ab45962a63ae3b4a7dd0b4e8fd16b5c4485de595d96043b5fc3"
    decision: same-version
  - root: "event:collaboration/message"
    previous: null
    after: "45c740e5ac499b705b9ef6e03223f8c212710ca2472ed2c67432174c52bfcedb"
    decision: same-version
  - root: "event:developer/message"
    previous: "2026-10-13-liveshare-share-viewer-principal"
    after: "76442d016b49e5d1ba326befae77bedff0a14f4c110c6bd1ab9f75dd3af680ca"
    decision: same-version
  - root: "event:session/title-llm-request"
    previous: "2026-10-13-liveshare-share-viewer-principal"
    after: "1784eabe636e0a187ed88bd5a4c97223e9623ce2cc4e03e8ecc263f4e7dacd18"
    decision: same-version
  - root: "event:user/message"
    previous: "2026-10-13-liveshare-share-viewer-principal"
    after: "353872376262b8b7c110dd8bbf6f2ff1bc29fde4083a8a36fa1a76e686468d29"
    decision: same-version
```

<a id="compatibility"></a>
## Compatibility

Existing sessions without these keys remain valid. New collaboration/* events are required-on-read: an older harness that does not list them refuses the log instead of skipping them. MessageSource.kind is merge-extensible; readers that do not know collaboration-mention fall through unknown kinds and still reconstruct the user-role text. Producers write the new kind only on AI-occupant child tasks.

<a id="verification"></a>
## Verification

pnpm exec vitest run packages/experimental/collaboration/tests: 13 tests passed, covering unmentioned posts, first and later @ of the same AI, @ of a second AI, and invalid payloads.

<a id="dev-note"></a>
## Dev Note

None.
