---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-10-30-collaboration-occupant

English | [中文](2026-10-30-collaboration-occupant.zh.md)

## Summary

Adds collaboration/occupant and the collaboration-room-context user-message source kind for room ACL and room-delta admission.

## Table of Contents

- [Declaration](#declaration)
- [Compatibility](#compatibility)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="declaration"></a>
## Declaration

```yaml persistence-change
schemaVersion: 1
id: 2026-10-30-collaboration-occupant
baseline: false
changes:
  - root: "event:agent/inbox/spliced"
    previous: "2026-10-29-collaboration-room-events"
    after: "4c3f6c62fd067f5a281474e69204e08fe76a9d4e176d787717e9941aa70ef184"
    decision: same-version
  - root: "event:collaboration/occupant"
    previous: null
    after: "d5de270abb6ff987522d6dba99d384c6efb6594df50297b3f93d3bdce666b1fe"
    decision: same-version
  - root: "event:developer/message"
    previous: "2026-10-29-collaboration-room-events"
    after: "b75e18b690301de4db585fc4dde0f45382f1daa15929cd3bf64f844c0a76eeee"
    decision: same-version
  - root: "event:session/title-llm-request"
    previous: "2026-10-29-collaboration-room-events"
    after: "8a5b6393d7d0802c02a954554cd41865245c089172ef4acdd1112b5d0522a333"
    decision: same-version
  - root: "event:user/message"
    previous: "2026-10-29-collaboration-room-events"
    after: "a67a187014232619fa853d2c4e1d0ed928e69671fda981067b9611dc7ef3aa6a"
    decision: same-version
```

<a id="compatibility"></a>
## Compatibility

Existing sessions without these keys remain valid. New collaboration/occupant events are required-on-read: an older harness that does not list them refuses the log instead of skipping them. MessageSource.kind is merge-extensible; readers that do not know collaboration-room-context fall through unknown kinds and still reconstruct the user-role text. Producers write occupant events only when claiming or inviting a human, and write collaboration-room-context only when admitting an uncompiled room delta.

<a id="verification"></a>
## Verification

pnpm exec vitest run packages/experimental/collaboration/tests packages/experimental/api-collaboration/tests packages/experimental/client-ui-collaboration/tests: 641 tests in the combined collaboration plus ui-workspace run passed, covering occupant admit, COLLAB_ACCESS_DENIED, and sidebar visibility.

<a id="dev-note"></a>
## Dev Note

None.
