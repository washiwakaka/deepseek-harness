---
description: "带认证的 overlay 注册、密码登录与账号状态 Remote。"
kind: "package-reference"
---

# @deepseek-ai/dsh-experimental-api-identity

[English](README.md) | 中文

## 概述

`ctx.identityController` 把 Host 身份暴露给浏览器。Client 调用 `status`、`registerPassword`、`loginPassword`、`logout`，以及业务线和模型成员接口。

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

与 `@deepseek-ai/dsh-experimental-identity` 和 Typert 一起从协作房间组合包挂载。无人登录时 `status()` 返回 `current: null`，并带上已公布的登录方式和 Host 业务线。只有已登录管理员会在 `status().accounts` 和 `listAccounts()` 里看到全部账号；其它调用者得到空列表或 `identity/unauthorized`。`setAccountAdmin` 提升或取消另一个账号的管理员。重复用户名或业务线 id 返回 `identity/conflict`。密码错误和未登录的变更返回 `identity/unauthorized`。`listCatalogModels` 列出 Settings 提及路由。`createLine` 会让已登录账号加入该线；`setLineModels` 和 `setActiveLine` 只作用于该账号。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>维护者信息 — 点击展开</summary>

Remote 命名空间是 `identity`。密码注册不会登录；Client UI 在注册成功后再登录。`loginPassword` 绑定当前 Remote 调用方 Peer，因此两个浏览器可以分别登录不同账号。以后的 OAuth 方式仍走 Host `registerMethod` 加上新的 Remote 调用。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

[本地身份](../identity/README.zh.md)

-----

<a id="model-experience"></a>
## 模型体验

无，因为本 Remote 只传输账号。

#### KV 缓存影响

没有直接影响。

## 已知限制与后续工作

<a id="known-limitations-and-deferred-work"></a>

- 还没有 OAuth Remote。

-----

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者信息 — 点击展开</summary>

无。

</details>
