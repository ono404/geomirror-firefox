# GeoMirror Firefox current status

## 本轮：1.2.5 最终安全收口核实（final-callable-closure，2026-08-16 开工回执）

- 目标：关闭剩余的 raw-page callable 信任问题——(a) 页面提前 poisoning 后 Xray `window.Function` vs `rawWin.Function` 的真实语义；(b) call-time `.call/.apply/member` lookup 是否可被页面截获；(c) makePageFn wrapper 内 impl/realQuery/JSON.parse/supportedLocalesOf 的 realm 归属；(d) about:blank pre-injection 时序窗口，分别裁决后做最小修复。
- 顺序：基线核对（已完成，全部相符）→ P0 事实核实（fresh Firefox 最小实验，逐项 VALID/SUPPRESSED/PLATFORM/NOT APPLICABLE）→ 对 VALID 项 RED→GREEN→RED→GREEN 最小修复 → 全量回归 + hostile callable matrix + fresh Firefox 验收 → 白名单 diff 检查 → commit → push my-private → 只读确认 PR #6。
- 最大风险：把「Xray 不可靠」或「时序窗口可消除」的未证实假设当结论；修复破坏 function name/length/prototype/instanceof/WebIDL parity；未复现却重构稳定代码。全部以实测为准，未复现记 SUPPRESSED。
- 基线：HEAD 515c21a、content-isolated.js SHA abc74259…c768e、90 tests/0 skipped、smoke PASS、build 17、lint 0/0/0、diff-check PASS、工作区干净（与任务书任务 0 完全一致）。
- 证据目录：`../evidence/firefox-security-1.2.5/final-callable-closure/`（唯一新建许可）。

## P0 事实核实完成（2026-08-16 21:3x，r8–r10 fresh Firefox 153.0.4 实测）

- **注入之谜已解**：19:34 唯一成功轮（r1）与全部失败轮（r2–r7）的差异 = manifest `matches/host_permissions` 用 `<all_urls>` 还是 `http://127.0.0.1:19071/*`。Firefox match pattern **不支持端口**：带 `:19071` 的 pattern 不匹配任何页面 → content script 永不注入；`<all_urls>` 注入。r6 起全部轮次 globals/protos/blank ok=True。r5 的「失败」另有原因：残留 server（PID 14268，web-ext run 遗留）劫持 19071，新 server 绑定失败、Firefox 请求写进 webext-run/（其 raw.jsonl 有 cs-arrival 证据）。已清理残留进程。
- **Q1（页面提前 poisoning 后 Xray vs raw，r9/r10 globals 页）**：
  - `window.Function/Promise/EventTarget`（Xray 视图）→ 宿主原版：`xrayWrappedIsOrig=true`、`new window.Function('return 123')→123`、Promise/EventTarget 构造成功。页面替换 window.Function 不影响 Xray 视图。
  - `window.wrappedJSObject.Function/Promise/EventTarget` → 页面 trap：`rawIsTrap=true`、`rawWin.Function('return 456')→not-fn`（trap 返回 undefined）。
  - `window.Reflect.apply`（Xray 视图）→ **undefined**（调用 TypeError；未 poison 页面同样 undefined——Firefox Xray 对 Reflect.apply 的既有行为）；`rawWin.Reflect.apply` → 页面 trap。
  - **裁决：Q1 = VALID（raw 视图在页面替换后是 trap）+ PLATFORM（Xray 视图 Reflect.apply 恒 undefined）。生产代码已在 document_start 一次性捕获 pageFnCtor 等（T1 fix），页面无法在捕获前替换（content script 先于页面脚本）→ 捕获路径 SUPPRESSED（无需改）**。
- **Q2（capturedPageFunction.call 是否被页面 Function.prototype.call 截获，r9/r10 protos 页）**：
  - isolated world 内 `window.Function.call(...)`（Xray 视图）→ 7、trapped=0 → **不被截获**（Xray 保护 .call 属性）。
  - isolated world 内 `rawWin.__orig.F.call(...)`（raw 视图捕获的原始构造器）→ **not-fn、trapped=1 → 被截获**。
  - 直接调用 `rawOrigFn('return 9')` → 9、trapped=0 → 直接调用不经 .call，不被截获。
  - **裁决：Q2 = VALID（raw 视图函数 .call 被页面 Function.prototype.call 截获）；但生产代码在 isolated side 调用 .call 的对象（origTZO、navLangDesc.get、h 等）均为 Xray 视图 → 不受影响（r9 证据），SUPPRESSED 于生产路径**。
- **Q3（makePageFn 生成的 page-realm wrapper 内 realm 归属，r9/r10 protos 页）**：
  - `impl.call(this)`、`impl.apply(this, arguments)`、`realQuery.call(perms,...)`、`JSON.parse(...)`、`supportedLocalesOf.apply(realCtor, arguments)` 全部 **trapped=1、结果 undefined**（JSON.stringify 丢弃 undefined 字段）→ **全部受页面 realm 控制，页面替换 Function.prototype.call/apply 或 window.JSON.parse 后全部被截获**。
  - globals 页（只替换 window.Function 等、不替换 prototype）→ 全部正常（impl-ok/promise/{"a":1}/apply-ok）→ 截获面 = Function.prototype.call/apply + JSON.parse 的替换。
  - **裁决：Q3 = VALID**。生产代码全部 8 处 wrapper 内 `.call/.apply/JSON.parse` lookup 均在页面 realm → 页面可在 content script 之后替换这些 intrinsic，迫使 GeoMirror getter/query 返回 undefined（控制返回路径，无 host 数据泄漏但破坏功能）→ **任务 2 修复对象**。
- **Q4（空 about:blank iframe 时序，r8/r10 blank 页）**：
  - 实测顺序：parent `appendChild(ifr)`（t0）→ parent 首次读 child（firstRead）→ **child content script 到达（cs-arrival, poisonDoneAtArrival=false）早于 parent `eval(poison)` 约 8ms** → parent-poison-eval → parent-late-read（3s 后，childPoisonDone=true）。
  - **裁决：Q4 = PLATFORM（Firefox 时序窗口存在且可测量：child content script 先于 parent 的 child-realm poison 注入）；产品信任完整性 = 不成立（GeoMirror 的 document_start 捕获先于任何页面脚本；about:blank child 仅报告到达，不执行检测逻辑）→ NOT APPLICABLE 于生产路径，记录为平台事实**。
- harness 修复记录：`</script>` JSON 转义（`<\/script>`）、`document.body||document.documentElement`（head 期 body null）、trapCount 去 `.filter/.map`（页面数组方法 Xray 拒绝）、sloApply wrapper 形态对齐生产（`r.apply(r,args)`）。r8–r10 全绿。
- 证据：`../evidence/firefox-security-1.2.5/final-callable-closure/rounds/r1..r10/`（r1=19:34 原始证据；r8/r9/r10=完整数据轮；bisect-run/=逐表达式定位轮）。

## 任务 2 完成（2026-08-16 21:5x）：wrapper 内 call-time lookup 最小修复

