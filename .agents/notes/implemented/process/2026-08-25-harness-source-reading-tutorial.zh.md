# Agent Note: Harness 源码阅读教程放在 develop/practice 下

Status: implemented

[English](2026-08-25-harness-source-reading-tutorial.md) | 中文

## 问题

读完 Cordis 教程的读者需要一条有序路径，穿过产品主干——`agent-loop` 中的一次轮次、五个核心 `ctx` 键、组合，以及少量练习——而不新增顶层目录，也不把该路径写成又一篇假装在 `tmp/` 里跑通的章节。

## 决策

该路径是教程 [docs/user/develop/practice/reading-the-harness.md](../../../../docs/user/develop/practice/reading-the-harness.zh.md)。[Cordis 第 7 章](../../../../docs/cordis-tutorial/07-into-the-harness.zh.md) 和[三层角色实战索引](../../../../docs/user/develop/practice/index.zh.md) 链向它。文档站点在既有的「实战」分组中发布该页。

该文档拥有阅读顺序、`agent.ts` 中要打开的函数，以及练习。时序图详解与持久／实时名称列表位于 [agent-lifecycle.md](../../../../docs/agent-lifecycle.zh.md#reading-the-sequence)；`agent.ts` 对照位于[对着生命周期读 `agent.ts`](../../../../docs/agent-lifecycle.zh.md#reading-agent-ts)；英文详解源文件是 [scripts/agent-lifecycle-walkthrough.md](../../../../scripts/agent-lifecycle-walkthrough.md)。工具流水线详解位于 [tool-execution-pipeline.md](../../../../docs/tool-execution-pipeline.zh.md#reading-the-pipeline)；`tool-calls.ts` 调度器对照位于[对着 `tool-calls.ts` 读](../../../../docs/tool-execution-pipeline.zh.md#reading-tool-calls)；英文源文件是 [scripts/tool-execution-pipeline-walkthrough.md](../../../../scripts/tool-execution-pipeline-walkthrough.md)。轮次流程仍属于 [architecture.md](../../../../docs/architecture.zh.md)；事件签名仍属于 [event-producer-consumer.md](../../../../docs/event-producer-consumer.zh.md)；包约定仍属于各包 README。

Cordis 教程第 1–7 章仍是 `tmp/cordis-tutorial` 中的动手序列。本页不是该序列的第 8 章。

## 曾考虑的替代方案

**仓库根目录下的 `study/` 目录。** 不予采纳：根目录 `AGENTS.md` 的仓库布局没有这棵树，根目录文件夹会绕过双语配对、`doc-sync` 和已发布的 develop 侧边栏。

**作为 Cordis 教程第 8 章。** 不予采纳：第 1–7 章都通过 `vendor/cordis/bin.js` 对着 `tmp/cordis-tutorial` 中的文件运行。源码阅读路径没有这样的可复现输出，放进该树会混用两种体裁。

**写入 `docs/development.md` 的一节。** 不予采纳：该页是有字数预算的常设贡献者指南；阅读顺序是带练习的教程，不是日常工作流。

**写成 cookbook 页面。** 不予采纳：cookbook 用带编号的校验步骤添加工具、包或适配器。这条路径教的是读哪里，不是如何交付某一项改动。

## 后果

插件作者从与三层角色、LLM（大语言模型）适配器教程相同的 develop「实战」侧边栏进入循环。Cordis 教程保持统一的动手约定。以后扩展阅读路径时改那份教程；扩展时序图详解时改 [scripts/agent-lifecycle-walkthrough.md](../../../../scripts/agent-lifecycle-walkthrough.md)，以及 [agent-lifecycle.md](../../../../docs/agent-lifecycle.zh.md) 的中文对侧；扩展工具流水线详解或 `tool-calls.ts` 调度器对照时改 [scripts/tool-execution-pipeline-walkthrough.md](../../../../scripts/tool-execution-pipeline-walkthrough.md)，以及 [tool-execution-pipeline.md](../../../../docs/tool-execution-pipeline.zh.md) 的中文对侧。
