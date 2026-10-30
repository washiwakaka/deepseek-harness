# Agent Note: Collaboration branches, selective publish, and room ACL

Status: proposed

English | [中文](2026-10-29-collaboration-branch-publish.zh.md)

## Problem

A human who @-mentions a model needs a private working copy of the room so far, not an automatic dump of that model's answer onto the shared log. Other humans should not see the room until the creator invites them. The [earlier collaboration-room note](2026-10-12-collaboration-room-fork-publish.md) still owns non-surface peer chat, overlay isolation, and the per-actor compiler; it auto-posts mention replies and treats Config Alice/Bob as occupants rather than an access list.

## Proposal

When a human @-mentions a model on the **room** Session, Host forks or reuses that model's working **branch** Session, compiles every room-visible line through the mention, and `followup`s the branch. The answer stays on the branch. The user continues there with ordinary Send. **Publish** copies chosen assistant text onto the room as that AI's `collaboration/message`; nothing is auto-posted.

The room Session is visible to its creator only until that creator @-mentions another human. Those two (and later invitees) talk on the room. Other humans do not see it. Overlay Alice/Bob is the occupant identity for this ACL; it is not Host login. A later Host-authenticated identity would replace the switch.

Do not set `origin: 'subagent'` on a branch. Do not change `agent-loop`. Keep the experimental overlay.

## Alternatives considered

**Keep auto-posting every mention reply onto the room.** Rejected: the branch is the place to judge the answer; the room only receives what a human publishes.

**Merge the branch JSONL into the room.** Rejected by the same prefix-copy rule as the earlier note: there is no merge, and tool traces must stay off the room log.

**Inject published text as parent `context/message`.** Rejected for room presentation: published AI lines need the same `collaboration/message` rendering as other room posts.

**Reuse LiveShare for @-human invite.** Rejected: a LiveShare viewer prompt is a `user/message` on the source Session and drives that Agent. Room talk still must not start a room turn.

**New fork on every later @ of the same model from the room.** Deferred: continuing work on the existing branch matches "keep working in the fork". A later @ from the room reopens that branch and sends only the uncompiled room delta. A always-new-fork path can land once ACL does.

## Acceptance criteria

- @ a model from the room opens that model's branch; the room log has no new AI `collaboration/message` until publish.
- The first branch task contains the compiled room-visible transcript through the mention.
- A later @ of the same model from the room does not create a second child; the user can Send on the branch without posting to the room.
- Publish appends the chosen assistant text as that AI's room line and does not copy tool events.
- Default Web isolation still passes.
- Creator-only visibility and @-human share use Config actor ids in the overlay; a Host-authenticated identity is still later.

## Risks

- Overlay ACL still shares one process: a Client that knows the Session id can open it; the sidebar filter and Host `COLLAB_ACCESS_DENIED` are the occupant checks.
- Publishing a long branch dump can surprise other occupants; the first publish copies the latest assistant text, not the whole branch.
- Reusing one branch per model keeps tool memory and can surprise a user who wanted a clean fork from the latest room.
