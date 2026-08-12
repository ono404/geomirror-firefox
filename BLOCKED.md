# BLOCKED.md — A1 watchPosition 页面 ID 原生拟合

## 未决技术决策

- 无。A1 已完成并通过冻结 judge 红→绿（45 FAIL → 0 FAIL）。

## 环境记录

1. Firefox 153.0.4；用户树根 PID 34784 红线全程未碰（任务期间树自增 contentproc 均为用户进程，父链验证过）。
2. **web-ext --start-url 的裸 `&` 会被截断**（F006 轮因探针参数默认值恰好掩盖）：start-url 一律经 /gate（target 参数 urllib.parse.quote 编码），gate JS 解码跳转。F006-language-guard 轮的 probe URL 同险，已在其 driver 用 gate 规避。
3. web-ext 临时 profile 路径不含 "firefox-profile" 字样——旧 stop 匹配条件漏杀；统一改为「tasklist before-set + `-start-debugger-server` + 非 contentproc」判定，taskkill 返回码检查 + 6 次重试。
4. wmic 本机间歇返回空 CSV；进程归属以 node tasklist 为准。
5. patch 工具对 new_string 的正则反斜杠翻倍落盘（本轮回踩）：含正则字面量的断言一律用 python 按行号重写（raw string），不经过 patch 层。
6. 探针陷阱：clear 循环不得遍历正在增长的 log（recordClear 也 push）——用 watch ID 快照数组。
7. 判卷要点：partial 快照报告不参与判定；watchSources 值已从字符串升级为 entry 对象。