- **VALID 面（Q3 实测）**：8 处 makePageFn wrapper 体内 `.call/.apply/JSON.parse` 属性查找，页面替换 Function.prototype.call/apply 或 window.JSON.parse 后全部被截获（语言 getter→undefined、Intl 构造→坏实例 TypeError、supportedLocalesOf→undefined）。
- **修复（content-isolated.js，白名单）**：document_start 一次性捕获 `pageJSONParse = rawWin.JSON.parse` 与 `pageInvoke = exportFunction((fn,self,args)=>Reflect.apply(fn,self,args), rawWin)`（isolated-side 帮手，宿主原版 Reflect）；全部 8 处 wrapper 改为 `invoke(impl, this, arguments)` / `parse(json)` 闭包参数直接调用，零 call-time 成员/全局查找；supportedLocalesOf 成员在捕获点取（realDTF/realNumFmt/realCol）。
- **RED→GREEN→RED→GREEN 原始证据（hostile-run/，fresh Firefox 153.0.4）**：
  - RED#1（旧实现 abc74259/299b87d2 进 diag-ext hostile 页）：language/languages/slo=undefined、dtf/numFmt=TypeError。
  - GREEN#1（修复版 21c21d89→80bc3757 副本）：language=en-US、languages=en-US,en、tzo=0、slo=en-US、dtf=UTC、numFmt=1,234.5 全恢复。
  - RED#2（项目外临时副本 git show HEAD 旧版再跑）：同 RED#1 全部复现。
  - GREEN#2（修复版恢复）：同 GREEN#1 全绿。
  - 生产工作区从未加载旧实现（旧版只在 evidence 项目外副本）。
- **功能矩阵（matrix-run/，修复版 + Paris/Tokyo profile）**：tz=Europe/Paris、tzo=-120、lang=fr-FR、langs=fr-FR,fr、slo=en-US、perm=granted、geo=pos:48.8566,2.3522,acc:29.5、watch 2 次后 clearWatch 生效（callbacksAfterClear=0）；动态切换 Asia/Tokyo+en-US 生效（tz=Asia/Tokyo、tzo=-540）。Accept-Language 面 = languages 数组与 profile 一致 ✓。
- **静态回归**：91 tests passed/0 skipped（新增 1 条 T-FINAL wrapper 模板无截获断言 + 加强 NPO hook 断言为 invoke 闭包形态）、smoke PASS、全部 node --check PASS、build 17、lint 0/0/0、git diff --check PASS。
- **harness 限制（已记录，非产品问题）**：temporary addon 无 background，跨 document storage.onChanged 广播未验证（self-set 同一文档触发正常）；子 frame profile 传递依赖 background runtime 消息（T2-cross-realm 已有独立证据），本 harness 不覆盖；权限 pending 路径 = T2A 既有原始证据，未重做。
- 证据：`../evidence/firefox-security-1.2.5/final-callable-closure/{rounds/r1..r10,bisect-run,hostile-run,matrix-run}/` + `diag-ext/prod/`（旧版 299b87d2 与修复版 80bc3757 副本）。


## 最终治理收口（2026-08-16，final-governance-closeout，当前有效口径）

- **三轴裁决**：PRODUCT **ACCEPT**（修复行为真实有效）；EVIDENCE CRYPTOGRAPHIC AUTHENTICITY **REJECT**（证据目录不能密码学自证历史）；OPERATIONAL RELEASE READINESS **ACCEPT**（可信独立执行者 + 管理锚防锚后改动的运营模型下）。
- **当前发布状态**：修复阶段已结束，1.2.5 源码提交 `7c97f22` 已推送到 `agent/release-firefox-1.2.5` 并进入 PR #6，Firefox CI 已通过。尚未授权合并、Mozilla 签名、发布或永久安装；最后正式版仍是 1.2.4。
- 完整模型与裁决：`../evidence/firefox-security-1.2.5/final-governance-closeout/SECURITY_MODEL.md` 与 `FINAL_REPORT.md`；最终锚 `FINAL_ANCHOR.json`。
- 历史口径修正：下文 2026-08-14 的"v2 PRODUCT ACCEPT + EVIDENCE ACCEPT"中，**EVIDENCE ACCEPT 已撤销**（v3 报告 2026-08-15 实测 v2 链可旁路）；PRODUCT ACCEPT 经两次独立 fresh 运行复核维持。
- v3 证据链边界：judge 只能验证目录内部一致性（52 项部分伪造全 RED），不能认证历史真实性——完整自洽伪造（c07/c09b）被四 judge 接受，攻击验收 **REJECT**（保留，不改称通过）。非攻击检查 **ACCEPT**（manager-review-v3-ai2，四任务各3轮 fresh Firefox 全 PASS）。

## 独立正式验收 v2（2026-08-14 开工回执，10 行内）

- HEAD d885ab4140f82fee211988c9cbbdfbd2a67182fe，main...my-private/main，11 白名单改动未提交。
- content-isolated.js SHA 91efbc55…、background.js 70101a7d…；双 manifest=1.2.5。全部相符。
- 基线复跑：89 tests/0 skipped、smoke PASS、13 syntax PASS、build 17 文件、lint 0-0-0、diff-check 绿、包内 bridge/inject=0。
- 旧 judge SHA 复验：T1 fe163c1f…952c2、T2 4bf66d10…04dec（只读，不修改）。
- 计划：T1 重建自包含+源码绑定 v2 证据链（fresh profile 各 3 轮 + 5 类来源攻击全 RED）→ T2 两裁决（Promise 成员篡改、跨 frame 动态更新）→ T3 收口 REPORT。
- 证据目录：../evidence/firefox-security-1.2.5/independent-acceptance-v2/（唯一新建许可）。

## 独立验收 v2 进行中（2026-08-14 18:xx）

- v2 证据链架构完成并自检：每轮自包含（round.json/env.json/ext/raw.jsonl/sha256sums.txt），
  roundId 绑定所有 raw 行；judge 重算 ext SHA + 复取 manifest 关键字段；链自检 5 攻击全 RED。
- T1-callable-v2：3 轮 GREEN（judge-v2.py exit 0，host=Asia/Singapore，cis=91efbc55…），
  5 类来源攻击全 RED、还原 GREEN（ATTACK_RUNNER PASS）。
- T2A-promise-member-v2 实测（immediate-seed 3 轮，归档 run-t2a-immediate-seed-20260814）：
  **member 篡改成立 3/3**——扩展 call-time 调用页面替换的 Promise.resolve 成员（3 次），
  参数仅为 page-realm PermissionStatus（state=granted，无 host 值），marker 模式证明
  扩展 query 输出被页面控制（control.marker=True）。pending 路径当时未触发（storage 先就绪）。
- harness 加固（driver+serverlib）：每会话重置 seeded.flag（消除 probe 先于安装的竞态）；
  promise-pending 会话 /ipapi 慢 6s（确定性制造空 storage 窗口）；probe 名可配置
  （matrix/switch 探针 404 修复）。T1/T2A/T2B 已用加固 harness 重跑中；T2-matrix 旧轮
  （probe 404 无效）已归档 run-matrix-probe404-20260814，待重跑。

## T2A 裁决：FIX 成立（2026-08-14，成员捕获最小修复）

- **冻结 judge**：T2A-promise-member-v2/judge-v2.py SHA `bff6fcb0…28f5`（先于修复冻结）。
- **current=RED**（加固 harness 3 轮，exit 1，10 fail）：member 篡改下扩展 call-time 调用
  页面替换的 Promise.resolve 成员（3/3 轮，每轮 3 次），marker 模式证明 query 输出被页面
  控制（marker=True、controlReturned=True）；参数仅为 page-realm PermissionStatus
  （state=granted、ownKeys=0、toJson={}，无 host 值、无扩展侧对象）。
- **pending 路径实测不可拦截**（慢 mock 制造空 storage 窗口）：`new window.Promise(executor)`
  经 Xray 使用页面 intrinsic，页面替换的 Promise 构造函数从未被调用（ctorCalls=0 ×3 轮、
  ctorCallsAtQuery=0），查询仍正确返回 granted——无需修复，记录为负证据。
