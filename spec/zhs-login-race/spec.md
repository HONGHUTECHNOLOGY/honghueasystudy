# Feature Specification: 智慧树登录未完成即读课程（竞态）修复

**Created**: 2026-11-20
**Status**: Draft（待批准后实施）
**Input**: User description: "智慧树登录脚本有时候会有bug，登录还没完成，就开始读取课程然后报错"

## Overview

自动刷课 / 远程读课程在「启动时的登录脚本结束」后立即开始。但智慧树登录脚本会在内部吞掉所有异常（`catch { emit('script-error') }`），脚本结束 ≠ 登录成功；同时登录中心的域名（`login.zhihuishu.com`、`passport.zhihuishu.com`）也属于智慧树域名，会被 `detectCoursePlatform` 认成「教学平台页」。两端叠加的结果是：登录还在跳转尾段时，读课程已经开跑，在登录页上抽出 0 门课，最终报「没有找到课程「X」：已识别为智慧树，但没读到课程」，用户感知为「登录没完成就乱读然后报错」。

本次修复只做一件事：**在读课程 / 进课之前识别登录页，并给登录跳转一个有限等待窗口；等待窗口用完仍未登录时返回明确的「登录未完成」提示，不再伪装成「没找到课程」。**

## Root Cause（已核实的代码证据）

1. `honghueasystudy_desktop/packages/app/src/worker/index.ts`
   - `detectCoursePlatform()` 只按域名后缀匹配（`/(^|\.)(zhihuishu|polymas)\.com$/i`），`login.zhihuishu.com` / `passport.zhihuishu.com` 同样命中。
   - `acquireAutomationPage({ requirePlatform: true })` 只判断 `detectCoursePlatform(cached.url())`，登录页会被当作可用平台页返回。
   - `readCourseList()` 的抽取目标（`attempts`）同样不排除登录页；抽不到后还会把页面导航到 `platform.listUrl`，未登录时会被弹回登录页，最终落入「已识别为平台，但没读到课程」的 hint。
   - 导航后的 `await page.waitForTimeout(2500)` 依赖页面对象；页面若在跳转中被关闭会直接 reject，成为另一个「莫名报错」来源。
2. `honghueasystudy_desktop/packages/app/src/scripts/automation/wk/zhs.ts`
   - `waitForLogin()` 只把 `url.includes('login.zhihuishu.com')` 视为「仍在登录」；跳转链里的 `passport.zhihuishu.com` 或其它中间页只要地址稳定 3 秒就被判为登录完成并返回，脚本随即结束，`automation-done` 触发读课程。
   - 脚本 `run()` 的所有异常都被 catch 后 `emit('script-error')`，因此 `markAutomationReady()` 与 `automation-done` 在登录失败时同样会到来（这是设计使然，不能靠「脚本结束」判定登录成功）。

## User Scenarios & Testing *(mandatory)*

### User Story 1 - 登录未完成时给出明确提示，而不是「没找到课程」 (Priority: P1)

用户启动浏览器并运行智慧树登录脚本。若安全验证未过 / 密码错误 / 跳转链超时，读课程（自动刷课、面板「刷新课程列表」、手机远程 `course.list`）不会再在登录页上抽课程，也不会把登录标签导航走；而是在有限等待后返回「登录还没有完成」的明确原因。

**Why this priority**: 这是用户直接反馈的现象，也是「报错信息误导排查方向」的根源。

**Independent Test**: 用错误密码运行智慧树登录脚本，待脚本结束后触发自动刷课 / 刷新课程列表，观察返回的 hint 与最终错误文案。

**Acceptance Scenarios**:

1. **Given** 智慧树登录失败，浏览器仍停在登录中心，**When** 读课程，**Then** 不导航该标签、不抽取课程，返回 hint「登录还没有完成（页面仍停在智慧树登录页）…」
2. **Given** 自动刷课在登录失败后读课程，**When** 三次读取都拿到登录页，**Then** 最终错误文案包含「登录还没有完成」，不出现「没有找到课程」作为主因
3. **Given** 登录页标签已关闭、只剩空白页，**When** 读课程，**Then** 导航到课程页后若被重定向回登录页，返回同上「登录未完成 / 登录状态已失效」提示，而不是空列表

---

### User Story 2 - 登录成功但页面仍在跳转尾段时，读课程自动等待 (Priority: P1)

登录已成功，但 `login → passport → www` 的跳转链还没落定（或课程页首屏尚未渲染）。读课程应当先做有限等待，等到出现非登录的平台页 / 地址离开登录页后再抽取，从而正常读到课程。

**Why this priority**: 这是「有时候能读到、有时候报错」的随机性来源，修复后应稳定成功。

**Independent Test**: 正常账号运行登录脚本后立即触发自动刷课，连续多次启动观察是否仍出现空列表报错。

**Acceptance Scenarios**:

