---
description: "Overlay 本地账号：内置密码方式，并保留给后续第三方登录的方法注册表。"
kind: "package-reference"
---

# @deepseek-ai/dsh-experimental-identity

[English](README.md) | 中文

## 概述

`ctx.identity` 把 overlay 真人存在 credentials grant 里，并为当前 Remote 调用方登录其中一个。密码方式内置。其它插件之后可用 `registerMethod` 登记 OAuth id。登录后，同一账号加入彼此独立的业务线，并设置该线上可 `@` 的 Settings 模型。这不是 DeepSeek 账号。

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

从协作房间组合包挂载，不要从默认 Web 应用挂载。先 `registerPassword`，再 `loginPassword`。在其它插件登记更多方式之前，`listMethods()` 返回 `{ id: 'password', kind: 'password' }`。Config `lines` 在存储为空时播种 Host 目录。Config `admins` 会在这些用户名注册时写成管理员；已登录管理员调用 `setAccountAdmin` 提升或取消后续账号。配置里的管理员不能被降级。叠加层浏览器成为 `local-identity` Peer；未登录时列表为空，已登录管理员可列出全部在线 Session。已登录管理员调用 `createLine`。已登录账号调用 `joinLine`、`setLineModels`、`setActiveLine`。协作占用者只用当前业务线的 `occupancyOf`：空 `modelIds` 表示设置里已接入的全部模型；没有当前业务线时用 `IDENTITY_CLOSED_PROVIDER`，`@` 目录为空。加载本服务时，协作发帖要求 `currentAccount()`。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>维护者信息 — 点击展开</summary>

密码用 scrypt 哈希后写入 credentials 键 `identity/local-users`。grant payload 存 `users`（含 `role` 和每条线的 `memberships`）和 Host 级 `lines`。`registerMethod` 遇重复 id 失败，并返回清理函数。credentials 可以晚于本插件加载；在 `ctx.credentials` 出现之前，注册和登录会明确失败。有 `ctx.connection` 时，identity 注册浏览器 principal 工厂，让每个 v3 cookie Peer 成为 `{ kind: 'local-identity', browserSessionId }`。Remote 调用把已登录账号绑到 `invocation.peer.id`；两个 Peer 可以分别登录不同账号。登录和登出会对该 Peer 调用 `remoteAccess.invalidate`。没有 invocation 的 Host 调用共享一份进程会话。各业务线的成员和模型白名单不合并。管理员仍按当前业务线占用房间；列出其它 Session 并不会获准向其中发帖。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [协作房间组合包](../collaboration-profile/README.zh.md)
- [GitHub 登录方式](../identity-oauth-github/README.zh.md)

-----

<a id="model-experience"></a>
## 模型体验

无，因为账号不会进入模型请求。

#### KV 缓存影响

没有直接影响。

## 已知限制与后续工作

<a id="known-limitations-and-deferred-work"></a>

- GitHub 由 `@deepseek-ai/dsh-experimental-identity-oauth-github` 公示；授权尚未实现。其它 OAuth 提供方仍留给后续插件。
- 未出现在 `ctx.sessions.list()` 里的冷 Session 在恢复之前不进入 Host 占用策略。Session 写权限和创建归属在 collaboration 插件里。
- 管理员可以列出全部账号、业务线和 Session，并把后续用户设为管理员，但不能重置其它账号的密码。

-----

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者信息 — 点击展开</summary>

无。

</details>
