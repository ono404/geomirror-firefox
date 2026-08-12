# F006-language-guard 施工进度

1. 目标：关闭 langEnabled=true 且 override 未到达时的宿主语言泄漏（空 storage 时 tz 已中性但 language 泄 zh-CN）。
2. 根因：loadFromStorage 空 override 置 locale/languages=null → langActive()=false → 语言 getter 委托原生；mergeProfile 只有 tz 守卫。
3. 修复：mergeProfile 加与 tz 对称的 locale/languages 守卫（langEnabled=true 且 locale 缺失时回填 base 或 BOOTSTRAP_PROFILE 中性值；langEnabled=false 不注入）。改动仅 content-isolated.js。
4. 顺序：任务0 验收全绿 → judge v2 冻结（baseline 红：on-empty 16 处 zh 泄漏 + ett 3 轮到达前泄漏）→ 实现 + 4 测试（64/64）→ candidate 矩阵 15 轮全绿 → 全套验收通过。
5. 证据：evidence/F006-language-guard/（judge-harness-freeze.json 7 文件冻结；runtime-baseline-red.jsonl 红 / runtime.jsonl 绿；judge-v2-result 红→绿）。
6. 最大风险已消解：UTC 规范化（Etc/UTC→"UTC"）、Collator 折叠（ja-JP→ja）、onChanged 先于 seed 事件 ~2ms（观测序列推导边界）、事件跨 run 累积（窗口隔离）。
7. 残留：0（测试 firefox/node 零残留；用户树 PID 34784 全程未碰）；Firefox 153.0.4。
