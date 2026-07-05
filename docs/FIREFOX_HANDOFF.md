# 给新 Codex 的 Firefox 版交接清单

> 这份文档是给下一个 Codex 页面看的，不是直接给 TRAE 的最终开发指令。  
> 新 Codex 的职责是先理解项目和用户目标，再决定如何把任务交给 TRAE。不要把本文当成不可变技术方案。

## 当前权威状态（2026-07-05）

Firefox 适配已经完成第一版，不再处于“准备让 TRAE 开始写代码”的初始阶段。

当前状态：

- Firefox 临时扩展可以加载。
- popup 可以打开并刷新出口 IP。
- geolocation、timezone、language、Intl locale、outgoing `Accept-Language` 已在本地 Firefox 验证页通过主要验收。
- 关闭单个开关时，对应 spoof 行为可以在已打开页面回退。
- `web-ext lint --source-dir dist/firefox` 通过。
- 已生成签名 XPI：`web-ext-artifacts/df5a29cf0eba47f89263-1.1.0.xpi`。
- 私人备份仓库：`https://github.com/ono404/geomirror-firefox.git`。
- 当前已推送提交：
  - `745d239 feat: add Firefox extension build`
  - `5c5cf5e chore: add signed Firefox xpi`

后续如果是修 bug 或发新版本，优先阅读：

```text
docs/FIREFOX_BUGFIX_HANDOFF.md
```

本文下面保留了最初 Firefox 适配阶段的背景、约束和验收清单，仍可作为理解项目的参考，但不要把其中“下一步先让 TRAE 做基础适配”的内容当成当前状态。

## 用户背景

用户没有编程背景。用户关心的是最终能不能在 Firefox 上正常使用这个浏览器插件，而不是具体代码实现细节。

沟通时请注意：

- 先给结论，再解释原因。
- 不要默认用户能理解 manifest、DNR、content script、background script 等术语。
- 需要做技术判断时，用“会影响什么结果”来说明。
- 不要只给建议，要尽量推进到可验证结果。
- 如果有不确定点，明确说“不确定在哪里、下一步怎么验证”。

## 用户最终目标

用户想把本地目录里的 GeoMirror 浏览器插件做成 Firefox 可用插件。

最终目标是：

- 在 Firefox 上实现和 Edge / Chrome 里一样的功能。
- 至少达到 GitHub 仓库 `Azurboy/geomirror` 描述的功能效果。
- 如果 Firefox 平台允许，希望体验更好、更稳定。
- 不改变项目原本的隐私边界：无 telemetry、无 analytics、无账号系统、无远程配置、不收集网页内容。

项目目标不是“解释能不能做”，而是一步一步做完，直到 Firefox 版能被加载、能运行、能验证主要功能。

## 当前项目情况

本地路径：

```text
D:\LAB\火狐浏览器插件制作\geomirror
```

远端仓库：

```text
https://github.com/Azurboy/geomirror.git
```

当前本地项目已经是完整的 Chrome Manifest V3 扩展，不是空项目。已有能力包括：

- 检测当前出口 IP。
- 多个 IP geolocation provider fallback。
- 保存国家码、城市、地区、国家、经纬度、ISP、IANA timezone。
- 使用 OpenStreetMap Overpass 查询附近 `highway=residential`。
- Overpass 失败时使用 jitter fallback。
- 根据国家码和 timezone 推断 locale bundle。
- 保存设置和 override 到 `chrome.storage.local`。
- 使用 isolated-world bridge 和 MAIN-world injector 两段 content script。
- patch 页面可见 API：
  - `navigator.geolocation.getCurrentPosition`
  - `navigator.geolocation.watchPosition`
  - `navigator.geolocation.clearWatch`
  - `navigator.permissions.query`
  - `Date.prototype.getTimezoneOffset`
  - `Intl.DateTimeFormat`
  - `Intl.NumberFormat`
  - `Intl.Collator`
  - `navigator.language`
  - `navigator.languages`
- 使用 `chrome.declarativeNetRequest` 修改 outgoing `Accept-Language`。
- 已有 popup、README、隐私说明和测试。

第一次检查时的历史验证结果：

```bash
node test/run-tests.js
```

结果：当时 7 个测试通过。当前测试数量已经增加，后续应以 `node test/run-tests.js` 的实时结果为准。

以下语法检查也通过：

```bash
node --check background.js
node --check content-inject.js
node --check content-bridge.js
node --check popup.js
node --check lib/providers.js
```

