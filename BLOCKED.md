# BLOCKED.md — NAV-receiver-final 复核轮（2026-08-12）

## 未决技术决策

- **无**。D-NAV-01 在 153.0.4 + HEAD 94a9961 复核 VERIFIED/FIX；checker
  冻结（96dece47…）红→绿闭环；79 tests 0 FAIL；真 Firefox 3 轮 checker
  exit 0。

## 环境记录

1. 任务 0：firefox.exe=0；8891/8894/8901/18943 空闲；TEMP 无 hermes-verify-*。
2. 取证轮（21:15-21:16）与验证轮（21:20）：只终止带专属 marker
   （off-profile-navr / -start-debugger-server）或 web-ext 后代关系的 PID；
   每轮 newFirefoxAfter=[]。
3. 红 raw 归档：raw-baseline-red.jsonl（58a921af…）；checker 冻结后未改。
4. 红线遵守：D-redteam/、A2-P4-prototype-weakmap/、A2-P4-implementation/**
   零改动；production 之外仓库文件未动；无 push/merge/签名/发布。
