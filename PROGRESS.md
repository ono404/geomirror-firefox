# A2-P4 落地 production（实现轮，2026-08-12）

## 任务0 开工回执（≤10 行）
- 核对全过：HEAD=0b88c0e6…；status 3 用户 dirty + PROGRESS/BLOCKED；production content-isolated.js SHA=80842a50…e8e1；冻结 judge SHA=57ce80b6…9e72；68 tests 0 FAIL；smoke PASS；Firefox 153.0.4；web-ext 10.4.0；8891/8894/8901 空闲；firefox 用户树 20 进程无测试 marker（不触碰）。原始输出见对话。
- 原型：evidence/A2-P4-prototype-weakmap/prototypes/p4-recovery/（content-isolated.js SHA 66a76a2b…，相对 production +146/-24 四处 hunk：P4 机制段插入/删 READONLY_ACC/换 buildPosition/applyGeolocation 尾部挂 dispatcher；.production-orig SHA==production）。
- 目标：把 A2-P4（双 WeakMap + 统一 raw key + prototype getter/toJSON dispatcher + native miss delegation + 零 own-property position/coords）最小落入 production；structuredClone 残差为 LIMITATION。
- 顺序：1 冻结本轮判卷（独立副本 + wrapper + 反向验证 + 冻结 wrapper SHA）→ 2 最小落地 P4（目标与原型逐字节一致）→ 3 追加 ≥5 测试 + 独立 harness 真 Firefox 轮次 → 4 明卷 + 单原子 commit（4 个白名单文件）。
- 最大风险：runtime 轮次原生 geo 间歇超时（NOT TESTED 处理）；wrapper 语义与任务书措辞偏差；driver EXPECTED_HEAD 门禁在 commit 后失效（先跑后提交）；测试只允许追加。

## 任务1 冻结本轮判卷（18:4x 完成）
- 独立副本 evidence/A2-P4-implementation/：judge.py + 9 harness 文件逐字节同旧（SHA 复核 SAME）；frozen-raws/raw-baseline.jsonl（54555c57…）与 raw-p4.jsonl（707e02fe…）== 探索轮 recovery-run 原件。
- wrapper accept-a2p4.py：调用冻结 judge；off/disabled 零失败、enabled/reload 仅 *-CLONE-SEMANTICS、报告数 off≥6/enabled≥3/disabled≥3/reload≥3 才 exit 0。
- 反向验证（reverse-validation.log）：baseline→1（红 160/144）、P4 raw→0（仅 CLONE 12）、t1 删 2 条 off 报告→1（INSUFFICIENT）、t2 ownKeys 篡改→1（POSITION-OWNKEYS）、t3 accuracy→1（VALUE-accuracy）。
- 修正记录：上轮 t2 篡改路径无效（judge 读 enabledShape/position/position/ownKeys 内层；上轮改了外层死键），已重生成 t2 为内层 ownKeys=['coords','timestamp'] ×3 报告；wrapper 未动。
- wrapper 冻结：SHA256 dc5f22a5cc6b3071d553648e1ec877a5a8bdb369e7f9385a12692083f4c2d0b6（wrapper-freeze.json）；judge.py SHA 57ce80b6…9e72 复核 intact。此后 wrapper 不得修改。

## 任务2 最小落地 P4（19:0x 完成）
- 以统一 diff（4 hunk，+146/-24）git apply 外科式落地，非整文件覆盖；落地后 cmp 与原型逐字节一致（CRLF→LF 规范化后）；node --check 绿。
- **偏离记录（功能正确性优先）**：原型存在潜伏 bug——hunk2 删 READONLY_ACC 但 buildPositionError 仍引用（运行时 ReferenceError → spoof 错误回调被 try/catch 吞掉，页面收不到 error）。运行时探针只用 mock provider 成功路径，故 3 轮判卷未暴露。已恢复 READONLY_ACC，仅限 PositionError 使用（position/coords 保持零 own 属性）；旧 STRUCTURAL 测试因此无需改写仍绿。其余 hunk 与原型完全一致。
- 保留：A1 正 watch ID（watchSources 映射）、F006 language guard、font mask、F011 DNR、PermissionStatus 全部原样；diff vs HEAD 仅 4 hunk +146/-24（+README_ACC 恢复段）。

## 任务3 测试追加（19:0x 完成）
- 只追加不改写：8 个 P4 结构/语义回归测试（零 own accessor、WeakMap 隔离与 raw key、getter/toJSON dispatcher、native miss delegation、structuredClone/DataCloneError 未伪装、READONLY_ACC 仅限 PositionError、dispatcher 文档级安装）。
- 合计 76 tests（≥73）、0 FAIL/skip/todo；smoke PASS。

## 任务3 真 Firefox 轮次（19:1x 完成）
- `python run_a2-recovery.py --rounds 3`（production source，HEAD 门禁 0b88c0e 通过）：3 轮全有效（3 fresh off + 3 fresh on，0 NOT TESTED）；每轮 newFirefoxAfter=[]；8891 空闲、8894/8901 未用。
- 冻结 judge exit 1（预期）：off 0 / enabled 6 / disabled 0 / reload 6 fails，12 fails 全部为 POSITION/COORDS-CLONE-SEMANTICS（每有效 enabled/reload 报告恰 2 项）。
- wrapper（冻结 dc5f22a5…）exit 0；harnessExactMatch=true ×3（运行时证据逐字节属于提交源 18fe612a…）。
- 证据：REPORT.md、raw-candidate.jsonl（e839972d…）、judge-candidate.log、environment-recovery-r1..3.json、driver-recovery.log。
- 轮次 PID：r1 off 34056/on 8080→19644；r2 38752/37392→27824；r3 38032/31504→9212（仅终止本轮根及子树）。
- 下一步：任务4 明卷 + 单原子 commit（4 白名单文件；3 用户 dirty 不入库）。