- **candidate=GREEN**（3 轮，冻结 judge exit 0，cis=`abc74259…`）：content-isolated.js 捕获
  `pagePromiseResolve = rawWin.Promise.resolve`（document_start），ready 路径改用
  `pagePromiseResolve.call(pagePromiseCtor, buildPermissionStatus())`；member calls=0、
  control 无标记、perm granted、sentinel 全绿；消息面/页面可见面零增加。
- **restore=RED**（恢复旧行为 `pagePromiseCtor.resolve(...)`，1 轮）：member calls=3、
  marker=True → 冻结 judge exit 1（4 fail）；修复已还原，T2A 再全 GREEN。
- 静态：90 tests/0 skipped（新增 1 条 STRUCTURAL 成员捕获断言）、smoke/syntax 绿。
- 其余：T1/T2-matrix/T2B 用最终源码（abc74259…）重跑中。

## 独立验收 v2 — 完成（2026-08-14，历史记录：PRODUCT ACCEPT + EVIDENCE ACCEPT；其中 EVIDENCE ACCEPT 已于 2026-08-15 被 v3 报告撤销，见顶部最终口径）

- T1-callable-v2 最终（cis=abc74259…）：3 轮 GREEN，judge `265a72fd…` exit 0；5 攻击全 RED、还原 GREEN。
- T2A 修复闭环：冻结 judge `bff6fcb0…`；current RED（10 fail）→ candidate GREEN（3 轮 exit 0）→
  restore RED（4 fail）→ 还原 GREEN；pending 构造路径实测不可拦截（Xray intrinsic，负证据 3 轮）。
- T2-matrix-v2 最终：3 轮 GREEN，judge `5d0c99a8…` exit 0（13 realm；data-popup 显式平台阻断记录）；
  5 攻击全 RED、还原 GREEN。
- T2B-switch-v2 最终：3 轮 GREEN，judge `d3f0c9b5…` exit 0——8 可修复 frame 东京→巴黎 3/3
  （initial-final/switch-final 均 forced=False），C 类（worker/sharedworker）恒 host 记录，
  data-popup=平台阻断记录；seed 诊断证明 storage.onChanged→广播链生效；5 攻击全 RED、还原 GREEN。
- 平台事实细化（BLOCKED.md/TECHNICAL.md）：Firefox 153 阻止顶层 data: 导航（popup 停留 about:blank，
  href=''，脚本不执行）——旧“data-popup=host 值”记录为空转读数；C 类记录改为显式平台阻断。
- 收口：90 tests/0 skipped、smoke、13 syntax、build 17、lint 0-0-0、diff-check 绿、包内 bridge/inject=0、
  双 manifest=1.2.5、越界改动=0（仅白名单 11 文件）；测试 Firefox 残留=0、v2 端口无监听。
- 报告：`../evidence/firefox-security-1.2.5/independent-acceptance-v2/REPORT.md`（历史记录：PRODUCT/EVIDENCE 双 ACCEPT；EVIDENCE ACCEPT 已撤销——v2 链 live-source binding 受条件式 isdir 旁路，见 v3 报告）。
- 未 commit/push/merge/tag/sign/install；1.2.5 仍为本地源码（未签名版本 1.2.4 不变）。

## 本轮：Firefox 1.2.5 page-realm callable 信任边界 + 跨 realm 矩阵 — 2026-08-14 开工回执

- 目标：先证明、再修复 isolated runtime 的 page-realm callable 信任边界与跨 realm 地域一致性；保持 isolated-only，通过后源码升 1.2.5。
- 顺序：T0 基线 → T1 callable 篡改 probe/审计/裁决 → T2 跨 realm 矩阵/裁决 → T3 收口。
- 最大风险：Firefox 平台限制或需高风险架构才可解的现实泄漏 → 归 C/B 如实 BLOCKED，不伪造修复。
- HEAD `d885ab4140f82fee211988c9cbbdfbd2a67182fe`（main==my-private/main，工作树干净）；content-isolated.js SHA-256 `ddcf60c94c…cdd9954`。
- 基线：89 tests / smoke PASS / 13 syntax 0 失败 / build 17 文件 / lint 0-0-0 / `git diff --check` clean；双 manifest=1.2.4。

## T1 进行中（2026-08-14）：harness 建成 + 首轮发现

- harness：`../evidence/firefox-security-1.2.5/T1-callable-trust/`（server 18971 / RDP 18972 / BiDi 18973；
  直接启动 + RDP installTemporaryAddon；生产 background+content 逐字节复制，仅 providers/geo 指向本地 mock；
  seed 写东京 profile 到 storage.local；gate 等待 seed 完成后再导航 probe）。
- 审计（audit.md）：rawWin/wrappedJSObject/exportFunction 全部 56 处按 CAPTURE/DATA-READ/EXECUTION 分类；
  3 类 call-time 执行候选：`makePageFn`=live `rawWin.Function`（39 行，tzOffsetMinutes 每次调用把
  realDTF 传进 page 函数）、`buildPermissionStatus` live `rawWin.EventTarget`（775/792 行）、
  `rawWin.Promise.resolve`（841 行）；另有 3d：`fn.prototype = realProto` 使
  `Intl.X.prototype.constructor` 直指 REAL 捕获构造器。
- 首轮实测（Firefox 153.0.4，host=Asia/Singapore+zh-Hans-CN）：**3d 泄漏成立**——on-clean/on-fn 轮
  `Intl.DateTimeFormat.prototype.constructor` 非 live 且 `new (它)().resolvedOptions()` 返回
  真实 host tz/locale（Asia/Singapore / zh-Hans-CN），页面 spoof 面仍显示 Tokyo/ja-JP；NumberFormat/
  Collator 同；dtfProtoCtorIsLive=false（shape parity 破坏）。fn tamper 轮因 harness 404 未捕获
  spy 数据（harness 修复中：tamper 文件名映射、tamper 字段名冲突、storage 竞态 gate /ready）。
- 归档：`ct-run-r1-broken-harness/`（首轮含 harness bug 数据，不用于裁决）。

## T1 裁决：FIX 成立（2026-08-14，四类 crossing 全 RED→candidate GREEN→restore RED）

- **冻结 judge**：`T1-callable-trust/judge-callable.py` SHA `fe163c1f…952c2`（先于候选实现冻结；
  一处 freeze amendment：Collator 规范 locale ja-JP→ja，断言改为与 live 面值一致）。
- **current=RED**（3 轮 15 会话，`run-current-red/`，99 fail）：
  1. `Intl.X.prototype.constructor` 直指 REAL 捕获构造器——零篡改即可 `new (protoCtor)().resolvedOptions()`
     取回真实 host tz/locale（Asia/Singapore / zh-Hans-CN）——真实地域泄漏（on-clean ×3）；
  2. 页面替换 `window.Function` 后，扩展 call-time `makePageFn` 走 live Function 11 次，其中 2 次把
     捕获的 realDTF 传入 page 函数（rawFnArgCount=2），由它派生真实 host 值——capability crossing（on-fn ×3）；
  3. `rawWin.Promise.resolve` call-time 执行页面代码（resolveCallCount=1，on-promise ×3）；
  4. `buildPermissionStatus` call-time 构造页面 EventTarget（ctorCallCount=1，on-eventtarget ×3）。
  所有轮次 sentinel 绿（Tokyo/ja-JP 收敛）、marker=0、页面 spoof 面正常（篡改透明）。
- **candidate=GREEN**（`run-candidate-green/`，exit 0；candidate content-isolated.js SHA `0fe82d7f…`）：
  修复=捕获 pristine page callables（pageFnCtor/pagePromiseCtor/pageEventTargetCtor）用于全部 call-time
  构造 + `fn.prototype=realProto` 后把 realProto.constructor 重指 live wrapper（原生 parity 恢复）。
