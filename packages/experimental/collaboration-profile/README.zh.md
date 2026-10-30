---
description: "用源码 --patch overlay 启动协作房间的 Host 与 Remote 插件。"
kind: "package-library"
---

# @deepseek-ai/dsh-experimental-collaboration-profile

[English](README.md) | 中文

## 概述

用本 overlay 在贡献者工作区加载协作房间，而不把它加入默认 Web 应用。把 patch 文件传给 `dsh web --patch`。占用者在 Host 插件上；Client 调 `listActors`。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

停掉默认的 `pnpm run dev:web`，然后：

```sh
pnpm dsh web --patch packages/experimental/collaboration-profile/cordis.patch.yml
```

演示名单不对时，在 collaboration 插件上覆盖 Host `actors`。默认 Web 隔离仍须拒绝这些行。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现内部 — 点击展开</summary>

该 patch 插入 `@deepseek-ai/dsh-experimental-collaboration`、`@deepseek-ai/dsh-experimental-api-collaboration` 和 `@deepseek-ai/dsh-experimental-client-ui-collaboration`。本包只承载 patch，没有运行时服务。回车仍走普通 Session prompt；Client UI 包提供额外的「发到房间」控件。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [协作 Host](../collaboration/README.zh.md)
- [协作 Remote](../api-collaboration/README.zh.md)
- [新增协作房间](../../../docs/cookbook/adding-a-collaboration-room.zh.md)
- [实验性包](../README.zh.md)

-----

<a id="model-experience"></a>
## 模型体验

无直接模型输入，因为本 overlay 只挂载其它插件；被 @ 的 AI 子任务由 Host 协作包编译。

#### KV Cache 影响

无直接效果。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- 本 overlay 不是 Official bundle，也没有插件管理器图标。
- Composer 发送仍会 followup 房间 Agent；尚未注册 @ 选择器。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>给维护者的工作上下文 — 点击展开</summary>

本开发备注是给维护者的工作上下文，明确不具权威性。

示例 patch 里 AI 占用者的 `provider`/`model` 必须匹配已加载的 LLM adapter。

</details>