# A2-P4 prototype+WeakMap 探索进度（接管恢复轮）

## 接管核查（2026-08-12 18:0x，只读完成）

1. HEAD=`0b88c0e6d2b201a3241d8d5116e18ce543b62890` ✓；status=3 用户 dirty（.gitignore/AGENTS.md/docs/FIREFOX_BUGFIX_HANDOFF.md）+PROGRESS/BLOCKED ✓。
2. 进程：21 个 firefox.exe 全部归属单一用户树（根 5772，17:40:53 启动，无任何测试 marker，20 contentproc 全为其子进程）→ 用户树未触碰；无 web-ext/node/server.py/run_a2 测试进程；8891/8894/8901 全空闲；TEMP 无 hermes-verify-*；free 2534MB。
3. run_a2.py vs .from-a2shape 差异仅 4 处且全部可解释（off wait 55→180、on wait 75→240、--rounds 默认 1、--off-only），其余 harness 文件与原件/旧轮完全一致 → 全部可继承。
4. 废弃清单：diag-serial.py/diag-decisive.py/diag-mozlog.py、off-profile-diag*/mozlog、raw.jsonl（1 行 storage-set）、off-profile 旧目录——环境诊断失败证据，保留未动。
5. 缺失 probe.html → 从 .from-a2shape 恢复（SHA f00d583a... == 旧轮冻结值）。
6. task0-freeze：prod/dirty/dist 10 项 SHA 全匹配；旧 evidence 自冻结后零改动。
7. 环境恢复：用户树 17:40 起正常，内存 2534MB，端口空闲；16:28 卡死未复现。

## 轮次记录

- **Smoke（18:10）**：`python run_a2-recovery.py --rounds 1 --off-only` → off-doc1/2 完整报告 + on 轮 sentinel/storage-set 三次切换；页面 GET ✓、sentinel ✓、完整 position 报告 ✓；`newFirefoxAfter=[]`。环境恢复确认（off 18s、on 14s）。
- **基线矩阵（18:11-18:16）**：`--rounds 3` + `--rounds 7 --only 4,5,6,7`（原生 geo 间歇 4s 超时轮按 NOT TESTED 计数，不折叠）→ off 12 有效（4 NT）、enabled 8、disabled 6（2 NT）、reload 8；每轮零残留、端口归零。
- **judge a2-p4-recovery-v1 冻结（18:18）**：off/disabled 绿（0 fails）；current enabled 160 fails / reload 144 fails（ownKeys/toJSON/getter receiver 红点全命中）；篡改反向验证 T1 删行 INSUFFICIENT、T2 篡改 ownKeys、T3 篡改 accuracy 全判红（selfcheck/）；judge+harness SHA 冻结于 judge-harness-recovery-freeze.json（复核 intact）。
- **P4 实现（18:14-18:16）**：`prototypes/p4-recovery/`（production 副本，SHA 80842a50... 保留于 .production-orig；geolocation 段改为 prototype dispatcher + 双 WeakMap + geoKey 规范化 + 页面 realm 严格 trampoline；diff 仅 4 处：插入 P4 机制段/删 READONLY_ACC/换 buildPosition/applyGeolocation 挂 dispatcher）。
- **P4 判卷（18:2x）**：`python run_a2-recovery.py --rounds 3 --source prototypes/p4-recovery` → 3 轮全有效；`python extract-p4-raw.py`（wallTs 过滤，judge 未动）→ 冻结 judge：off 0 / enabled 6 / disabled 0 / reload 6 fails，**12 fails 全部为 *-CLONE-SEMANTICS**；关闭清单见 REPORT.md；wrapperDiffs 99 条全为 source/stack（record-only）。
- **裁决：LIMITATION**（structuredClone 语义为 WebIDL slot 行为，任何 JS 对象不可伪造 DataCloneError；3 轮×6 次稳定 = 三次止损）。旧 INCONCLUSIVE 交付物归档：REPORT.md.inconclusive-20260812-1704.md、final-summary.json.inconclusive-20260812-1704.json。
- **完成门槛（18:2x）**：68 tests 0 FAIL、smoke PASS、syntax 全绿、build 17、lint 0/0/0、diff --check 干净、dist parity（background.js SHA 3e5ce9fd...）、prod/dist 对 task0-freeze 0 mismatch、端口/测试进程/hermes-verify 全 0。

## 关键文件

- 裁决：REPORT.md（LIMITATION）+ final-summary.json
- 冻结：judge-harness-recovery-freeze.json（judge.py SHA 57ce80b6...）
- raw：recovery-run/raw-baseline-archive.jsonl（基线）/ raw-p4.jsonl（P4）/ raw.jsonl（全量）
- 判卷输出：judge-baseline-red.log、judge-p4.log、judge-result-baseline-red.json、judge-result-p4.json
- 原型：prototypes/p4-recovery/（content-isolated.js + lib/ + .production-orig）
