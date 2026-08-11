# F011 修复轮进度（2026-08-11，executor 轮）
- 目标：VERIFIED F011 关闭——DNR Accept-Language 规则纳入已实测缺口 script/image/stylesheet/font/beacon，全 8 类型 + 既有 3 类型共 8 个冻结类型；普通页面九类请求两个稳态 round 全部同值目标头。
- 顺序：任务0 基线/SHA/C-harness 复制（已完成，全部冻结 SHA 匹配，HEAD 093a167，分支 agent/firefox-isolated-runtime）→ 任务1 先红后绿（仅追加测试→跑红→只改 background.js→≥41 全绿）→ 任务2 明卷 + 受控 Firefox 双稳态 round + 冻结 checker 红→绿 → 白名单单 commit。
- 最大风险：Firefox DNR 是否接受 `beacon` 为 resourceTypes 枚举值；若规则校验失败被 catch 吞掉，运行时九表面会全回 native 头——以受控 run 实测为准（≤3 次），失败则按规矩换方法/BLOCKED。
- 边界：只允许改 background.js / test/run-tests.js(仅末尾追加) / PROGRESS.md / BLOCKED.md / evidence\F011-implementation\**；三处用户改动(.gitignore/AGENTS.md/FIREFOX_BUGFIX_HANDOFF.md)不碰；不 push/merge/签名/发布。
- 状态：任务1 完成——追加 2 个 F011 测试(仅插入，0 删除)，修复前 41P+1F exit1（红证据 task1/red-tests-before-fix.txt），修复后 42/42 exit0；任务2 完成——12 项 node --check+smoke+diff-check 全 0，build 17 files，lint 0/0/0；受控 run #2(pwsh) 稳态 round4/5 十表面(9+eventsource)全部同值 en-US,en;q=0.9；冻结 checker：冻结 raw exit1(10 failures)→新 raw exit0(CONSISTENT 18/18)；残留 0 firefox/0 node/端口 18765/18766 free；dist/background.js 与源码同 SHA。BLOCKED.md=无。
- 注：run #1 因 git-bash→powershell 5.1 以 GBK 读 BOM-less UTF-8 ps1 致仓库中文路径损坏(ENOENT manifest)，未启动 Firefox/服务器（该次未计入受控 run）；改由 pwsh 7.6.4(UTF-8 原生) 执行同一字节的 run-matrix.ps1 成功。
