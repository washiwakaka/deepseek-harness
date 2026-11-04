---
description: "在 overlay 加载后显示协作房间的聊天行、标题栏标记，以及把草稿发到房间的 Composer 按钮。"
kind: "package-reference"
---

# @deepseek-ai/dsh-experimental-client-ui-collaboration

[English](README.md) | 中文

## 概述

本包是协作房间的 Web 展示。它加上标题栏标记，让你能看出 overlay 已加载；把持久的 `collaboration/message` 画成 Chat 行；在 Composer 的 `@` 菜单里列出 Config 的 AI 占用者；并在 Composer 工具行放一个小按钮，通过 `collaboration.postMessage` 发送草稿。回车和原来的发送按钮仍走 Session prompt。

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

通过 [`@deepseek-ai/dsh-experimental-collaboration-profile`](../collaboration-profile/README.zh.md) 挂载。Web Client loader 加载 `/client` 导出；Host 导出是空的。

启用协作房间组合包后请重启：

```sh
dsh plugin --profile web add @deepseek-ai/dsh-experimental-collaboration-profile
```

会话标题左侧会显示「协作房间」以及 `listActors` 返回的占用者名。登录在 identity 侧栏入口，不在这个标记里。没有 Session 或空白 Session 时这个控件仍然可见。换一个已注册真人登录会恢复该真人上次的 Session：Host ACL 让 Alice 的房间对 Bob 不可见，直到 Alice `@` Bob 并发帖；管理员能列出全部 Session，但不能写自己未占用的房间；Bob 若还没有自己的 Session，主面板为空，等他自己新建。之后 Bob 才能打开、分支和发帖。遗留空房间不进列表，直到有人调用 `claimRoom`。已有的 `collaboration/message` 事件会画成带名字的行，四种气泡四种底色：发送/`user/message` 仍用 Chat 气泡 token，当前测试真人的房间帖用 overlay 中性底，其他真人用 warn 色，AI 房间帖用 success 色。发送得到的助手回复仍是 Chat 默认、靠左。发送按钮左侧有「发到房间」和「带房间发送」。「发到房间」以当前选中的 Host 真人发帖，不 followup。「带房间发送」在草稿没有模型 chip 时调用 `sendWithRoom`，由 Host 先写入尚未编译的房间誊本，再对房间 Agent followup。草稿里的模型 chip 和其他真人 chip 会变成「发到房间」和「带房间发送」的 `mentions`；提及真人即邀请该占用者。Composer 的 `@` 先列出其他真人，再列出当前真人可用的设置模型，可按名字搜索，然后是会话、文件和文件夹。`@` 在草稿里空白之后的任何位置都能打开。选中用户或模型会插入 chip，供下一次「发到房间」使用。AI 房间行会标明回答来自哪个模型。@ 一个模型不会离开房间 Session；侧边栏只把该模型的分支（标题 `{模型} · {房间}`）给发起 @ 的真人看，并归在房间下面。发起 @ 的真人从分支发布后，最新 assistant 文本才进入房间。「带房间发送」和带提及的发帖在 Remote 未返回时显示 Chat 的「深度求索中」动效。回车和发送仍 followup 房间 Agent，不额外带房间上下文。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现内部 — 点击展开</summary>

Client 导出先挂载生成的 collaboration Remote，再通过 Cordis effect 注册 locale 词典、一个 `order: -10` 的 `@` source（名为 `models`）、`conversation.header.leading` 标记、按 key 的 Chat 渲染器，以及 `conversation.input.right` 上的控件。标题栏标记用 `listActors` 拉占用者，写入 `ActorRosterStore`。存在 `ctx.identitySession` 时跟那个已登录账号，不再用 Config 真人开关。会话可见性由 Host ACL 决定，Client 不再过滤侧栏。切换真人等于换一套视图：恢复该真人上次的 Session；没有则 `clearSession`，不会留下上一个人的会话。`isOwnedBranch` 仍用来控制提及分支上的「发到房间」。`@` 候选项从 `listActors` 取其他真人，并按当前真人调用 `listMentionModels`。Conversation Definition 匹配 `collaboration/message` 和 `collaboration/actor-invoked`。消息建成带 `actorId` 的 `collaboration-message` Chat node，好按当前测试真人摆位置。invoke 不在房间开思考行；工作留在分支上，直到「推送到房间」。「发到房间」读取该 Session 的 `useInput` 草稿和提及 chip，以当前选中的真人调用 `postMessage` 并带上这些提及 id，成功后清空草稿。「带房间发送」在草稿点名了模型或其他真人时同样 `postMessage`；否则调用 `sendWithRoom`。两个按钮都会在 Remote 未返回时把花名册的 `thinking` 打开，Composer dock 显示「深度求索中」。释放插件 fiber 会去掉全部注册和 Remote 挂载。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [协作房间组合包](../collaboration-profile/README.zh.md)
- [协作 Host](../collaboration/README.zh.md)
- [协作 Remote](../api-collaboration/README.zh.md)
- [新增协作房间](../../../docs/cookbook/adding-a-collaboration-room.zh.md)
- [实验性包](../README.zh.md)

-----

<a id="model-experience"></a>
## 模型体验

无，因为未被提及的房间帖不进入 Agent；之后的模型可见内容由 Host 提及编译负责。

#### KV Cache 影响

无直接效果；之后的模型可见内容由 Host 提及编译负责。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- 回车和发送仍会 followup 房间 Agent。
- 登录 UI 在 `client-ui-identity`；本标记只在该 session 存在时显示已登录显示名。
- Composer 的 `@` 在用户和模型之后仍会列出会话和文件。回车和发送会忽略模型 chip。
- 标题栏标记只表示已加载，不是占用者名单面板。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>给维护者的工作上下文 — 点击展开</summary>

本开发备注是给维护者的工作上下文，明确不具权威性。

本包通过 `ctx.remote.collaboration.postMessage` 发帖，并通过 `sendWithRoom` 发送草稿。

</details>