- **restore 反向**：`src-restore-live-fn`（仅恢复 live Function 查找）RED 9 fail、
  `src-restore-protoctor`（仅移除 constructor 闭包）RED 84 fail——judge 非空转且能单点判别。
- **最终源码复验**：`run-final-t1-green/` judge PASS（final SHA `91efbc55…`）——T2 改动无回归。

## T2 裁决：FIX 成立（2026-08-14，current RED→candidate GREEN→restore RED）

- **冻结 judge**：`T2-cross-realm/judge-matrix.py` SHA `4bf66d10…`（基于真实测量冻结；
  C 类 realm 契约=必须记录且等于 host 值）。
- harness：13 realm（top/so-iframe/xo-iframe/about-blank/srcdoc/blob-iframe/data-iframe/
  sandbox-blank/about-blank-popup/blob-popup/data-popup/worker/sharedworker），同源轮询读取、
  跨源 postMessage；off 基线 3 轮 + on 各 3 轮。
- **current=RED**（`run-mx-current-red/`）：about:blank/srcdoc/blob/data/sandbox 及 popup 类 realm
  全部暴露真实 host（zh-CN/Asia/Singapore/-480）；http 子 frame wrapper 卡 bootstrap（UTC）
  ——稳定 host/target 矛盾。
- **平台事实（diag 实测）**：Firefox 153 子 frame content script 的 `chrome.storage.local.get`
  报 "An unexpected error occurred"、onChanged 全哑；`runtime.sendMessage` 在每类 realm 都通。
- **candidate=GREEN**（`run-mx-candidate-green/`，exit 0）：
  1. manifest.firefox.json 增 `match_about_blank`+`match_origin_as_fallback`（A 类）；
  2. content-isolated.js 经 runtime 消息向 background 请求 profile 快照 + onMessage 收更新推送
     （B 类，子 frame storage 死路替代通道；页面 MAIN world 无法收发，无新页面面）；
  3. background.js storage.onChanged 广播（tabs.query/sendMessage 到所有 frame）。
  修复后除 C 类 realm 外全部收敛 Tokyo/ja-JP，marker=0。
- **restore=RED**（`run-mx-restore-red/`）：旧行为复现 RED。
- **C 类平台限制（如实记录，不伪造修复）**：worker/sharedworker 无 content script 通道；
  顶层 data: 文档 opaque origin 无法匹配——恒读真实 host（judge 以 C 契约断言记录，
  BLOCKED.md/TECHNICAL.md 已文档化）。
- **最终源码复验**：`run-final-matrix-green/` judge PASS（final SHA `91efbc55…`）。

## T3 收口（2026-08-14）

- 双 manifest 同步 1.2.5（manifest.json 仅版本同步；Firefox 字段只进 manifest.firefox.json）。
- 最终静态：89 tests / smoke / 13 syntax / build 17 文件 / lint 0-0-0 / `git diff --check` clean；
  test/run-tests.js 仅扩展 vm sandbox storage.onChanged stub（环境完备，无断言放宽）。
- 最终运行：T1 judge PASS + 矩阵 judge PASS（同一最终源码 SHA `91efbc55…`）。
- 证据根：`../evidence/firefox-security-1.2.5/`（T1-callable-trust/、T2-cross-realm/）。
- 1.2.5 为本地源码状态：未签名/未发布/未安装；最后已签名安装版仍是 1.2.4（BLOCKED/README 已区分）。

## Firefox 1.2.4 formal release closeout — 2026-08-14

- Version `1.2.4` carries the accepted T1 fix, T2 governance mitigation, and T3 retained limitation. PR #4 merged the candidate to `main` at `24bde6078fd9aecf550dfae0b82a8a85b5ae28c6`; PR and merged-main Firefox CI passed.
- Mozilla signed the unlisted package `web-ext-artifacts/df5a29cf0eba47f89263-1.2.4.xpi` on 2026-08-14. SHA-256: `d3c822d0607c0379bb6e56ef4456ce4091aa6f67215aee8b68beb9636e057208`.
- Permanent-profile verification found version `1.2.4` active, enabled, compatible, `signedState=2`, with the installed XPI byte-identical to the canonical artifact. Firefox `1.2.4` is therefore the formal release; `1.2.3` is retained only as a historical artifact.
- Repository-local `core.hooksPath=.githooks` is installed in this clone. The guard blocks accidental direct `main` pushes but remains bypassable and is not server-side branch protection.
- Future source integration must continue to use a short-lived branch, a PR to `main`, and green Firefox CI. Source, merge, Mozilla signing, and installation remain separate release gates.

## Formal Firefox baseline — 2026-08-13

- `main` in `ono404/geomirror-firefox` is the authoritative Firefox source baseline.
- PR #1 was merged without squashing at `0657406c1c9f1a8e85111e4a4c1d0cecd678207a`; it contains the accepted isolated-runtime implementation and its audited history.
- The implementation acceptance commit `95486617d7c9fd3fc4beb9dd41c517b815bece62` is now part of `main`; `agent/firefox-isolated-runtime` is historical, not a newer release lane.
- Independent final acceptance: `ACCEPT`; 79 tests, smoke, syntax, Firefox build/lint, Paris/Tokyo runtime matrix, and reverse validation passed.
- `.github/workflows/firefox-ci.yml` runs on pull requests and pushes to `main`. The merge commit passed tests, smoke, syntax, build, and Firefox package-shape checks.
- Firefox uses a single ISOLATED content runtime (`content-isolated.js` + `lib/font-mask-isolated.js`); it has no page-visible DOM bridge.
- Closed findings include F011 request-type coverage, font route/token markers, F006 host-language leak, watch-ID shape, Geolocation object shape, and Navigator receiver validation.
- Accepted limitations: generic JavaScript wrapper source/stack differences and Geolocation `structuredClone` WebIDL internal-slot behavior.
- Firefox release `1.2.3` was built from the accepted `main` source and signed through Mozilla's unlisted channel on 2026-08-13. Permanent activation requires installing `web-ext-artifacts/df5a29cf0eba47f89263-1.2.3.xpi`.
- In this maintenance workspace, historical task evidence remains outside the repository under `../evidence/`; it is not part of the GitHub source checkout. Git history preserves implementation detail.
- Next action: maintenance through a short-lived branch and CI-gated pull request, or an explicitly authorized release/signing cycle. Do not continue anti-detect expansion.

## Firefox next-maintenance round — 2026-08-13 开工回执

- 基线：`main`==`my-private/main`==`a8a1af1a00c5bd3b59d9fec6487fb517d36b88de`，工作区干净。
- 任务 0 复核：79 tests / smoke / 12 syntax / build 17 / lint 0-0-0 / `git diff --check` 全绿；`core.hooksPath` 未设；XPI `df5a29cf0eba47f89263-1.2.3.xpi` SHA-256=`24162a2e…4444c55` 不变。
- protection/rulesets API（gh 认证）：仍 403 "Upgrade to GitHub Pro or make this repository public"。CI 工作流在 `.github/workflows/firefox-ci.yml`。
- 本地短期分支 `maint/firefox-next-maintenance`（不 push/merge/tag/签名/发布）。
- 三项串行：T1 DNR Accept-Language 生命周期故障 → T2 main 推送治理 → T3 wrapper/structuredClone；证据在 `../evidence/firefox-next-maintenance/**`。

## T1 DNR Accept-Language — 进行中（2026-08-13）

