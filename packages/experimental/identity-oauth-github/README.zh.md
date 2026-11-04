---
description: "向 identity 登记 GitHub OAuth 登录方式，不完成授权。"
kind: "package-reference"
---

# @deepseek-ai/dsh-experimental-identity-oauth-github

[English](README.md) | 中文

## 概述

本插件调用 `ctx.identity.registerMethod({ id: 'github', kind: 'oauth' })`。账号芯片随后把 GitHub 列为即将支持。它不跑 GitHub OAuth，也不创建账号。

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

把该行插在 `@deepseek-ai/dsh-experimental-identity` 之后。[协作房间组合包](../collaboration-profile/README.zh.md)已经这样做。`listMethods()` 随后包含 `{ id: 'github', kind: 'oauth' }`。释放插件 fiber 会撤回该方法。密码注册和登录仍在 identity 插件上。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>维护者信息 — 点击展开</summary>

`apply` 通过 `ctx.effect` 登记，因此 fiber 释放时会运行 `registerMethod` 返回的清理函数。重复的 `github` id 会在 identity 里失败。没有 Config，也没有 Remote。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [本地身份](../identity/README.zh.md)
- [协作房间组合包](../collaboration-profile/README.zh.md)

-----

<a id="model-experience"></a>
## 模型体验

无，因为公布的登录方式不会进入模型请求。

#### KV 缓存影响

没有直接影响。

## 已知限制与后续工作

<a id="known-limitations-and-deferred-work"></a>

- GitHub 授权、令牌交换和账号绑定尚未实现。
- Client 芯片把 `kind: 'oauth'` 画成禁用的「即将支持」控件。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者信息 — 点击展开</summary>

无。

</details>
