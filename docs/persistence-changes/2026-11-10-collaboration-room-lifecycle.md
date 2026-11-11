---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-11-10-collaboration-room-lifecycle

English | [中文](2026-11-10-collaboration-room-lifecycle.zh.md)

## Summary

Adds the collaboration/occupant-removed event and optional publish source fields (branchSessionId, assistantSeq) on collaboration/message, and linearizes the shared message-source roots onto the merged history.

## Table of Contents

- [Declaration](#declaration)
- [Compatibility](#compatibility)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="declaration"></a>
## Declaration

```yaml persistence-change
schemaVersion: 1
id: 2026-11-10-collaboration-room-lifecycle
baseline: false
changes:
  - root: "event:agent/inbox/spliced"
    previous: "2026-10-30-collaboration-occupant"
    after: "53deb4de18911bdc7093da57be58ca97f0725996c10d3abc32362faa1d07450e"
    decision: same-version
  - root: "event:collaboration/message"
    previous: "2026-10-29-collaboration-room-events"
    after: "82a29946ff8597e23752adcc5654c938bfb1e14cd2ca2ceb4daae174a4b46b73"
    decision: same-version
  - root: "event:collaboration/occupant-removed"
    previous: null
    after: "1e1cb9a2a9911622165101e57731e2b79502cca2d6313afa1c4a95fa9a0d54ef"
    decision: same-version
  - root: "event:developer/message"
    previous: "2026-10-30-collaboration-occupant"
    after: "88fc4a8591732d24bb0a5943a4e743c3657794734409019521efe89583afae37"
    decision: same-version
  - root: "event:session/title-llm-request"
    previous: "2026-10-30-collaboration-occupant"
    after: "bf5360f2cdecb1f7b649b5ad11f53f0f039de6a3057dfbaa33e8ce24bb2529ba"
    decision: same-version
  - root: "event:user/message"
    previous: "2026-10-30-collaboration-occupant"
    after: "752629d0134934b030b922c80bc50f4f9311d12298de31f2c5440bb6159fa657"
    decision: same-version
```

<a id="compatibility"></a>
## Compatibility

Existing sessions remain valid. collaboration/occupant-removed is a new required-on-read collaboration event: an older harness that does not list it refuses the log instead of skipping it, matching the other collaboration/* events. branchSessionId and assistantSeq are optional; older readers ignore them and older logs carry neither field, so duplicate-publish detection simply does not apply to replies published before this change. The shared roots (user/message, developer/message, agent/inbox/spliced, session/title-llm-request) only re-base the earlier collaboration record onto the merged master history: the union variants and optional properties named here were each already acknowledged by the records that introduced them (subagent settlement attribution, retry control input, collaboration room events), and no reader behavior changes. Session header version is unchanged.

<a id="verification"></a>
## Verification

pnpm exec vitest run packages/experimental/collaboration/tests packages/experimental/api-collaboration/tests packages/experimental/client-ui-collaboration/tests: all passed, covering occupant leave/remove, duplicate-publish refusal, selected-reply publish, and cold-resumed publish. pnpm --silent run verify-persistence-changes --json passes after this record.

<a id="dev-note"></a>
## Dev Note

None.
