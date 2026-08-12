# A1 watchPosition 页面 ID 原生拟合 施工进度

1. 目标：消除 spoof watch 负 ID marker——页面 ID 单一文档级正整数单调不复用 namespace；native 内部 ID 只存映射。
2. 实现：watchSources 升级为 pageId→{source:'spoof',handler}|{source:'native',nativeId}；spoof 与 fakeGeo-native watch 同用 `++watchCounter`；clearWatch 按映射分源（native 转发内部 ID、spoof 删 handler、unknown no-op）；onChanged 重放遍历映射 spoof handler。改动仅 content-isolated.js。
3. 判卷：judge_v2 冻结（c8d52dfc→v2 b443cd56；v2 修 v1 的 clear 组 format bug + cb_at label 匹配）。红：未修 100de46 45 FAIL（on|seq 36 + on|toggle 9 全负 ID）；绿：candidate 5/5 组 0 FAIL。
4. 矩阵：off-seq/off-args/on-seq/on-toggle/on-clear/on-args ×3 fresh profile，全零残留；on-seq 每文档 [1,2,3] 与 off 同形态（refresh 重置）。
5. 测试：68/68（+4 A1 新增；2 处旧负 ID 断言最小替换已逐条列于 run-tests.js 注释）。
6. 验收：smoke/syntax 14/build 17/lint 0/0/0/diff-check 全绿；dist parity 80842a50。
7. 环境：Firefox 153.0.4；harness 3 处冻结后修订（threading import、gate URL 编码、probe clear 循环）均已记录于 judge-harness-freeze.json revisions。
8. 残留：0（测试 firefox/node 零残留、端口空闲）；用户树 PID 34784 全程未碰。