- Harness：`../evidence/firefox-next-maintenance/T1-dnr-accept-language/harness/`（server 18945 / RDP 18946 / BiDi 18947；direct launch + RDP installTemporaryAddon；production background+content+popup 逐字节复制；仅 lib/providers.js、lib/geo.js 指向本地 mock，SHA 差异已记录；真实 popup 按钮经同扩展 iframe 控制页点击）。
- 场景：off 原生基线 / initial（fresh 初设）/ langoff↔langon（popup 语言开关）/ switched（popup 刷新切东京）/ refreshed（刷新回巴黎）/ restart（同 profile 完整重启恢复）/ fail→recover（真实 updateDynamicRules 配额拒绝）。
- 每轮记录：getDynamicRules()、storage 状态、popup 渲染、navigator.language(s)、3 类 Intl locale、10 表面 header、marker 扫描。
- 关键机制踩坑（已解决并记录）：153.0.4 直接启动 RDP 需 devtools.debugger.remote-enabled pref；MV3 事件页 30s 挂起（alarm 保活）；tabs/scripting.executeScript 对 moz-extension 页无权限、RDP 无 listTabs、BiDi 需显式 session.new 且不列 moz-extension context → popup 控制走同扩展 iframe 同源访问；BiDi session 间 context id 不稳定（evalurl 单会话内 find+eval）。
- 基线矩阵 3 轮：r1/r2 完整通过（newFirefoxAfter=[]），r3 首跑遇 raw 半行竞态（harness 缺陷已修）→ 重跑中。
- 冻结 judge：`judge-normal.py`（SHA `b20b4149…`，正常矩阵绿 exit 0）、`judge-failure.py`（SHA `e67901d8…`，故障红 exit 1：3轮×[状态仍ok静默 / 页面ja-JP vs header原生 / popup仍Active]）；反向验证 t1-t4 篡改全红、t5 合成诚实故障绿（judge 非永远红）。基线 raw 归档 `baseline-current/`（raw 3beeda4c…、acl 77fd7562…）。
- Candidate 已实现（background.js：原子 remove+add 单次 updateDynamicRules + 3 次退避重试 + lastDnrError；refresh/onStartup/SET_SETTINGS 以规则为提交点，失败剥离 override 语言字段 + state error，popup 显示 Error；content-isolated.js 一行语义修正：langEnabled 优先读 override（否则 F006 中性守卫会重注入 en-US，页面语言与原生 header 不一致））：84 tests（+5 T1-maintenance）、smoke/syntax/build/lint/diff-check 全绿。
- **T1 裁决：FIX**。同一冻结 judge：off/current（normal 绿 / failure 红 9 fail）→ candidate 3 轮（normal exit 0 / failure exit 0）。故障相实测：state error+langFailed:True、页面 zh-CN==header 原生（一致）、popup 显示真实 Firefox 配额错误；故障移除后恢复全目标。新页面可见面=0（normal judge marker 项 0 fail）。
- **Chrome/Edge 验证发现两处真实缺陷（2026-08-13）**：
  1. Chrome 151 已禁用 `--load-extension`（"not allowed in Google Chrome"），harness 改为 CDP `Extensions.loadUnpacked`（browser 级 ws）；此前 6 轮 Chrome 全部空转（扩展从未加载，/json/list 里的 chrome-extension:// 目标是内置组件扩展 Google Hangouts/Network Speech），已修复 driver 并加组件扩展误匹配防护。
  2. **Chrome DNR `resourceTypes` 无 `beacon`**（sendBeacon 归 `ping`），含 beacon 的规则整体被拒 → 1.2.3 在 Chrome/Edge 上 AL 规则**从未生效**（被空 catch 静默吞掉的历史故障）。修复：`AL_BEACON_TYPE = (typeof browser !== 'undefined') ? 'beacon' : 'ping'`（Firefox 事件页有 browser 全局，Chromium SW 无）。
  3. `beacon→ping` 静态替换实验（harness-pingexp，sessionA 单轮）：Firefox 接受 ping 规则但 beacon 表面回退原生 zh-CN → **Firefox 不把 sendBeacon 匹配为 ping**，静态交集列表会造成 Firefox 回归，必须运行时选择。
- v1 候选证据已归档 `harness/v1-archive-20260813-beacon-only/`；最终源码（含 AL_BEACON_TYPE）Firefox 3 轮重跑中（同一冻结 judge 复验）；Chrome/Edge 生命周期随后用修正后的 chromium-driver 跑。
- 剩余：Firefox 复验+judge → Chrome/Edge judge → 全量回归；T2/T3；报告。

## T1 DNR Accept-Language — 完成（2026-08-13，三浏览器全绿）

- **最终源码**：`background.js` 新增 `AL_BEACON_TYPE`（`_RT.getBrowserInfo` 存在→`beacon`，否则 `ping`）+ 原原子 remove+add/退避重试/诚实错误。`test/run-tests.js` F011 断言更新，84 tests。
- **Firefox 最终复验**（getBrowserInfo 判别器源码，3 轮 12 会话，failure-r3 一次 harness flake 已定点补跑）：冻结 `judge-normal.py`（b20b4149）**PASS**、`judge-failure.py`（e67901d8）**PASS**，0 fail。
- **Chrome 151**：`chromium/judge-chromium.py`（SHA `623d2f0b…`，证据校准冻结）**PASS**，0 fail；Edge 151 同 judge **PASS**，0 fail。各 3 off 原生基线 + 3 sessionA×5 相位（initial/langoff/langon/switched/refreshed）：语言/头/Intl/tz 收敛、DNR 结算态、storage 状态、popup、9 ACL 表面、temporal 无宿主泄漏、marker 契约（原生 globals+恰好 {GeoMirrorFonts,GeoMirrorTZ}+恰好 1 个 data-geomirror 桥属性——Chrome/Edge 既有 MAIN-world 桥设计，非本轮新面）。
- **关键发现（harness 与产品）**：
  1. Chrome 151 禁用 `--load-extension` → harness 改 CDP `Extensions.loadUnpacked`（Edge 同样支持）；内置组件扩展（Hangouts/Network Speech）会污染 `/json/list`，SW 目标按扩展 ID+type 匹配。
  2. Chrome/Edge DNR 无 `beacon`（sendBeacon 归 `ping`），1.2.3 的 AL 规则在 Chromium 上从未生效（被空 catch 静默）。`beacon→ping` 静态替换实验证明 Firefox 不把 sendBeacon 匹配为 ping，故运行时选择。
  3. Chrome 151 也有 `browser` 全局（非 chrome 别名，仅子集 API），判别器必须用 Firefox 独有 `runtime.getBrowserInfo`。
  4. `_dbg` 追踪证明产品在 Chrome 上每次语言切换恰好 1 次原子 updateDynamicRules、值正确；先前的重复/陈旧 dnr 证据行是 harness 的 SW 唤醒竞态，judge 已按“相位结算态（最后一行）”断言（证据 DIAG-dnr-trace-20260813.md）。
- **T1 裁决：FIX**（Firefox 故障红→绿、三浏览器生命周期一致、无新页面可见面、故障诚实报错+恢复）。

## 协作情报（旁路会话 diag-al-probe，2026-08-13 15:19）— 供任何执行者使用

- **决定性实验证明 AL_BEACON_TYPE（ping）修复在 Chrome 151 端到端成立**：
  loadUnpacked 返回权威 ID → 真 SW 规则表含 9001 ping 规则（state ok / langFailed false /
  ipCountryCode FR）→ popup（WAR 后）正常渲染 Active+Paris → gate 35s 内收敛，
  /on/probe 到达，ACL 各表面（含 beacon 表面）header=fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7。
  复跑：`chromium/diag-al-probe.py`（自起 server、自建 ext-al-probe、自清理）。