初始接手时 `main` 与 `origin/main` 对齐：

```text
7841649bbea6c07e91c41d5117dfe9379b0c8d6d
```

初始接手时存在一个本地未提交改动：

```text
M lib/providers.js
```

该改动的含义是：优先选择带 IANA timezone 的 provider 结果，同时保留无 timezone 的 fallback。该改动已经随 Firefox 适配一起提交；后续仍不要误删、回滚或覆盖这个行为，除非用户明确要求。

## 已知可行性结论

做 Firefox 版是可行的。

原因：

- 核心功能大多是普通 JavaScript，可以复用。
- Firefox 支持 WebExtensions。
- Firefox 支持 content script 的 `MAIN` / `ISOLATED` world，因此现有双 content script 架构有保留基础。
- Firefox 支持 background scripts / event pages，可以替代 Chrome MV3 的 service worker 写法。
- Firefox 支持修改请求头的能力，但具体是继续用 DNR 还是改用 `webRequest`，需要新 Codex 进一步验证。

不要把“可行”理解成“直接改 manifest 就结束”。真正风险在 Firefox 平台差异，需要逐步验证。

## TRAE 协作背景

用户计划使用两个 AI 工具：

- Codex：负责按 skill 流程理清项目、拆任务、做验证、做 code review、做 debug、给用户解释结果。
- TRAE：负责写代码。

重要计费约束：

TRAE 的费用逻辑是按“任务次数”收费，不是传统 token 计费。因此每次交给 TRAE 的任务都应该尽量完整、详细、上下文充足、验收标准明确，避免因为提示词缺失导致多次返工。

但是：这份文档不要替新 Codex 直接写死 TRAE 的最终指令。  
新 Codex 应该先读取本项目、确认当前状态，再自己设计如何把任务交给 TRAE。

新 Codex 需要重点思考：

- 哪些任务适合一次交给 TRAE，避免浪费任务次数。
- 哪些任务必须拆开，避免一次 diff 太大导致不可 review。
- 每次给 TRAE 的输入需要包含哪些背景、限制、验收命令和禁止事项。
- TRAE 完成后，Codex 如何验证、debug、review，再决定下一步。

## 必须遵守的 4 个 skill 流程

用户明确要求双方始终按以下 4 个 skill 执行：

- `using-agent-skills`
- `git-workflow-and-versioning`
- `debugging-and-error-recovery`
- `code-review-and-quality`

新 Codex 和 TRAE 都要受这些流程约束。不要中途跳过验证，不要遇到错误继续堆功能，不要在没有 review 的情况下进入下一步。

### 对新 Codex 的要求

1. 开工前先确认当前阶段  
   是需求整理、方案拆分、交给 TRAE、验证、debug、review，还是交付总结。

2. 每一步都要有明确输出  
   例如：任务包、验收标准、测试结果、review 结论、下一步建议。

3. 不要中途停止  
   除非遇到必须由用户决定的冲突，否则要沿着“拆任务 -> 交给 TRAE -> 验证 -> debug -> review -> 下一步”的链条继续推进。

4. 保护已有改动  
   不要回滚用户或前序工具已经做的未提交改动，特别是 `lib/providers.js`。

5. 对用户友好  
   用户没有编程背景，所以每次阶段性汇报都要说清楚“现在做到哪一步、结果是什么、下一步要干什么”。

### 对 TRAE 任务的要求

新 Codex 给 TRAE 下发任务时，应当把这些约束写进去：

- 不要加入 telemetry。
- 不要加入 analytics。
- 不要加入账号系统。
- 不要加入远程配置。
- 不要收集网页正文、浏览历史或用户输入内容。
- 不要破坏 Chrome / Edge 现有功能，除非新 Codex 明确决定只维护 Firefox 版。
- 不要回滚已有本地改动。
- 每次完成后必须说明改了哪些文件、为什么改、怎么验证。
- 如果 Firefox 平台 API 不支持某个方案，要停下来说明错误和备选方案，不要自行改成大范围重构。

## 新 Codex 初始适配阶段需要先做的事（历史参考）

这一节是 Firefox 适配开始前的工作流。当前项目已经完成第一版 Firefox 适配。后续修 bug 时，不要机械重复这一节，而应先读 `docs/FIREFOX_BUGFIX_HANDOFF.md`，再按 bug 复现和回归验证流程处理。

初始适配阶段，新 Codex 开始后，不要直接让 TRAE 写代码。先做以下确认：

1. 重新检查本地目录和 git 状态。

