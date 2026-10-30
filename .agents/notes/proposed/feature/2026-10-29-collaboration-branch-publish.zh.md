# Agent Note: Collaboration branches, selective publish, and room ACL

Status: proposed

[English](2026-10-29-collaboration-branch-publish.md) | 中文

## 问题

真人在房间里 @ 一个模型时，需要一份「截至 @ 为止」的私有工作拷贝，而不是把该模型的回答自动倒进共享日志。在创建人邀请之前，其他真人不应看见这个房间。[此前的协作房间笔记](2026-10-12-collaboration-room-fork-publish.zh.md) 仍负责非表层同伴聊天、overlay 隔离和按占用者的编译器；它会自动贴回提及回复，并把 Config 里的 Alice/Bob 当成占用者，而不是访问名单。

## 提案

真人在**房间** Session 上 @ 一个模型时，Host 为该模型 fork 或复用一条工作**分支** Session，编译截至该提及的全部房间可见行，并对分支 `followup`。答案留在分支上。用户在分支里用普通发送继续工作。**发布**把选中的 assistant 文本作为该 AI 的 `collaboration/message` 拷到房间；没有任何自动贴回。

房间 Session 只对创建人可见，直到创建人 @ 另一个真人。这两人（以及之后的被邀请人）在房间里交谈。其他真人看不见。Overlay 的 Alice/Bob 是这套 ACL 的占用者身份，不是 Host 登录。以后若有 Host 鉴权身份，会替换这套切换。

不要给分支打 `origin: 'subagent'`。不要改 `agent-loop`。继续用实验性 overlay。

## 考虑过的替代方案

**继续把每次提及的回复自动贴回房间。** 否决：判断答案的地方是分支；房间只接收真人发布的内容。

**把分支 JSONL 合并进房间。** 与前一笔记相同的前缀拷贝规则否决：没有合并，工具轨迹也不得进入房间日志。

**把已发布文本注入为父会话 `context/message`。** 为房间展示否决：已发布的 AI 行需要与其它房间帖相同的 `collaboration/message` 渲染。

**用 LiveShare 做 @ 真人邀请。** 否决：LiveShare viewer 的 prompt 是源 Session 上的 `user/message`，会驱动该 Agent。房间谈话仍不得开启房间 turn。

**从房间再次 @ 同一模型时每次新建 fork。** 延期：在已有分支上继续工作符合「在分叉会话里继续」。从房间再次 @ 会打开该分支，并只发送尚未编译的房间增量。若需要「每次都是干净 fork」，等 ACL 一起做。

## 验收标准

- 从房间 @ 一个模型会打开该模型的分支；在发布之前，房间日志没有新的 AI `collaboration/message`。
- 分支的第一条任务包含截至该提及的已编译房间可见誊本。
- 从房间再次 @ 同一模型不会创建第二条子会话；用户可以在分支上发送而不发到房间。
- 发布把选中的 assistant 文本追加为该 AI 的房间行，不拷贝工具事件。
- 默认 Web 隔离仍然通过。
- 仅创建人可见和 @ 真人分享在 overlay 里用 Config actor id；Host 鉴权身份仍是后续工作。

## 风险

- Overlay ACL 仍共用一个进程：知道 Session id 的 Client 仍能打开它；侧栏过滤和 Host `COLLAB_ACCESS_DENIED` 是占用者检查。
- 把很长的分支一次性发布会让其他占用者吃惊；第一次发布拷贝最新 assistant 文本，不是整条分支。
- 每个模型复用一条分支会保留工具记忆，也可能让想从最新房间干净 fork 的用户吃惊。