- 注意：实验行落在共享 `harness/t1-run/raw.jsonl+acl.jsonl`（沿用旧 session 标记
  `sessionA-chrome-r3`、phase=initial、fr-FR header）。最终 Firefox judge 前需按
  13:15 先例清理/归档 sessionA-chrome-* 段；chrome/edge 轮次建议用独立 T1_RUN_DIR
  （server.py 支持 T1_RUN_DIR env）避免混写。
- 15:10–15:17 三轮 chrome 失败与源码无关（同源同 manifest 的实验通过）；当时 driver
  缺 sw_wake（SW 睡着后 evalurl 全 miss）。当前 driver（15:19 版）已有 loadUnpacked
  权威 ID + ServiceWorker.startWorker 唤醒 + popup 等待，按此流程跑 chrome 3 轮后
  用 judge-normal 同构的 chromium judge（bucketing sessionA-chrome-*）验证。
- 冻结 judge-normal.py 要求 off/sessionA/sessionB 各 ≥3；chrome 轮次只产 sessionA-*，
  需独立 judge（排除 off/sessionB 基线项）或产出完整四类会话。

## T2 main 推送治理 — 完成（2026-08-13，裁决 GOVERNANCE MITIGATION）

- 远端能力复核（带认证 gh）：branch protection API 与 rulesets API 均 HTTP 403
  "Upgrade to GitHub Pro or make this repository public"。服务端强制通道不可用。
- 落地低成本版本化防误操作（不改运行代码/远端设置/不装全局 hook）：
  - `.githooks/pre-push`：拒绝直推/删除 `refs/heads/main`；功能分支与标签放行；
    应急逃生舱 `GEOMIRROR_EMERGENCY_MAIN_PUSH=1`（文档化）。
  - `tools/install-guard.mjs`：repo-local `core.hooksPath=.githooks`（幂等，绝不 global）。
  - 已在真实仓库执行安装（仅本 clone）。
- 反向验证（一次性本地 bare remote，7/7 通过，见
  `../evidence/firefox-next-maintenance/T2-main-push-guard/validation/validation.log`）：
  T1 直推 main 拒绝（远端不变）/ T3a 删 main 拒绝 / T2 功能分支允许 /
  T3b 损坏 hook fail-closed / T-EMERGENCY 应急通道通过 / T4 `--no-verify` 绕过（实测记录）/
  T5 无 guard 新 clone 绕过（实测记录）。
- 判定：所有写入者均可本地绕过（--no-verify/换 clone/删 hook/web 编辑）→ 非 server-side
  强制 → GOVERNANCE MITIGATION，不得称 branch protection。文档已更新
  `docs/FIREFOX_BUGFIX_HANDOFF.md`、`BLOCKED.md`（AGENTS.md 需用户批准后补）。

## 证据污染记录（2026-08-13 15:26-15:27）

- 旁路旧会话复活，其 chromium-driver 短跑向共享 `harness/t1-run/raw.jsonl+acl.jsonl`
  追加了 `off-chrome-r1/r2`、`sessionA-chrome-r1/r2` 标记段（随后被终止）。
- 共享 t1-run 同时含：被中断的 Firefox 最终复验（off/sessionA/sessionB 完整、
  failure-r3 只有 marker 行）+ chrome 污染段 → **不再直接用于冻结 judge 裁决**。
- 最终 Firefox 裁决改在隔离目录 `harness/t1-final-run/`（driver-final.py，TAG=t1-final）
  上执行冻结 judge（judge-normal/failure 以 argv 路径传入）；t1-run 原样保留为历史。
- 冻结 judge SHA 复验：judge-normal `b20b4149…`、judge-failure `e67901d8…`（与 PROGRESS 记录一致）。

## 协作记录（会话 20260813_15xx 并行交叉验证，16:05）

- 本会话此前在共享 `harness/t1-run/` 上完成了 Chrome/Edge 生命周期交叉验证：
  `judge-chromium.py`（SHA `623d2f0b…`）chrome PASS / edge PASS，0 fail（3 off 原生基线
  + 3 sessionA×5 相位；含 marker 契约：原生 globals+{GeoMirrorFonts,GeoMirrorTZ}+1 个
  data-geomirror 桥属性）。**注意**：该共享文件按上文记录视为历史/污染，此结果仅作
  独立交叉验证，不作为冻结 judge 的主链证据；主链以 chromium-driver2.py + t1-run2
  （隔离端口）结果为准。
- 交叉验证中发现并已写入 harness 的 Chrome 151 事实：`--load-extension` 被禁（CDP
  `Extensions.loadUnpacked` 替代）；Chrome 151 也暴露 `browser` 全局（判别器需
  getBrowserInfo）；DNR 无 beacon（sendBeacon 归 ping）；`_dbg` 追踪证明产品每切换
  恰好 1 次原子 updateDynamicRules（DIAG-dnr-trace-20260813.md）。
- 本会话已停止并行执行，等待主链（sibling 会话）完成 Chrome/Edge；T3/回归/报告
  待协调后继续，避免双写。

## T1 Firefox 最终裁决 — 完成（2026-08-13 16:00）

- 干净重跑：`harness/driver-final2.py`（TAG=t1-final2，端口 18955 隔离，seed/控制页端口同步修正；
  v2/v3 端口问题与 v3v4 混合文件已归档 `t1-final2-run-mixed-v3v4/`），12 轮全过
  `driver complete ok_all=True`（exit 0）。
- 冻结 judge（SHA 复验一致）：`judge-normal.py t1-final2-run/raw.jsonl t1-final2-run/acl.jsonl`
  → **exit 0 PASS**；`judge-failure.py t1-final2-run/raw.jsonl` → **exit 0 PASS**。
- **T1 Firefox 侧关闭：FIX 成立**（含 AL_BEACON_TYPE 运行时选择，Firefox 用 beacon、
  Chromium 用 ping；故障注入/恢复、五种生命周期、重启恢复、页面-头部一致性、marker=0 全绿）。
- 剩余：Chrome/Edge 生命周期（chromium-driver2.py，隔离端口 18956/18958 + t1-run2）→ T3 → 全量回归 → 报告。

## T1 Chrome/Edge — 完成（2026-08-13 16:13，三浏览器全绿）

- `chromium-driver2.py`（隔离端口 18956/18958、server-18956.py、独立证据 t1-run2）：
  - Chrome：off 1 轮 + 生命周期 3 轮 → `judge-chromium.py ... chrome` **exit 0 PASS**（证据 t1-run2-chrome-pass/）。
  - Edge：off 1 轮 + 生命周期 3 轮 → `judge-chromium.py ... edge` **exit 0 PASS**（证据 t1-run2-edge-pass/）。
  - host 常量从各自 off 轮推导（Chrome zh-CN,zh;q=0.9；Edge zh-CN,zh;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6）。
- harness 竞态修复（driver 侧）：翻相前 `wait_acl_surfaces()` 等待 9 个 ACL 面全部落账，
  避免相位监视器导航中止慢尾请求丢行（access.log 显示请求到达、acl 行丢失）。
  两轮 flake 证据已归档 t1-run2-edge-16h07-flake/、t1-run2-edge-16h09-flake/、t1-run2-16h01-flake/。
- ServiceWorker.enable/startWorker 在 Chromium CDP 不存在（-32601）为噪音；SW 清醒窗口内 eval 有效。
- **T1 全部完成：Firefox/Chrome/Edge 生命周期 + 故障注入 + 冻结 judge 全绿；裁决 FIX 成立。**