```bash
git status --short --branch
rg --files
```

2. 重新跑现有测试，确认基线仍然健康。

```bash
node test/run-tests.js
node --check background.js
node --check content-inject.js
node --check content-bridge.js
node --check popup.js
node --check lib/providers.js
```

3. 检查 Firefox 工具是否存在。

```bash
web-ext --version
firefox --version
```

如果没有，不要直接安装大批工具。先告诉用户缺什么，以及为什么需要。

4. 重新确认 Firefox 平台关键点。

至少确认：

- Firefox 当前对 MV3 background scripts/event pages 的支持。
- `content_scripts.world: "MAIN"` 是否可用。
- `declarativeNetRequest.modifyHeaders` 修改 `Accept-Language` 的权限要求。
- 是否需要 `<all_urls>` host permission。

5. 再决定怎么给 TRAE 拆任务。

拆任务原则：

- 每个 TRAE 任务要足够完整，因为 TRAE 按次数收费。
- 每个 TRAE 任务又不能大到无法 review。
- 优先把“不确定性高的探索”和“确定性强的实现”分开。
- 每个任务必须有验收命令和验收页面。

## 建议的新 Codex 推进路线

这不是强制方案，新 Codex 可以调整。

### 阶段 1：产品经理 Codex 定方案

目标：形成第一份给 TRAE 的任务包。

新 Codex 要输出：

- 当前项目状态摘要。
- Firefox 适配风险列表。
- 第一轮 TRAE 任务边界。
- 第一轮验收标准。
- 明确不要做的事。

### 阶段 2：TRAE 做第一轮代码

可能的第一轮范围：

- Firefox manifest 适配。
- 不破坏 Chrome manifest。
- 让 Firefox 能临时加载。
- 保留 content script 注入顺序。
- 写清楚怎么构建或加载 Firefox 版。

具体怎么写给 TRAE，由新 Codex 根据当时检查结果决定。

### 阶段 3：Codex 验证和 debug

TRAE 完成后，新 Codex 必须：

- 看 diff。
- 跑现有测试。
- 跑新增测试或 lint。
- 尝试 Firefox 临时加载。
- 记录错误。
- 按 `debugging-and-error-recovery` 做复现、定位、缩小、修根因。

### 阶段 4：Codex 做 code review

按 `code-review-and-quality` 检查：

- 正确性：是否真的接近 Chrome/Edge 功能。
- 可读性：后续是否容易维护。
- 架构：是否只是为 Firefox 适配，不是乱重构。
- 安全和隐私：是否破坏隐私承诺。
- 性能：是否增加不必要的常驻逻辑或频繁请求。

### 阶段 5：进入下一轮 TRAE

只有当前阶段验证通过，才进入下一轮。

下一轮可能处理：

- background 兼容。
- `Accept-Language` header。
- popup 体验。
- Firefox README 和隐私说明。
- AMO 上架准备。

## 最终验收目标

最终 Firefox 版至少要验证这些功能：

1. 插件可以在 Firefox 临时加载。
2. popup 可以打开，显示当前状态。
3. 手动刷新可以检测当前出口 IP。
4. override 可以写入本地 storage。
5. 普通网页中 `navigator.geolocation` 返回匹配出口 IP 的住宅感坐标。
6. `navigator.permissions.query({ name: "geolocation" })` 返回预期状态。
7. `Date.prototype.getTimezoneOffset()` 使用调用者 Date 实例，且支持 DST-aware IANA timezone。
8. `Intl.DateTimeFormat().resolvedOptions().timeZone` 与出口 IP timezone 一致。
9. `navigator.language` 和 `navigator.languages` 与推断 locale 一致。
10. `Intl.DateTimeFormat`、`Intl.NumberFormat`、`Intl.Collator` 默认 locale 与推断 locale 一致。
11. language spoof 开启时，outgoing `Accept-Language` header 与推断结果一致。
12. 关闭对应开关后，对应 spoof 行为停止或回退。
13. 不读取网页正文内容。
14. 不上传用户浏览历史、表单内容或页面内容。
15. README / 隐私说明准确描述 Firefox 版权限和外部请求。

## 给新 Codex 的一句话任务

你不是来直接写一个简单 Firefox manifest 的。你的任务是：在用户没有编程背景、TRAE 按任务次数收费、必须遵守 4 个 skill 流程的前提下，把 GeoMirror 从当前 Chrome/Edge 扩展一步一步推进成可验证的 Firefox 版，并设计每一次交给 TRAE 的高质量任务包。
