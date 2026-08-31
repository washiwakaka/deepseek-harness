# Agent Note: Harness source-reading tutorial lives under develop/practice

Status: implemented

English | [中文](2026-08-25-harness-source-reading-tutorial.zh.md)

## Problem

Readers who finish the Cordis tutorial need an ordered path through the product spine — one turn in `agent-loop`, the five core `ctx` keys, composition, and a handful of exercises — without a new top-level tree or a chapter that pretends to be another `tmp/` transcript.

## Decision

The path is the tutorial [docs/user/develop/practice/reading-the-harness.md](../../../../docs/user/develop/practice/reading-the-harness.md). [Cordis chapter 7](../../../../docs/cordis-tutorial/07-into-the-harness.md) and the [three-role practice index](../../../../docs/user/develop/practice/index.md) link to it. The documentation site publishes it in the existing Practice section.

The document owns the reading order, the functions to open in `agent.ts`, and the exercises. The sequence-diagram walkthrough and the durable-vs-live name list live on [agent-lifecycle.md](../../../../docs/agent-lifecycle.md#reading-the-sequence); the `agent.ts` mapping lives at [Reading `agent.ts` against the lifecycle](../../../../docs/agent-lifecycle.md#reading-agent-ts); the English walkthrough source is [scripts/agent-lifecycle-walkthrough.md](../../../../scripts/agent-lifecycle-walkthrough.md). The tool-pipeline walkthrough lives on [tool-execution-pipeline.md](../../../../docs/tool-execution-pipeline.md#reading-the-pipeline); the `tool-calls.ts` scheduler mapping lives at [Reading `tool-calls.ts`](../../../../docs/tool-execution-pipeline.md#reading-tool-calls); the English source is [scripts/tool-execution-pipeline-walkthrough.md](../../../../scripts/tool-execution-pipeline-walkthrough.md). Turn flow remains in [architecture.md](../../../../docs/architecture.md); event signatures remain in [event-producer-consumer.md](../../../../docs/event-producer-consumer.md); package contracts remain in package READMEs.

Cordis tutorial chapters 1–7 remain the hands-on `tmp/cordis-tutorial` sequence. This page is not chapter 8 of that sequence.

## Alternatives considered

**A root `study/` directory.** Rejected: the repository layout in root `AGENTS.md` has no such tree, and a root folder would skip bilingual pairing, `doc-sync`, and the published develop sidebar.

**Cordis tutorial chapter 8.** Rejected: chapters 1–7 each run through `vendor/cordis/bin.js` against files in `tmp/cordis-tutorial`. A source-reading path has no such runnable output and would mix forms in that tree.

**A section of `docs/development.md`.** Rejected: that page is a budgeted standing contributor guide; the reading order is a tutorial with exercises, not daily workflow.

**A cookbook page.** Rejected: cookbooks add a tool, package, or adapter with numbered verify steps. This path teaches where to read, not how to ship one change.

## Consequences

Plugin authors reach the loop from the same develop Practice sidebar as the three-role and LLM-adapter tutorials. The Cordis tutorial keeps a uniform hands-on contract. Future expansions of the reading path edit that tutorial; expansions of the sequence walkthrough edit [scripts/agent-lifecycle-walkthrough.md](../../../../scripts/agent-lifecycle-walkthrough.md) and the Chinese counterpart of [agent-lifecycle.md](../../../../docs/agent-lifecycle.md); expansions of the tool-pipeline walkthrough or the `tool-calls.ts` scheduler mapping edit [scripts/tool-execution-pipeline-walkthrough.md](../../../../scripts/tool-execution-pipeline-walkthrough.md) and the Chinese counterpart of [tool-execution-pipeline.md](../../../../docs/tool-execution-pipeline.md).