## T3 wrapper / structuredClone — 完成（2026-08-13，裁决 KEEP LIMITATION，production diff=0）

- 复用 A2 harness（端口 8891）+ 冻结 judge（SHA `641d15d3…` 逐字节一致），
  当前源码 off/current 各 3 轮 fresh profile：
  - 注入 sentinel 证明 current 真加载（before/after/storage-set 行齐全，getter 返回
    伪造东京坐标）。
  - 冻结 judge 4 组全绿 exit 0：off / on|enabled / on|disabled / on|reload 各 3 轮
    0 fails——wrapper 表面（ownKeys=[]、toJSON、getter receiver、brand/instanceof/
    exactProto）与原生不可区分（P4 零 own 属性架构保持）。
  - **structuredClone 残差稳定**：原生 coords 抛 DataCloneError；伪装对象克隆成功
    `{same:false, keys:[]}`——WebIDL internal slot 检查，JS 无法伪造。
  - 反向验证：judge 的 load_raw() 读固定 RAW（argv 陷阱已记录）；换位篡改后
    ownKeys 非空 → exit 1（POSITION-OWNKEYS×3）；reload toJSON 抛 → exit 1
    （COORDS-TOJSON×3）；真实数据 exit 0。judge 非空转。
  - 论证：闭合 structuredClone 残差必然新增 own/symbol 属性 → 更廉价 marker
    （A2 三族架构死亡 + 第一性原理）。
- 报告：`../evidence/firefox-next-maintenance/T3-wrapper-structuredClone/REPORT.md`。

## 三项裁决汇总（2026-08-13）

| 项 | 裁决 | 证据 |
|---|---|---|
| T1 DNR Accept-Language | **FIX**（beacon→ping 运行时选择 + 原子 DNR 提交 + 诚实错误态；三浏览器全绿） | t1-final2-run（FF）、t1-run2-chrome-pass、t1-run2-edge-pass |
| T2 main 推送治理 | **GOVERNANCE MITIGATION**（版本化 pre-push guard，非 branch protection） | T2-main-push-guard/validation/validation.log |
| T3 wrapper/structuredClone | **KEEP LIMITATION**（production diff=0） | T3-wrapper-structuredClone/（judge exit 0 + 反向验证红） |

- 全量回归：84 tests / smoke / 13 syntax / build 17 / lint 0-0-0 / `git diff --check` clean /
  XPI SHA `24162a2e…4444c55` 不变。未 push/merge/tag/签名/安装。
- AGENTS.md 更新因受保护文件审批未通过而跳过（guard 文档在 FIREFOX_BUGFIX_HANDOFF.md/
  BLOCKED.md 完整）。

## 本轮：T1 最后一个缺口 —「旧9001保留+新写入拒绝」（2026-08-13 开工回执）

- 复核：HEAD a8a1af1、分支 maint/firefox-next-maintenance、候选 6改+2增（与任务书一致，无外来 diff）；
  84 tests / smoke / 13 syntax / build 17 / lint 0-0-0 / diff-check / XPI SHA 24162a2e…4444c55 全绿；
  端口 18945-18958/8891 无残留进程。
- 旧 failure judge 只覆盖 has9001:false（fill 先删 9001）；本轮补「9001 保留在表」场景。
- 新 harness：`T1-dnr-accept-language/retained-rule-failure/`（端口 18965/18966/18967，隔离）。
- 探针先行：产品形状 remove+add 在满表含 9001 时 Firefox 153 是否真拒绝（决定故障机制是否走产品自身调用）。

## 探针结论（2026-08-13 17:02）— 场景边界已写入 BLOCKED.md

- 4 轮实测（retained-rule-failure/，端口 18965-18967）：fill-keep 把表填到 5000 含 9001=Paris 成功；
  **产品形状 remove+add（9001→Tokyo）在满表时被 Firefox 153 接受**（配额检查为净数语义：
  表 + add − 实际命中 remove ≤ 5000；旧场景拒绝因 remove 不命中）。产品调用恒 remove+add 且
  remove 恒命中 → **「9001 保留 + 产品写入拒绝」不可通过真实配额构造**（完整推理见 BLOCKED.md）。
- 新 judge 覆盖可构造部分：初始巴黎证明 → fill-keep 5000 含 9001=Paris → harness 真实拒绝
  （probe-reject 纯 add 超限）→ 拒绝后 9001 未变 → 产品写东京成功收敛（页面==头==规则）→
  清表恢复。产品失败路径仍由既有 judge-failure（无 9001 满表）覆盖。

## 修复落地（2026-08-13 17:15）— 失败后按实际规则表收敛

- `background.js` 新增 `handleRuleFailure(override, context)`（唯一失败处理器，4 路径共用）：
  失败后 `getDynamicRules()` 读真实规则表——9001 在表 → override 提交为**实际规则值**
  （locale/languages/acceptLanguage 由真实值派生，langEnabled=true，页面==真实头）；
  9001 不在表 → strip（页面原生==头原生）；读表失败 → override 保持不变（原子拒绝⇒表未变，
  保持即与上次成功提交一致）+ 显式 [unreadable] 报错。删除无条件 strip 的 failLanguageState。
- 4 调用点：refresh / onStartup / 语言切换（toggleFailed flag 防 settings 覆盖实际表提交）/
  非语言设置重申。content-isolated 无需改（已读 override 提交态）。
- 静态测试：重写 4 条 + 新增 handleRuleFailure 契约测试 → **85 tests**。
- harness 加固：dumpDnr 裁剪为 count+9001（750KB 全量规则 post 偶发丢行）+ dump 重试兜底。

## 冻结 judge-retain.py + current/candidate/篡改（2026-08-13 17:16）

- **冻结**：`retained-rule-failure/judge-retain.py` SHA `6b286b56a7c27979`（先冻结后跑，复验一致）。
  契约：初始巴黎（页面+Intl+服务端头）/ fill-keep 5000 含 9001=Paris / probe-reject 真实拒绝且
  拒绝前后 9001 未变（failinj 行 + dump 行双证据）/ 产品写东京收敛（9001=Tokyo，页面==头，popup
  Active，state ok）/ clear 恢复（9001=Tokyo，count 1）/ marker=0（globals 原生集+零页面面）。
- **current（修复前）3 轮**：`retain-run-current-baseline/` → JUDGE_RETAIN PASS（exit 0）。
  如实记录：current 在该可构造场景下也绿（产品原子调用成功收敛，不触发失败路径——场景判别性
  受 BLOCKED.md 记录的事实限制；产品失败路径由 judge-failure 覆盖）。
- **candidate（修复后）3 轮**：`retain-run-candidate/` → JUDGE_RETAIN PASS（exit 0）。
- **篡改反向验证**（current 数据，5 种全红 / 未篡改绿）：t1 has9001→false 红、t2 拒绝后
  9001 值→Tokyo 红、t3 probe-reject outcome→accepted 红、t4 fail probe 头→巴黎 红
  （页面东京 vs 旧头不一致）、t5 fail popup→Error 红。judge 非空转。
- 后续：candidate 全矩阵回归（off/sessionA/sessionB/failure×3 → judge-normal/failure）→
  Chrome/Edge 各 1 轮 → 全量静态回归 → 报告。

## 三浏览器回归 + 全量回归 — 完成（2026-08-13 17:41）

- **Firefox candidate 全矩阵**（retain-run-fullmatrix-candidate/）：off/sessionA/sessionB/failure
  各 3 轮 → 冻结 judge-normal **PASS**（exit 0）、judge-failure **PASS**（exit 0）。
