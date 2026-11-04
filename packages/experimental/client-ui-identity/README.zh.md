---
description: "新会话按钮上方的侧栏入口，点击后打开注册或登录对话框。"
kind: "package-reference"
---

# @deepseek-ai/dsh-experimental-client-ui-identity

[English](README.md) | 中文

## 概述

Client 导出挂载 identity Remote，并占用 `sidebar.account` 上的账号芯片。点击后弹出密码登录或注册对话框。登录后同一对话框管理业务线成员和该线上可 `@` 的模型。管理员还能在同一对话框里看到全部账号和全部业务线。`ctx.identitySession` 把已登录账号、业务线、账号列表和 Settings 目录提供给其它 Client 插件。

## 目录

- [使用此包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用此包

从协作房间组合包加载。芯片在「新会话」按钮上方。展开侧栏显示显示名，或显示名加当前业务线；收起时只显示用户图标。登录后加入一条业务线，并勾选这条线上可 `@` 的模型；全部勾选表示不限制。用 Config `admins` 里的用户名注册即成为管理员，然后才能新建业务线，并勾选后续用户提升他们。配置里的管理员保持勾选，不能降级。协作随后由 Host 列出全部 Session。会话输入框里的回车仍走普通 Session prompt。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>维护者信息 — 点击展开</summary>

`status()` 和 `listCatalogModels` 写入 `IdentitySessionStore`。密码注册成功后调用 `loginPassword`。已登录面板调用 `joinLine`、`leaveLine`、`setLineModels`、`setActiveLine`。当 `current.admin` 为真时，面板还会显示新建业务线表单、列出 `status().accounts`，并调用 `createLine` 和 `setAccountAdmin`。`seedAdmin` 为真的账号，管理员勾选框禁用。`kind: 'oauth'` 的方式在 Host 方法和 Remote 就绪前画成禁用的「即将支持」按钮。释放插件 fiber 会去掉槽位和 Remote 挂载。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

[本地身份](../identity/README.zh.md)

-----

<a id="model-experience"></a>
## 模型体验

无，因为对话框不会向 Agent 提交。

#### KV 缓存影响

没有直接影响。

## 已知限制与后续工作

<a id="known-limitations-and-deferred-work"></a>

- 第三方按钮只是占位，等 OAuth 方法登记后再接。

-----

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者信息 — 点击展开</summary>

无。

</details>
