# BLOCKED.md — A2-P4 落地 production 实现轮（2026-08-12）

## 未决技术决策

- **无**。wrapper 反向验证全过（baseline 红 / P4 绿 / t1-t3 篡改红）；
  真 Firefox 3 轮全有效，12 fails 全为 CLONE-SEMANTICS（LIMITATION）。

## 环境记录

1. 任务 0（18:45）：用户 Firefox 树根 5772（17:40:53 启动，19 contentproc）
   存在且未触碰；8891/8894/8901 空闲。
2. 实现轮轮次（18:52-18:54）：harness 只终止带专属 marker
   （off-profile-recovery / -start-debugger-server）或 web-ext 后代关系的
   PID；每轮 newFirefoxAfter=[]。
3. **用户 Firefox 树在 18:45–19:00 间消失（当前机器上 0 个 firefox 进程）**：
   harness 的 terminate_tree 目标均有专属 marker/父子归属，不可能触及
   用户树；判定为用户自行关闭。若后续轮次需要用户树并存环境，重新确认。
4. 红线遵守：旧 evidence/A2-P4-prototype-weakmap/** 未动；production/test
   之外仓库文件未动；无 push/merge/签名/发布。