- **Firefox retained 3 轮**（retain-run-retained-candidate-final/）：judge-retain **PASS**（exit 0）。
- **Chrome 3 轮**（regress-run-chrome-candidate/）+ **Edge 3 轮**（regress-run-edge-candidate/）：
  冻结 judge-chromium **PASS / PASS**（exit 0）——ping 路径无回归。
- **harness 竞态修复（本轮）**：(1) gate 首导航改读 /state 实际 phase（消除 sessionB 误报
  initial 探针行）；(2) Firefox driver 移植 wait_acl_surfaces（翻转前等 9 ACL 面）；(3) **发现
  ThreadingHTTPServer 并发 append 丢行**（access.log 有 200、acl.jsonl 无行——Windows 非原子
  写互覆），chromium 回归用加锁 server 副本（retained-rule-failure/server-18956-retain.py +
  chromium-driver2-retain.py，只读原文件未动）。flake 归档：t1-run2-regress-chrome-17h31-flake、
  retain-run-fullmatrix-candidate-gateflake。
- **全量静态回归**：85 tests / smoke / 13 syntax / build 17 / lint 0-0-0（dist/firefox 路径）/
  `git diff --check` clean / XPI SHA `24162a2e…4444c55` 不变；端口全空、harness 残留进程=0。
- 未 commit/push/merge/tag/签名/安装；候选源码停留工作区（默认拍板）。

## 本轮：retained 分支完整 navigator.languages 一致性缺口 — 2026-08-13 开工回执

- 复核：HEAD a8a1af1、分支 maint/firefox-next-maintenance、候选 6改+2增（无外来 diff）；85 tests / smoke / 13 syntax / build 17 / lint 0-0-0 / diff-check / XPI SHA 24162a2e…4444c55 全绿；端口 18945-18958/18965-18967/8891 全空、浏览器进程残留=0。
- 缺口确认：`handleRuleFailure()` retained 分支 `override.languages = first ? [first] : null` 把完整旧头压成单项；judge-retain 只验主语言/Intl/header，未验完整 `navigator.languages`。
- 方案：`background.js` 提取纯解析 helper `alLanguageList()`（完整有序 tag 列表，去 ;q=，非法形状→null→unreadable 不谎称 retained）；补充 judge（驱动真实 handler）先冻结后实现：current 红、candidate 绿、三类篡改红。
- 运行时：Firefox current 生产 SHA 与 candidate 各跑 full matrix 1 轮 + retained normal 1 轮；Chrome/Edge 各 1 轮。证据 `T1-dnr-accept-language/retained-languages-final/`。

## 补充 judge 冻结 + 实现落地（2026-08-13 18:15）

- **冻结**：`retained-languages-final/judge-languages.py`（SHA `efad4670…cac4`）+ 配套真实函数执行器 `load-bg-languages.js`（SHA `23a79177…d24`，先冻结后实现，复验一致）。judge 两模式：SOURCE（vm 驱动真实 `handleRuleFailure`，巴黎/东京/空白/点 q/乱序头 → 完整有序数组、首项=locale、无 ;q=；空/空段/段内空格/尾逗号/多余参数/非字符串 → unreadable 且 override 不变）+ RUNTIME（retained 会话页面 langs==实际服务端头完整列表、marker=0）。
- **红→绿**：current（预修复工作区，`src-current-prefix/` SHA bffee8b3…）**红 28 fail**（`['fr-FR']` 单项 + 异常头谎称 retained）；production HEAD（`src-current-sha/`，无 handleRuleFailure）红（基线）；**candidate 绿 exit 0**（11 case 全过）。
- **实现**：`background.js` 新增纯解析 helper `alLanguageList()`（完整有序 tag 列表、去 ;q=、仅接受项目自身形状，非法→null）；retained 分支 `locale=tags[0]`、`languages=tags`（不再 `[first]`），解析不到有效 tag → 保持上一提交态 + 显式 unreadable（不谎称 retained）。
- **测试**：`test/run-tests.js` 支持 async 用例 + vm 沙箱执行真实 background.js（跨 realm 归一化断言）+ 4 条新行为测试（完整数组/异常输入/retained 提交/unreadable 保持）→ **89 tests passed, 0 skipped**（85+4）。
- **current 生产 SHA 运行时（`src-current-sha/`=HEAD 1.2.3 源码，未提交候选之外）**：full matrix 1 轮（`lang-run-current/`）ok_all=True——off/sessionA/sessionB 页面 langs==实际头完整有序（5+1+1 probe 全一致、marker=0）；failure 会话如实复现已知 pre-fix 签名（页面 ja-JP 完整数组 vs 真实原生头 zh-CN，1/3 probe 不一致，judge-failure 对 current 标红的同一行为）。retained 1 轮（`lang-run-current-retained/`）ok_all=True——补充 judge runtime 模式绿（retained sessions=1、页面==头、marker=0），source 模式红（HEAD 无 handleRuleFailure，基线）。harness 缺口：首次复制漏 `probe.html`（server 404 无 probe 行）已补齐，失败轮归档 `lang-run-failed-missing-probe-html/`。
- 运行中：candidate full matrix 3 轮（`--only off,sessionA,sessionB,failure --rounds 3`）→ 后接 retained 3 轮、Chrome/Edge 各 3 轮、篡改反向验证、全量回归。

## 三浏览器运行时回归 — 完成（2026-08-13 18:45）

- **candidate full matrix 3 轮**（`lang-run-candidate/`，加锁 server 副本修复 acl 并发丢行；flake 轮归档 `lang-run-candidate-flake-acl-drop/`，access.log 证明 font 请求 200 到达而 acl 行丢失）：**judge-normal PASS**、**judge-failure PASS**（exit 0）；一致性核查 12 会话 0 不一致、marker 全 0。
- **candidate retained 3 轮**（`lang-run-candidate-retained/`）：**judge-retain PASS**；**judge-languages 全绿**——SOURCE 11 case（巴黎/东京/空白/点 q/乱序 → 完整有序数组、locale=首项、无 ;q=；6 类异常 → unreadable 且 override 不变）+ RUNTIME 3 retained 会话（页面 langs==实际服务端头完整同序、首项=locale、marker=0）。
- **篡改反向验证**（candidate retained raw 派生，仅改 probe langs）：缺项/乱序/含 `;q=` 三类各 **红 9 fail**；未篡改绿。judge 非空转。
- **current 生产 SHA**：full matrix 1 轮 + retained 1 轮（`lang-run-current/`、`lang-run-current-retained/`）ok_all=True——off/sessionA/sessionB 与 retained 页面 langs 完整、marker=0（补充 judge runtime 绿）；failure 会话如实复现已知 pre-fix 签名（页面 ja-JP vs 真实原生头 zh-CN）；source 模式红（HEAD 无 handler / pre-fix `['fr-FR']` 28 fail）。
- **Chrome 3 轮**（`regress-run-chrome/`）：judge-chromium **PASS**；**Edge 3 轮**（`regress-run-edge/`）：judge-chromium **PASS**——ping 路径无回归。
- **全量静态回归**：89 tests / smoke / 13 syntax（含 install-guard.mjs）/ build 17 / lint 0-0-0 / `git diff --check` clean / XPI SHA `24162a2e…4444c55` 不变；冻结 judge SHA 复验一致（normal b20b4149 / failure e67901d8 / retain 6b286b56 / chromium 623d2f0b；补充 judge efad4670 + loader 23a79177）。端口 18945-18958/18965-18967/8891 全空、浏览器进程残留=0。未 commit/push/merge/tag/签名/安装。

## Verification entry point

Run the complete command set in `AGENTS.md`. Firefox runtime acceptance must use ordinary-page and server-side evidence with extension-off/on controls; static tests alone are insufficient.
