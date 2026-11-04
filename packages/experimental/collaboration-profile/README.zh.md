---
description: "用一个实验性组合包启用协作房间、本地身份和 GitHub 登录方式公示。"
kind: "package-bundle"
---

# @deepseek-ai/dsh-experimental-collaboration-profile

[English](README.md) | 中文

## 概述

`dsh-experimental-collaboration-profile` 用一个组合包启用协作房间、本地身份和 GitHub 登录方式公示。占用者在侧栏「新会话」按钮上方的芯片注册。Client 调 `listActors`。本包随 dsh 安装提供，默认关闭。可在插件页开启，或添加到已初始化的 Web profile。

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

### 安装到 profile

把本包加到已初始化的 Web profile：

```sh
dsh plugin --profile web add @deepseek-ai/dsh-experimental-collaboration-profile
```

在 Web 或 Desktop 的插件页开启「协作房间」。执行 `dsh plugin --profile <name> remove @deepseek-ai/dsh-experimental-collaboration-profile` 会把该组合包从 profile 的有序层列表中移除。

在贡献者工作区，源码启动仍可使用同一份 patch 文件：

```sh
pnpm dsh web --patch packages/experimental/collaboration-profile/cordis.patch.yml
```

本层挂载 identity 和协作，并把 `actors` 设为 `[]`，同时播种 Core 与 Guest 业务线，Config `admins` 为 `[admin]`，并在 identity 之后插入 GitHub 方法插件。在侧栏「新会话」按钮上方用用户名 `admin` 注册即成为管理员，然后加入一条业务线并选择模型。该管理员能看到全部用户、业务线和 Session，并可在账号面板把后续用户设为管理员。在组合包启用之前，默认 Web 隔离仍须拒绝这些行。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现内部 — 点击展开</summary>

本包的运行时内容是 [`cordis.patch.yml`](cordis.patch.yml)。应用到 Web base 之后，该 patch 插入 identity 的 Host/Remote/UI、GitHub 方法插件，再插入 `@deepseek-ai/dsh-experimental-collaboration`、`@deepseek-ai/dsh-experimental-api-collaboration` 和 `@deepseek-ai/dsh-experimental-client-ui-collaboration`。本包没有运行时服务。回车仍走普通 Session prompt；Client UI 包提供额外的「发到房间」控件。

| 文件 | 作用 |
|---|---|
| [`cordis.patch.yml`](cordis.patch.yml) | 叠在 Web base 上的有序 patch |
| [`src/index.ts`](src/index.ts) | 空模块入口；运行时内容是 patch |

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [协作 Host](../collaboration/README.zh.md)
- [本地身份](../identity/README.zh.md)
- [GitHub 登录方式](../identity-oauth-github/README.zh.md)
- [协作 Remote](../api-collaboration/README.zh.md)
- [新增协作房间](../../../docs/cookbook/adding-a-collaboration-room.zh.md)
- [实验性包](../README.zh.md)

-----

<a id="model-experience"></a>
## 模型体验

无直接模型输入，因为本组合包只挂载其它插件；被 @ 的 AI 子任务由 Host 协作包编译。

#### KV Cache 影响

无直接效果。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- **仅按需开启** — 本包随安装提供且默认关闭；随附的 CLI、Web、SDK、ACP 或 Python profile 都不会启用它。
- **需要 base profile** — 该 patch 依赖 Web base 提供的行 id；它不是独立 profile。
- Composer 回车仍会 followup 房间 Agent；`@` 芯片由「发到房间」处理。
- GitHub 授权尚未实现；方法插件只公示 `kind: 'oauth'`。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>给维护者的工作上下文 — 点击展开</summary>

本开发备注是给维护者的工作上下文，明确不具权威性。

自定义 patch 里 AI 占用者的 `provider`/`model` 必须匹配已加载的 LLM adapter。

</details>
