# BLOCKED.md — F006-language-guard

## 未决技术决策

- 无。本轮目标（空 storage 宿主语言泄漏守卫）已完成并通过冻结 judge 红→绿。

## 环境记录

1. Firefox 自动升级 153.0.3 → 153.0.4（`firefox.exe --version` 实测）；本轮全部证据标注 Firefox 153.0.4。
2. wmic 本机间歇性返回空 CSV；进程归属以 node tasklist PID 集合为准，cmdline 仅作辅助（父链验证用 wmic 单 PID 查询可用）。
3. 用户 Firefox 树（根 PID 34784）全程红线未触碰；任务期间树自增 5 个 contentproc（ppid=34784），非测试残留。
4. bash 路径尾反斜杠会转义引号；避免路径尾 `\`。
5. 沿用 F006 轮：fresh profile 首跑挂起需整模板 user.js（仅 direct-launch 模式；web-ext run 自带 profile 正常）；内容脚本 fetch 被静默阻断（background fetch 正常，seed 是 background fetch）；双 python server 可同时 LISTEN 8894（启动前查端口）；RDP listAddons 走 root actor（本轮未用 RDP）。
6. Firefox 将 Intl resolvedOptions 的 Etc/UTC 规范化为 "UTC"；Collator 将 'ja-JP' 折叠为 'ja'——判卷须按规范化值。
7. 内容脚本 storage.onChanged 生效先于 seed 的 storage-set-done POST 约 2ms——到达边界须从观测序列推导，勿用事件时钟。
