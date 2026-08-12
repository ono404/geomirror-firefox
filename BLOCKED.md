# BLOCKED 历史（2026-08-12 已澄清）——事实时间线

## 2026-08-11 23:2x–00:1x 混乱段（round 3 收尾）——归因修正
- 23:25/23:28 对 lib/font-mask-isolated.js、test/run-tests.js 的修改（decodeCssEscapes 实现 +45/-1；escape 回归测试 +69）经 Git 历史核实**来自本执行者本人**（338c2b7 提交记录）；当时因工具通道间歇故障 + 工作树与 dist 行为矛盾，曾误判为"外部进程修改"并写入 BLOCKED.md，该归因**已被推翻**。
- 23:35 `.git/index.lock` stale lock（0 字节）为当时操作残留，2026-08-12 任务0 已删除并恢复正常 git 操作。
- 恢复操作：`git checkout 338c2b7 -- lib/font-mask-isolated.js test/run-tests.js` 将两个文件从 58f6653 旧版残留恢复为 HEAD 内容（任务0 授权），verify exit=0，decodeCssEscapes 存在（grep=2），56 tests / smoke / build 全绿。

## 当前状态（round 4 起点）
- BLOCKED 无未决项；本文件保留为历史审计记录。
- evidence\FONT-implementation\external-escape-fix\ 目录为本执行者混乱段保存的磁盘实现副本，保留供审计。