1. **Given** 读课程时页面仍在 `passport.zhihuishu.com`，**When** 15 秒内跳转到非登录页（同标签或其它标签），**Then** 使用该页继续读取，流程不报登录错误
2. **Given** 浏览器同时存在登录页标签与已登录的平台页标签，**When** 读课程 / 进课，**Then** 选择非登录的平台页，登录页保持不变
3. **Given** 页面已离开登录页但课程列表异步渲染，**When** 首次抽取为空，**Then** 保持现有 3 次重试（间隔 8 秒）并最终读到课程

---

### Edge Cases

- 登录页 URL 与平台页同域：判定必须基于 host 前缀（`login.` / `passport.` / `sso.` / `cas.` 等）与首段路径，而不是「是否属于平台域名」
- 登录脚本结束后标签被关闭：`acquireAutomationPage` 可能新开 `about:blank`；导航课程页后若被弹回登录页，按「登录未完成 / 登录状态已失效」处理
- 页面在等待 / 导航过程中被关闭：等待改为与页面对象无关的定时器，URL 读取做空值兜底，避免抛 `Target page, context or browser has been closed`
- 非智慧树平台（超星 / 职教云 / 智慧职教）行为不变：只新增登录页识别与等待，正常平台页的既有选择顺序与抽取逻辑不动

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: `worker/index.ts` 必须提供登录页 URL 识别函数（host 前缀 `login|passport|sso|cas|signin|auth|account`，或首段路径 `login|signin|sign-in|passport|sso|cas`），非 http(s) 一律返回 false
- **FR-002**: `acquireAutomationPage({ requirePlatform: true })` 在存在多个平台页时必须优先返回**非登录页**；仅在只有登录页可选时才返回登录页（供调用方给出提示）
- **FR-003**: `readCourseList()` 取到页面后若仍是登录页，必须做**有界等待**（默认 15 秒，1 秒轮询，可被其它标签的登录完成抢先满足）；窗口结束仍为登录页则**不导航、不抽取**，直接返回 hint「登录还没有完成（页面仍停在智慧树登录页）。请先在浏览器里完成登录/安全验证，再点「刷新课程列表」。」
- **FR-004**: `readCourseList()` 的抽取候选（主文档与 iframe）必须排除登录页
- **FR-005**: 强制导航到 `platform.listUrl` 后，若落地页是登录页，必须返回「登录状态已失效，课程页被跳转到了登录页」类提示，而不是「已识别为平台但没读到课程」
- **FR-006**: `readCourseList()` 中所有依赖页面对象的等待（导航后的 2.5 秒）改为与页面无关的定时器；`used.url()` / `page.url()` 的读取必须对已关闭页面兜底，不得因此 reject
- **FR-007**: `enterCourse()` 在目标页为登录页时必须抛出「登录还没有完成，暂时不能进入课程…」，不做点击
- **FR-008**: `zhs.ts` 的 `waitForLogin()` 必须把 `login.zhihuishu.com`、`passport.zhihuishu.com` 及 `zhihuishu.com` 下的 `login/signin` 路径都视为「仍在登录」；成功判定只接受 http(s) 地址连续稳定 3 秒；总等待上限由 40 秒放宽到 60 秒
- **FR-009**: 渲染端 `runStudy` 的最终错误必须能直接呈现 FR-003/FR-005 的 hint（现有 `没有找到课程「X」：<hint>` 形式即可，不新增 RPC 字段）

### Key Entities

- **登录页判定**：纯函数，输入 URL 字符串，输出 boolean；用于 worker 内所有「找一页来用」的分支
- **读课程结果 hint**：字符串，空列表时由 worker 给出；渲染端把它拼进最终错误文案，远程端原样展示

## Success Criteria *(mandatory)*

- **SC-001**: 登录失败场景下连续 3 次读课程均不导航登录标签、不产生「没有找到课程」主因，提示中明确出现「登录还没有完成」
- **SC-002**: 正常登录后立即读课程，连续 5 次启动无空列表报错（登录跳转尾段由 15 秒窗口覆盖）
- **SC-003**: `npx --no-install tsc -p packages/app/tsconfig.json` 通过（0 error）
- **SC-004**: 非智慧树平台（超星）的读课程 / 进课路径行为不变：候选页选择顺序只多一层「跳过登录页」，其余逻辑与文案不动

## Assumptions / Decisions

- 登录等待窗口取 **15 秒**：自动刷课本身有 3 次读取重试（间隔 8 秒），单次窗口过长会让失败反馈过慢；15 秒足以覆盖智慧树常见的跳转尾段
- `waitForLogin` 上限取 **60 秒**：`solveCaptcha` 的 OCR 与跳转链在弱网下可能超过 40 秒；对应 RPC 超时（5 分钟）不受影响
- 不新增 worker 与渲染端之间的 RPC 字段，复用现有 `hint`
- 不改动 `isNotLogin()` 的 `#login` 判定：智慧树首页 `#login` 为已登录区域、`#notLogin` 为未登录区域，现有语义正确
- 不在本次范围：登录失败自动重试、验证码识别算法、平台课程抽取规则
