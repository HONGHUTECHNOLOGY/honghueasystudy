## 4.13.22 (2026-06-11)


### Bug Fixes

* **script:** 修复超星答题时无法读取多行题目的问题 (338fbfc)
* **script:** 修复超星路径 mooc-ans/mycourse/studentstudy 跳转新版后404的问题 (d2137ed)
* **script:** 修复中国大学MOOC无法提交视频内测验的问题 (621c612)



## [5.2.0](https://github.com/HONGHUTECHNOLOGY/honghueasystudy/compare/v5.1.5...v5.2.0) (2026-10-28)


* **browser:** 修复浏览器已启动但远程仍显示启动中/实例未运行/无截图 ([fea31d7](https://github.com/HONGHUTECHNOLOGY/honghueasystudy/commit/fea31d73cb782871e0ebe8095a0045463777e54b))
* **ci:** fsevents 改用 pnpm11 allowBuilds 语法，CI 构建绕过既有 lint 债 ([d4a5b98](https://github.com/HONGHUTECHNOLOGY/honghueasystudy/commit/d4a5b981bb7086e75833a0ae57d25af4324ed5ae))
* **ci:** GitCode 镜像补齐安装包同步，不再只传 zip 和扩展 ([64de373](https://github.com/HONGHUTECHNOLOGY/honghueasystudy/commit/64de373f11dcfc561ad3fb9081e9f6e36fa05a92))
* **ci:** PyInstaller 确认参数改为 --noconfirm（--yes 非合法参数） ([63a800d](https://github.com/HONGHUTECHNOLOGY/honghueasystudy/commit/63a800d57d69aa7c0928ba71abd0bfb5ecb2dc20))
* **ci:** 一键发版 —— CI 自动回写更新清单，桌面版本随插件版本统一 bump ([b7b61f4](https://github.com/HONGHUTECHNOLOGY/honghueasystudy/commit/b7b61f41f68de96a555db4477c641f2511762659))
* **ci:** 修复 build.py venv 路径拼接的运算符优先级 TypeError ([b8c992c](https://github.com/HONGHUTECHNOLOGY/honghueasystudy/commit/b8c992cdbe7ec76ac6bb11fb4629ade3991d21b7))
* **ci:** 冒烟滑块图改为 RGBA 透明底真实结构，修复 det 契约崩溃 ([42a671b](https://github.com/HONGHUTECHNOLOGY/honghueasystudy/commit/42a671b4fe65cafa78ed18bcb5319c123bfe41c4))
* **ci:** 声明忽略 fsevents 构建脚本，修复 mac CI 因 pnpm 供应链策略失败 ([30ab5b6](https://github.com/HONGHUTECHNOLOGY/honghueasystudy/commit/30ab5b645d4d071a4433f9d1979fb9155f098c02))
* **ci:** 更正兼容包步骤说明 ([e1d0544](https://github.com/HONGHUTECHNOLOGY/honghueasystudy/commit/e1d05442092ddd02b36f9426234ef5a75a6ea4b0))
* **desktop:** arm64 AppImage 目标覆盖改走专用 npm script 修复 pnpm 参数转发失效 ([93950f7](https://github.com/HONGHUTECHNOLOGY/honghueasystudy/commit/93950f77c0f8aceb9a4921be6f820143810a6624))
* **desktop:** Linux OCR 纯内置分发适配与远程控制台，CI 支持全平台打包 ([01040ca](https://github.com/HONGHUTECHNOLOGY/honghueasystudy/commit/01040cad43eabfdb82410a64ce0f0365deb73803))
* **desktop:** mac-x64 交叉构建失效修复，全平台 arch 参数改走专用 npm script ([6f5bba8](https://github.com/HONGHUTECHNOLOGY/honghueasystudy/commit/6f5bba8c0e05ea6516de821b875c9e0d9ed8f3e9))
* **desktop:** mac/linux 更新改为按平台架构给直链 ([d95b928](https://github.com/HONGHUTECHNOLOGY/honghueasystudy/commit/d95b92867ad01f8b36c87e14c11be8ac9301fe3c))
* **desktop:** 修正探测超时的注释，说明它不影响启动速度 ([57d01e8](https://github.com/HONGHUTECHNOLOGY/honghueasystudy/commit/57d01e8b28148dd05ed21f7f076eb06c98723e94))
* **desktop:** 安装目录优先取注册表记录，exe 目录仅作兜底 ([294613e](https://github.com/HONGHUTECHNOLOGY/honghueasystudy/commit/294613ebc5452616ff00b78671910940a2e5cb7c))
* **desktop:** 打通更新检测链路并加固就地更新 ([6546dfd](https://github.com/HONGHUTECHNOLOGY/honghueasystudy/commit/6546dfd025d0e51b019c569f2e45dac475ae4265))
* **desktop:** 提示更新前先探测下载源，全部不可达就不弹窗 ([58055a3](https://github.com/HONGHUTECHNOLOGY/honghueasystudy/commit/58055a364ac7619c743f0b9cda4dc9e727e18af0))
* **desktop:** 更新包支持 GitCode 镜像与多源回退 ([2be2714](https://github.com/HONGHUTECHNOLOGY/honghueasystudy/commit/2be2714333dc667ec1673ed8717e588f97a20344))
* **desktop:** 更新改为下载安装包静默覆盖安装 ([b250957](https://github.com/HONGHUTECHNOLOGY/honghueasystudy/commit/b2509571244f35b14eed823a9e90f8538ec7ae0e))
* **desktop:** 桌面版构建自动同步最新扩展，修复内置扩展过期 ([49c56cc](https://github.com/HONGHUTECHNOLOGY/honghueasystudy/commit/49c56ccf1eb53832139254eaccfe7cb0707d56d6))
* **desktop:** 远程控制台前端重构、图标补齐与多网卡地址排序 ([b41e480](https://github.com/HONGHUTECHNOLOGY/honghueasystudy/commit/b41e480a16c4b40386166d12a9391967de36edbc))
* **desktop:** 远程控制状态上报在页面节流/冻结后停更的修复 ([84fea91](https://github.com/HONGHUTECHNOLOGY/honghueasystudy/commit/84fea91c6601462b92b588f74fe1b375a2459092))
* **linux:** linux 块补 packageName=ASCII，修复 rpm 打包 rpmbuild 失败 ([450c808](https://github.com/HONGHUTECHNOLOGY/honghueasystudy/commit/450c808a55fa8a0b891ca10c36f5eb8c9be41615))
* **linux:** packageName 移至顶层 deb/rpm 目标块，过 schema 校验 ([f5a10db](https://github.com/HONGHUTECHNOLOGY/honghueasystudy/commit/f5a10db62ceb07551022ac0814d7e743de21f2ef))
* **ocr:** 交付通道改为 GitHub Release 资产 + 模型对齐 win 包 + 产物瘦身 ([9ccaca9](https://github.com/HONGHUTECHNOLOGY/honghueasystudy/commit/9ccaca979bbb259531525d5d6f43578c2ca83e95))
* **quiz:** 弹题作答可靠性修复：点击回读选中态、判断题关键词兜底与 AI 提示词重写 ([67518ae](https://github.com/HONGHUTECHNOLOGY/honghueasystudy/commit/67518ae337066d2a747557265973c3ba3b308b5f))
* **quiz:** 视频弹题支持 AI 题库答题 ([#2](https://github.com/HONGHUTECHNOLOGY/honghueasystudy/issues/2)) ([fd01e63](https://github.com/HONGHUTECHNOLOGY/honghueasystudy/commit/fd01e6353580892ddcc50d70de157199c0048269))
* **release:** CI 自动把发布产物同步到 GitCode ([1a236e8](https://github.com/HONGHUTECHNOLOGY/honghueasystudy/commit/1a236e8f0a37b4f05c2bb384b055377509cb1acc))
* **release:** Release tag 默认跟随插件版本线 ([47211c7](https://github.com/HONGHUTECHNOLOGY/honghueasystudy/commit/47211c721955c4cbcb3f476042dee58059b3e973))
* **release:** 发布鸿鹄易学 5.2.0 与桌面端 3.1.0 ([ce2cf50](https://github.com/HONGHUTECHNOLOGY/honghueasystudy/commit/ce2cf501866b442f76df3d2215c43dac80b522b9))
* **release:** 清单写入默认探链，另加每日健康检查防「检测到更新却下不了包」 ([8445501](https://github.com/HONGHUTECHNOLOGY/honghueasystudy/commit/84455014de2a96a16771c7c85ad4bff31259d299))
* **remote:** 「当前」标签只保留一个，大图改为冻结帧并补加载态 ([9dbd348](https://github.com/HONGHUTECHNOLOGY/honghueasystudy/commit/9dbd348a6f823b7d01f07336f3459fb67c7fb136))
* **remote:** 修复 saveStore 整份覆盖导致隧道开关被回滚（启动浏览器必现） ([560551e](https://github.com/HONGHUTECHNOLOGY/honghueasystudy/commit/560551ef78a96fd00c11bc94fbd3b694c337615b))
* **remote:** 切标签页后不再短暂显示上一页截图 ([cb7af7d](https://github.com/HONGHUTECHNOLOGY/honghueasystudy/commit/cb7af7de6066248ac181fd2dcd19ff4c9e1278fe))
* **remote:** 启动完成后状态立即上报，不再闪回启动中 ([539b704](https://github.com/HONGHUTECHNOLOGY/honghueasystudy/commit/539b704a2a9dee30725fe10a2622ae0226e73083))
* **remote:** 当前标签页判定失效，永远显示第一页 ([c7c42de](https://github.com/HONGHUTECHNOLOGY/honghueasystudy/commit/c7c42de56a182b59d8f61125962af7a70c9126bb))
* **remote:** 快照含响应式代理导致 IPC 序列化失败，状态彻底停更 ([662bab7](https://github.com/HONGHUTECHNOLOGY/honghueasystudy/commit/662bab72420e4e9be23916afd25e6f87ab8a726c))
* **remote:** 截图支持选择标签页，默认跟随浏览器当前前台页 ([a1869e3](https://github.com/HONGHUTECHNOLOGY/honghueasystudy/commit/a1869e3b9163413c542b0dac66afe03f715915e9))
* **remote:** 浏览器状态死锁、隧道自动重连、远程台品牌图与截图反馈 ([d49fc89](https://github.com/HONGHUTECHNOLOGY/honghueasystudy/commit/d49fc89d1da2bf00f885556c5204a3cb3e946180))
* **remote:** 点击启动/关闭立即显示过渡态，不再依赖手动刷新 ([d680fd6](https://github.com/HONGHUTECHNOLOGY/honghueasystudy/commit/d680fd63bef7f8c0f790a3645550a9a45490feec))
* **remote:** 状态上报改由主进程催报，修复浏览器已启动却一直显示启动中 ([ab0c9f6](https://github.com/HONGHUTECHNOLOGY/honghueasystudy/commit/ab0c9f67d32850729280d1a77ad3da5e10546455))
* **remote:** 视频播放中不再误报「长时间无输出」，改为展示播放进度 ([d596b1b](https://github.com/HONGHUTECHNOLOGY/honghueasystudy/commit/d596b1b116adaeecb2dbaf35ebe13ea82a876e5e))
* **remote:** 统一图标几何与描边，补齐 PWA 图标，manifest 禁缓存 ([d31609f](https://github.com/HONGHUTECHNOLOGY/honghueasystudy/commit/d31609f28468905e3c82fa1ef23add6d62d0a237))
* **remote:** 远程控制健壮性修复（3.2.0 收尾） ([1a71780](https://github.com/HONGHUTECHNOLOGY/honghueasystudy/commit/1a71780b6bdcc607a410a516a31b3ae70cabaf04))
* **remote:** 隧道静默失效自愈（健康检查 + 连通性探测），开关状态以后端为准 ([fa41fd4](https://github.com/HONGHUTECHNOLOGY/honghueasystudy/commit/fa41fd4189af6bde720595f35af1df887efbd2d9))
* **remote:** 页面列表实时同步 + 任务进度展示 ([2a1dd27](https://github.com/HONGHUTECHNOLOGY/honghueasystudy/commit/2a1dd27ba9554a1db4edeb5465e491c25ee9bc34))
* **web:** 书签页平台卡片搜索配色跳变与过渡异常 ([e1f39cd](https://github.com/HONGHUTECHNOLOGY/honghueasystudy/commit/e1f39cdd911e0f641e34a23e7cbd69f5e6295b76))

## 4.15.3 (2026-07-01)


* **script:** 修复超星作业答题时搜题会附带“我的答案”的BUG (d314886)

## 4.15.2 (2026-07-01)


* 修复 Build 错误：dependencies are mismatched easy-us (lockfile: ^0.0.60, manifest: ^0.0.66) (939e675)

## 4.15.1 (2026-07-01)


* **core:** 修复build报错：Unnecessary escape character: \ (76f959b)
* **core:** 修复tooltip提示在移动至滑动开关圆形按钮时不显示的BUG (d43243b)

## 4.15.0 (2026-07-01)


* **all:** 优化API，分离UI层为新项目 easy-us (ecc4ff6)
* aPI Update (849cde2)
* aPI优化 (f988878)
* **build:** 修复 Workflow 无法读取本地更新日志的BUG (5054129)
* **common:** 题库缓存清空后弹窗数量文字归零 (7a1ae7d)
* **core:** 优化Playwright软件辅助底层对接，添加软件辅助点击可视化，修复元素滚动后点击错位的BUG (e5daaae)
* **core:** 优化单选题匹配算法，优先选择精确匹配项 (10c300f)
* **core:** 优化单选题匹配算法，优先选择精确匹配项 (9f5dfd2)
* **core:** 优化搜索结果的显示BUG，已搜到答案的题目显示未匹配到正确答案的BUG，以及答题进度不一致的显示BUG (2fd9a72)
* **core:** 优化答题模块算法 (545d9bc)
* **core:** 优化选项中多余冗余影响的答案匹配问题 (cbbdb7f)
* **core:** 优化题库搜索题目显示，可兼容长题目例如阅读理解上下文显示 (2e62f4c)
* **core:** 修复上个版本无法打包的BUG (089aaaf)
* **core:** 修复使用精确匹配时，脚本的多选题搜索结果会全部显示已完成的BUG (65cfc48)
* **core:** 修复判断题命中答案但无对应选项时 finish:true→finish:false，不再静默吞题 (d38f358)
* **core:** 修复单选 ABCD 兜底改用 resolvePlainAnswer，并扩展剥离 ./。，A./A、/B. 可识别 (270a54d)
* **core:** 修复单选题匹配包含算法的BUG (82b5276)
* **core:** 修复单选题答案回调内容不一致的BUG (4265263)
* **core:** 修复图片题解析错误导致的URL重复，图片重复显示等问题 (f5cc59f)
* **core:** 修复多选题包含范围算法错误的BUG (ce790f0)
* **core:** 修复多选题匹配算法索引内容不一致导致选项漏选BUG (1a86635)
* **core:** 修复已经在暂停状态，但是依然在答题的BUG (3f04e21)
* **core:** 修复新版答题算法中搜题线程参数无效的BUG，始终只有一个搜题线程在运行 (9e052f8)
* **core:** 修复窗口反复闪烁的BUG (217b5e1)
* **core:** 修复窗口隐藏/显示 快捷键无效的BUG (8002c82)
* **core:** 修复答案为圆圈数字时无法答题的BUG (676f437)
* **core:** 修复答案匹配算法选择多余选项导致错题 (7dcaeb0), closes [#222](https://github.com/HONGHUTECHNOLOGY/honghueasystudy/issues/222)
* **core:** 修复纯答案ABCD多选题时脚本不处理的BUG (e2ffba7)
* **core:** 修复设置超出最大最小值，导致变更时，本地的值没有同步导致刷新后依然没有发生变化的BUG (0b05507)
* **core:** 修复隐藏窗口按钮无法使用的BUG (c028a8f)
* **core:** 修复题库请求时无法传递类型为0或者false的值 (6c8a26f)
* **core:** 修复题库配置 AnswererWrapper 自定义字段解析 handler 函数调用两次的BUG (1e15377)
* **core:** 全局设置中部分元素的值为空时恢复默认值 (9d539d0)
* **core:** 兼容搜题结果格式A#B#C#D解析为多选题 (0d29813)
* **core:** 删除无用的 project.studyproject  api (deb9050)
* **core:** 对移动端进行拖动面板适配 (d253f8b)
* **core:** 新增单选题多片段答案适配功能、支持单选题适配多个答案。 (ccd275b)
* **core:** 新增答案匹配算法对程序题的优化 (6498bb1)
* **core:** 新增额外菜单栏功能，新增超星额外菜单栏快捷页面跳转按钮 (c2066a0)
* **core:** 添加自定义答题器，可自定义题目类型、答题器等参数，自由度更高 (f1f7813)
* **core:** 添加软件辅助鼠标在空闲状态下执行辅助点击等功能，防止与用户抢夺控制权 (e5b3b1e)
* **core:** 答案匹配时移除标点符号保证匹配更加准确 (3f02c30)
* **icourse:** 修复中国大学MOOC无法完成富文本任务的BUG (5dc3c06)
* **scirpt:** 修复上个版本中国大学MOCC考试部分题目答题错误问题 (bcf21b3)
* **scirpt:** 修复资源库最新版链接类名改变问题 (341b37f)
* **script:** - 添加搜题结果AI标注显示 (7783cee)
* **script:** 优化 eslint 报错 (036644f)
* **script:** 优化 waitForElement API (4cf2191)
* **script:** 优化代码 (bdbcb47)
* **script:** 优化代码 (c08eece)
* **script:** 优化多选题纯答案无法解析的BUG (97d8655)
* **script:** 优化对超星视频下载错误的处理，将自动跳过错误视频 (b4f32c8)
* **script:** 优化旧版智慧树视频容易黑屏的问题 (e2535ad)
* **script:** 优化智慧树-智慧课程播放逻辑 (8ea5248)
* **script:** 优化智慧树学习提示文案 (5bc0545)
* **script:** 优化智慧树翻转课（校内课） (af04c36)
* **script:** 优化智慧树音量开始播放后没有立即调整的问题 (eff3c71)
* **script:** 优化版本更新验证，不符合版本书写规范的话向用户提示报错 (70dd13b)
* **script:** 优化职教云资源库无法答题的问题 (c94c41e)
* **script:** 优化超星TOP域查找 (826e552)
* **script:** 优化超星人脸识别检测警告 (311d8ad)
* **script:** 优化超星视频重复播放时没有重置视频进度的问题 (c167ff0)
* **script:** 优化超星跳转时间太长的问题，改成智能等待时间 (6314616)
* **script:** 优化超星闯关模式重复提示 (fd83815)
* **script:** 优化超星非整卷预览考试流畅度，添加搜索结果对于部分答页面题过程可控的菜单 (f1f9082)
* **script:** 优化超星章节测试答题时自动打开搜索结果功能 (7cc0046)
* **script:** 优化超星题库配置为空警告 (9257770)
* **script:** 优化题库配置文案和第三方连接文案 (e66d399)
* **script:** 优化题库配置的开启和关闭按钮 (b9197c6)
* **script:** 优化题库配置的开启和关闭按钮 (39b3046)
* **script:** 使用软件辅助模拟输入填空适配智慧树智慧课程掌握度填空题 (a57be37)
* **script:** 修复 '"@honghu/core"' has no exported member 'createQuestionTitleExtra'. BUG (9f06abe)
* **script:** 修复 waitForMedia 中 setInterval 内存泄漏 (ed06b88)
* **script:** 修复 waitForMedia 中 setInterval 内存泄漏 (4e03fef)
* **script:** 修复2026上学期智慧树-新智慧课程无法自动下一章的BUG (437696d)
* **script:** 修复2倍速被删除的BUG (a861685)
* **script:** 修复上个版本任务点检测不到的BUG (8bf7551)
* **script:** 修复上个版本图片链接处理导致的无法选择BUG (baaed06)
* **script:** 修复上个版本智慧树会长时间不播放的BUG (aa7c66f)
* **script:** 修复上个版本类型报错 (f472a0e)
* **script:** 修复中国大学MOOC作业答题错乱问题 (3dfcef1)
* **script:** 修复中国大学MOOC新版考试无法运行的BUG (8f0a188)
* **script:** 修复中国大学MOOC无法提交视频内测验的问题 (621c612)
* **script:** 修复中国大学MOOC无法提交讨论的BUG，优化中国大学MOOC日志显示 (5b1ab57)
* **script:** 修复中国大学MOOC视频答题和章节测试冲突的问题 (a61a8e0)
* **script:** 修复中国大学MOOC视频题目重复答题的BUG (7c6fd88)
* **script:** 修复全域名版本无法显示BUG (6d52ec4)
* **script:** 修复图片题中的图片在解析时重复出现的BUG (84c697e)
* **script:** 修复搜索时换行被删除导致，两行合并造成的文字合并，导致搜索引擎可能出现的的搜索问题 (b318c1e)
* **script:** 修复搜索结果AI标识重复出现的BUG (2857f2f)
* **script:** 修复新版智慧树无法关闭弹窗的BUG (7b356d3)
* **script:** 修复无法移动面板至边缘导致自动登录失效的BUG (a05d0a1)
* **script:** 修复智慧树-AI助教倍速无法点击的BUG (8ffa983)
* **script:** 修复智慧树-AI助教课程无法自动跳转小节和PPT的BUG (fe76e0e)
* **script:** 修复智慧树-新形态课程考完后预览界面依旧运行答题的BUG (495945b)
* **script:** 修复智慧树-新形态课程链接任务点无法跳过的BUG (51a639d)
* **script:** 修复智慧树-智慧职教无法学习文本任务点的问题，新增智慧职教已完成任务点过滤功能 (aaf7774)
* **script:** 修复智慧树-智慧课程无法自动下一章的BUG (48b8567)
* **script:** 修复智慧树-智慧课程无法自动切换下一个的BUG (b02d864)
* **script:** 修复智慧树26年上半年studywisdomh5复习模式错误的问题 (2e82a0a)
* **script:** 修复智慧树倍速失效的BUG (26a9a6d)
* **script:** 修复智慧树新形态课程（智慧课程）某些外链无法完成并跳过的BUG (d9bbd50)
* **script:** 修复智慧树校内课考试重复搜题的BUG (0e0e02c)
* **script:** 修复智慧树答题时题库缓存未正确存储的BUG (978d927)
* **script:** 修复智慧职教AI测验答题时填空功能失效的BUG (d850bea)
* **script:** 修复智慧职教AI测验答题时无法填空的BUG (edb492a)
* **script:** 修复智慧职教自定义全局倍速后导致其他脚本倍速选项也被修改的BUG (5877a6c)
* **script:** 修复智慧课程AI伴学的视频无法检测，以及掌握度只有一题的情况无法答题的BUG (8ff88f2)
* **script:** 修复添加额外菜单栏后，窗口无法正常最大化/最小化的BUG (22c45bc)
* **script:** 修复职教云PPT仅有2页时无法完成的BUG (018462f)
* **script:** 修复职教云卡在获取数据弹窗 (8acf60d)
* **script:** 修复职教云获取数据时跳转其他网页的BUG (4237698)
* **script:** 修复职教云获取数据错误的问题 (5565799)
* **script:** 修复职教云资源库，课件类型为NAN的BUG (8b8768e)
* **script:** 修复职教云资源库PPT总是会返回第一页才结束的BUG (e665f55)
* **script:** 修复职教云资源库PPT总是会返回第一页才结束的BUG (5aab29b)
* **script:** 修复职教云资源库总是无法学满进度的BUG (b06dc44)
* **script:** 修复职教云资源库无法跳过测验的问题 (34e4f38)
* **script:** 修复职教云资源库点击PPT过快的BUG (454ee5d)
* **script:** 修复职教云资源库重复下一章的BUG (b566a5c)
* **script:** 修复职教云资源库附件视频任务无法完成的BUG (e8635e5)
* **script:** 修复职教云章节列表前面有章节序号时无法读取数据的BUG (6ffd21e)
* **script:** 修复英语前缀 【True or False】 的BUG (01e1418)
* **script:** 修复请求记录开启后无法读取内容的BUG (31d2a85)
* **script:** 修复超星在章节列表页面提示已进入学习界面的BUG (9e899e8)
* **script:** 修复超星学习通没配置题库无法跳过章节测试的BUG (e27d978)
* **script:** 修复超星搜题时无法读取选项内图片链接的BUG (d57cb8f)
* **script:** 修复超星某些章节测试无法自动答题的BUG (62b0aaf)
* **script:** 修复超星视频加载失败无法重启的BUG (385d8a3)
* **script:** 修复超星视频暂停后长时间才播放的BUG (a26c03b)
* **script:** 修复超星答题时无法读取多行题目的问题 (338fbfc)
* **script:** 修复超星考试类型填空题选项搜索出现大量未知代码 (edff881)
* **script:** 修复超星自动答题时填空题选项读取到额外冗余文字的BUG：（段落格式，字号，字体） (f95f2ea)
* **script:** 修复超星英语判断题的文本BUG (5c785ab)
* **script:** 修复超星课程，章节测试偶尔出现卡死的BUG (24b499d)
* **script:** 修复超星课程进入时需要人脸识别，但是疯狂跳转新版本导致的人脸识别疯狂刷新的BUG (4fb764b)
* **script:** 修复超星路径 mooc-ans/mycourse/studentstudy 跳转新版后404的问题 (d2137ed)
* **script:** 修复超星跳转未完成任务点模式无法使用的BUG (a1ed883)
* **script:** 修复超星非预览模式题目错乱的BUG (c65d6a5)
* **script:** 修复超星章节测试多行题目第二行存在题目类型时无法解析题目的BUG (3cdfa3c)
* **script:** 修复超星默认跳转模式无法自动滚动页面到当前章节列表问题 (5600bdd)
* **script:** 修复软件开启同步后，其他非自动化辅助网页里面的脚本依然会同步的问题，造成用户以为当前页面可以使用软件辅助的错觉 (65920e2)
* **script:** 修复选择输入框中默认值匹配错误导致的超星自动保存选择'save'，但是默认值依旧是80的问题 (a2b639f)
* **script:** 修复配置多个题库其中某个超时无法答题的BUG (dd569dc), closes [#270](https://github.com/HONGHUTECHNOLOGY/honghueasystudy/issues/270)
* **script:** 修复重新答题按钮点击后，答题完成后的一些操作依然在进行的BUG (e7148a3)
* **script:** 修复高级设置无法打开的BUG (81dbc12)
* **script:** 修改搜题超时默认时间为2分钟，最大值为3分钟 (a2a662f)
* **script:** 修改职教云资源库视频PPT跳转间隔为5秒 (32504fa)
* **script:** 修改超星版本切换文案 (b7b094e)
* **script:** 修改软件辅助启动提示 (0021b5d)
* **script:** 修改软件辅助返回字段 (270f104)
* **script:** 修改题库配置按钮文案，优化题库配置界面文案，主次分明 (3d237ea)
* **script:** 全面优化答题速度，优化存在题库缓存时无需执行搜题间隔等待，优化特定网课勾选答案时需要停顿，正常网课无需停顿的情况，极大加速了答案勾选过程。 (1ca3448)
* **script:** 兼容2025下半年超星PPT新版无法完成的问题 (cbe876e)
* **script:** 兼容26年上半年智慧树新版studywisdomh5网课更新 (cf52bf0)
* **script:** 兼容中国大学MOOC网络并发的问题，调整答题速度，修复填空题无法正常填写的问题 (ad03090)
* **script:** 兼容智慧树-AI助教课程PPT和文档功能 (7c456ed)
* **script:** 兼容职教云xls任务点自动学习 (7a3a174)
* **script:** 兼容职教云在线课程内容单独任务点连续学习功能，添加PPT翻阅速度调整选项 (9883897)
* **script:** 兼容职教云添加章节层级名字后无法获取数据的问题 (afa37cf)
* **script:** 兼容职教云资源库WAV音频任务点播放 (76a1e56)
* **script:** 兼容职教云资源库新版PPT (4919cef)
* **script:** 兼容超星整卷预览禁用后的作业和答题 (07139d7)
* **script:** 兼容超星新版连线题 (f9ebaa5)
* **script:** 兼容超星繁体字判断题适配 (a81cd57)
* **script:** 兼容超星长时阅读任务点（限制翻页时间） (ac34ba2)
* **script:** 兼容雨课堂AI学伴自动学习 (c96f4db)
* **script:** 加强智慧树作业考试自动保存警告 (7a44eb7)
* **script:** 对 TikuAdapter 做适配提示 (cf2fe10)
* **script:** 对超星复习模式文案做修改 (cabf37e)
* **script:** 对题库配置做唯一化处理 (4bc0112)
* **script:** 将超星环境调整脚本整合到内部，防止全局污染 (b8a2a20)
* **script:** 尝试修复智慧树AI学伴课程过一段时间才会播放的BUG (7c56dc9)
* **script:** 持续修复超星跳转未完成任务点模式无法使用的BUG (66a74a2)
* **script:** 支持中国大学MOOC视频内弹窗答题 (8af7ec2)
* **script:** 支持中国大学MOOC自动考试功能 (40fbfdd)
* **script:** 支持单选题中出现的判断选项，直接判定为判断题进行回答 (42de2cf)
* **script:** 支持搜索结果界面可控制答题进程功能 (98573b5)
* **script:** 支持智慧树智慧课程链接任务点 (285140f)
* **script:** 支持职教云课堂作业测试 (862aff7)
* **script:** 新增 中国大学MOOC 考试功能 (7286fa4)
* **script:** 新增【职教云】资源库作业支持 (3cf9968)
* **script:** 新增对职教云资源库的 spocjob 作业的支持 (007d39a)
* **script:** 新增对超星链接任务点，音频PPT任务点的支持，优化代码，删除视频错误检测功能。 (e90f1bb)
* **script:** 新增智慧树2025-9月份最新课程支持-新智慧课程 (4f3780a)
* **script:** 新增智慧职教 webtrn.cn 套壳网站支持，新增对30分钟学习弹窗的关闭功能 (b17a19f)
* **script:** 新增智慧职教AI课程学习和作业脚本 (27ec1fb)
* **script:** 新增超星 cugbonline.cn 域名支持 (359425a)
* **script:** 新增超星域名 xuexi365 (77d7f8f)
* **script:** 新增超星开关：自动切换未完成章节，并与复习模式区分开来 (213c32e)
* **script:** 新增雨课堂V2学习内容自动看视频、和讨论功能 (d8095b6)
* **script:** 智慧树答题时移动页面至左上角防止点击出错 (7f835c0)
* **script:** 添加ZE题库域名白名单授权 (a5bdb91)
* **script:** 添加中国大学MOOC空白页自动跳转的功能 (c562d2c)
* **script:** 添加全局快捷菜单自动注册功能 (11403f6)
* **script:** 添加最小化/切屏窗口警告功能，优化文案 (22028e4)
* **script:** 添加多个答题页面菜单自动注册功能 (b101424)
* **script:** 添加如何关闭脚本的教程提示 (4a7722d)
* **script:** 添加完成率百分比符号 (beec370)
* **script:** 添加对2025-8月份智慧树新掌握度页面进行适配 (07cab10)
* **script:** 添加对智慧树2025-9月份教学空间-AI智慧学习支持 (da9d229)
* **script:** 添加搜索结果界面题库连接失败的解决提示 (e42b682)
* **script:** 添加新版职教云自动跳转旧版功能 (55a9f1e)
* **script:** 添加智慧树-AI教学中心-题目作业自动答题功能 (2a630aa)
* **script:** 添加智慧树-新形态课程填空题和简答题的支持 (bc1bc02)
* **script:** 添加智慧树-新形态课程自动考试功能 (587a045)
* **script:** 添加智慧树2026上学期新版HIKE AI教学中心视频学习功能 (392a1a5)
* **script:** 添加智慧树作业禁止同时打开多个界面答题文案 (f1cd8cb)
* **script:** 添加智慧树倍速最高风险说明 (cffcbc9)
* **script:** 添加智慧树共享课作业开启前阅读须知功能 (7e7657b)
* **script:** 添加智慧树新智慧形态考试菜单进入菜单栏 (d9d362b)
* **script:** 添加智慧树智慧课程跳转模式选择 (822ab99)
* **script:** 添加职教云卡死提示解决方法 (05493be)
* **script:** 添加职教云资源库修复功能按钮 (898bb3b)
* **script:** 添加超星下一章切换后自动滚动到该元素的功能 (c5c0726)
* **script:** 添加超星凌晨刷课文案提示 (f17992c)
* **script:** 添加超星域名支持：jnzyjsxy.cn (a27cb49)
* **script:** 添加超星对 jxgmxy.com 域名的支持 (b75b714)
* **script:** 添加超星积分课的使用提示 (ea74563)
* **script:** 添加超星阅读界面的使用提示 (a8aa869)
* **script:** 添加超星章节测试答题时自动显示搜索结果 (967c495)
* **script:** 添加超星页面加载后自动滚动到当前任务点的功能 (16232df)
* **script:** 添加长江雨课堂手机版跳转电脑版功能 (2b455d3)
* **script:** 添加随机答题设置仅支持超星章节测试的提示 (3b9e135)
* **script:** 添加雨课堂成绩单界面进入后视频不支持提示 (fc7c2fb)
* **script:** 添加题库数量限制（10个） (65462a5)
* **script:** 添加题库连接失败解决方法 (53c01cb)
* **script:** 添加题库配置相同检测，如果相同则提示 (9acb07e)
* **script:** 移除答案匹配模式设置 (66d8e8b)
* **script:** 解决超星视频播放时出现： The play() request was interrupted by a call to pause() BUG (4791bd8)
* **script:** 解决超星部分套壳网站无法自动下一章的BUG (e8f05b6)
* **script:** 软件配置同步后添加脚本双击配置页面强制取消功能 (99948e9)
* **script:** 适配 2026 上学期智慧树-新智慧学习界面 (6f449cc)
* **script:** 适配2025-12月智慧树新智慧学习域名 (acc2c79)
* **script:** 适配智慧树-AI教学中心-智慧课程作业答题功能 (3d124af)
* **script:** 适配智慧树-智慧课程-AI学伴掌握度无法答题的问题 (ce6262f)
* **script:** 适配智慧树AI教学中心考试功能 (0decae5)
* **script:** 适配智慧树智慧课程学习和作业（包括AI助教和智慧课程），适配智慧树新版课程页面，适配智慧课程掌握度自动答题 (7cd9dfd)
* **script:** 适配超星积分课的阅读任务不会自动开始阅读的问题 (9b8ff4f)
* **script:** 降低超星倍速警告阈值为2倍速，优化倍速警告 (5aababb)
* typo (57d4077)
* 优化CI自动发布流程 (68d378f)
* 优化使用教程文案，优化开关按钮样式 (8b3d3c7)
* 优化倍速设置选项，减少不必要的选项数量 (566ff84)
* 优化支持职教云最新版页面，支持自动切换下一章（包含大章节切换） (c73a1cc)
* 优化智慧树卡巴斯基文案 (99253d6)
* 优化智慧树智慧课程视频检测，修复智慧树智慧课程检测不到任务点问题 (2f3777d)
* 优化智慧树考试提示文案 (b1e92a3)
* 优化测试用例、并且新增多个测试例子 (ec08c92)
* 优化脚本CI自动化发布流程 (0ee2537)
* 优化脚本CI自动化发布流程 (ab907ef)
* 优化超星随机答题文案，提示只有在搜不到答案的时候才使用随机答题 (3e07067)
* 优化软件同步功能 (2c1ecfc)
* 修复 4.9.51 版本题库配置解析问题 (b3d3e32)
* 修复 github workflow 运行后 release 不显示更新内容的BUG (96065e7)
* 修复 github workflow 运行后 release 不显示更新内容的BUG (addb25a)
* 修复 github workflow 运行后 release 不显示更新内容的BUG (2bacbfd)
* 修复 github workflow 运行后 release 不显示更新内容的BUG (676c7ed)
* 修复 select 选择框显示问题 (9f5b741)
* 修复CI无法显示CHANGE_LOG的问题 (ed8ac1e)
* 修复CI自动化发布流程无法识别版本号的BUG (731fd99)
* 修复ESlint代码检查报错 (7c60bc1)
* 修复上个版本无法打包的BUG (97608d8)
* 修复智慧树AI学伴掌握度界面无法自动触发答题的BUG (61b8005)
* 修复智慧职教题目图片链接被丢弃问题 (e2e205d)
* 修复智慧职教题目识别丢失img的src问题 (482ac64)
* 修复智慧职教题目识别丢失img的src问题,使用与学习通页面相同的方法 (488f467)
* 修复智慧职教题目识别丢失img的src问题,使用与学习通页面相同的方法,且考虑纯图片无法识别问题 (3a23e04)
* 修复智慧职教题目识别丢失img的src问题,使用与学习通页面相同的方法,且考虑纯图片无法识别问题 (d020954)
* 修复职教云0资源库无法下一章的BUG，兼容职教云部分PPT任务点 (69230c4)
* 修复超星答题时无法点击快速定位到题库配置界面问题 (855e8e9)
* 修改Github错误报告和功能建议界面 (9f85e3a)
* 修改脚本更新链接到教程官网的更新教程 (dd24c40)
* 修改默认答题器API名 (ff1139c)
* 删除无用API (8c8425f)
* 对全部项目的依赖进行版本锁定 (f760f6d)
* 导出 $elelment 对象，便于可修改 $modal 第二个参数 (13a1b6d)
* 尝试修复Git打包错误的BUG (30cbbbc)
* 尝试修复Git打包错误的BUG (abb6e7b)
* 持续优化脚本CI自动化发布流程 (1566c31)
* 持续优化脚本CI自动化发布流程 (63ad1b2)
* 持续优化脚本CI自动化发布流程 (8257215)
* 持续优化软件辅助安装提示 (90d9cd1)
* 持续修复 github workflow 运行后 release 不显示更新内容的BUG (ecfa203)
* 更新 easy-us API (0150b49)
* 更新API，添加新API $msg，可同时显示气泡和打印日志 (099907a)
* 添加 git workflow 输出 (467d53d)
* 添加metajs脚本元信息文件打包以便更新 (c2aba7f)
* 添加PR新流程逻辑：separate-pull-requests (a02c0d1)
* 添加智慧树-智慧课程掌握度学习提示 (908df79)
* 添加智慧树-智慧课程掌握度答题功能 (316eb6d)
* 添加答案匹配模式的测试用例 (927351f)
* 添加答题日志输出开关功能 (d041373)
* 添加超星 ccqmxx.com 域名适配支持 (79eb947)
* 添加超星自动跳转未完成任务点功能 (24927e6)
* 添加雨课堂到面板首页支持列表中 (3180fb9)
* 移除CI自动发布到NPM的步骤 (5cd0f3c)
* 超星任务点检测优化 (ce6c3ac)

## 4.14.4 (2026-06-25)


* **core:** 优化单选题匹配算法，优先选择精确匹配项 (10c300f)
* **core:** 优化单选题匹配算法，优先选择精确匹配项 (9f5dfd2)
* **script:** 修复超星考试类型填空题选项搜索出现大量未知代码 (edff881)
* 修改Github错误报告和功能建议界面 (9f85e3a)
* 添加metajs脚本元信息文件打包以便更新 (c2aba7f)

## 4.14.3 (2026-06-17)


* 修复CI无法显示CHANGE_LOG的问题 (ed8ac1e)

## 4.14.2 (2026-06-17)


### 🐛 Bug Fixes

* 移除CI自动发布到NPM的步骤 (5cd0f3c)

## 4.14.1 (2026-06-17)


### 🐛 Bug Fixes

* **core:** 修复答案匹配算法选择多余选项导致错题 (7dcaeb0), closes [#222](https://github.com/HONGHUTECHNOLOGY/honghueasystudy/issues/222)
* **script:** 修复智慧树校内课考试重复搜题的BUG (0e0e02c)
* **script:** 修复超星非预览模式题目错乱的BUG (c65d6a5)
* **script:** 适配智慧树AI教学中心考试功能 (0decae5)
* 修复CI自动化发布流程无法识别版本号的BUG (731fd99)
* 修复ESlint代码检查报错 (7c60bc1)
* 持续优化脚本CI自动化发布流程 (1566c31)


### ⚡ Performance

* **script:** 支持单选题中出现的判断选项，直接判定为判断题进行回答 (42de2cf)
* **script:** 添加长江雨课堂手机版跳转电脑版功能 (2b455d3)
* **script:** 添加随机答题设置仅支持超星章节测试的提示 (3b9e135)
* **script:** 移除答案匹配模式设置 (66d8e8b)
* 优化CI自动发布流程 (68d378f)
* 优化使用教程文案，优化开关按钮样式 (8b3d3c7)
* 添加答案匹配模式的测试用例 (927351f)
* 添加雨课堂到面板首页支持列表中 (3180fb9)

## 4.14.0 (2026-06-11)


### Features

* **all:** 优化API，分离UI层为新项目 easy-us (ecc4ff6)
* **core:** 对移动端进行拖动面板适配 (d253f8b)
* **core:** 新增答案匹配模式选项 (aab04af)
* **core:** 新增额外菜单栏功能，新增超星额外菜单栏快捷页面跳转按钮 (c2066a0)
* **core:** 添加自定义答题器，可自定义题目类型、答题器等参数，自由度更高 (f1f7813)
* **core:** 添加软件辅助鼠标在空闲状态下执行辅助点击等功能，防止与用户抢夺控制权 (e5b3b1e)
* **script:** - 添加搜题结果AI标注显示 (7783cee)
* **script:** 优化超星章节测试答题时自动打开搜索结果功能 (7cc0046)
* **script:** 优化题库配置文案，优化超星文案，并添加运行时的反馈消息提示 (d61d3ee)
* **script:** 修复智慧树倍速失效的BUG (26a9a6d)
* **script:** 修复超星人脸验证时疯狂刷新的问题，新增超星人脸验证通知功能 (e75786c)
* **script:** 兼容职教云在线课程内容单独任务点连续学习功能，添加PPT翻阅速度调整选项 (9883897)
* **script:** 兼容超星繁体字判断题适配 (a81cd57)
* **script:** 兼容超星长时阅读任务点（限制翻页时间） (ac34ba2)
* **script:** 兼容雨课堂AI学伴自动学习 (c96f4db)
* **script:** 在拓展应用中添加鸿鹄易学全部配置的导入导出功能 (0237e88)
* **script:** 对 TikuAdapter 做适配提示 (cf2fe10)
* **script:** 对题库配置做唯一化处理 (4bc0112)
* **script:** 支持中国大学MOOC视频内弹窗答题 (8af7ec2)
* **script:** 支持中国大学MOOC自动考试功能 (40fbfdd)
* **script:** 支持搜索结果界面可控制答题进程功能 (98573b5)
* **script:** 支持智慧树智慧课程链接任务点 (285140f)
* **script:** 支持职教云课堂作业测试 (862aff7)
* **script:** 新增 $message 跨域调用功能，新增 $modal duration 参数，修复由于删除cors监听key导致的 undefined BUG (320903f)
* **script:** 新增 中国大学MOOC 考试功能 (7286fa4)
* **script:** 新增【职教云】资源库作业支持 (3cf9968)
* **script:** 新增对职教云资源库的 spocjob 作业的支持 (007d39a)
* **script:** 新增对超星链接任务点，音频PPT任务点的支持，优化代码，删除视频错误检测功能。 (e90f1bb)
* **script:** 新增新版职教云作业填空题支持 (a09dcac)
* **script:** 新增智慧树2025-9月份最新课程支持-新智慧课程 (4f3780a)
* **script:** 新增智慧职教AI课程学习和作业脚本 (27ec1fb)
* **script:** 新增职教云考试支持，txt文档查看支持 (f95e8f8)
* **script:** 新增超星 cugbonline.cn 域名支持 (359425a)
* **script:** 新增雨课堂V2学习内容自动看视频、和讨论功能 (d8095b6)
* **script:** 添加ZE题库域名白名单授权 (a5bdb91)
* **script:** 添加全局快捷菜单自动注册功能 (11403f6)
* **script:** 添加最小化/切屏窗口警告功能，优化文案 (22028e4)
* **script:** 添加对2025-8月份智慧树新掌握度页面进行适配 (07cab10)
* **script:** 添加对智慧树2025-9月份教学空间-AI智慧学习支持 (da9d229)
* **script:** 添加对智慧树自动保存答案的解释 (53f0846)
* **script:** 添加开发人员调试：显示Tab变量功能 (a779b35)
* **script:** 添加新版职教云自动跳转旧版功能 (55a9f1e)
* **script:** 添加智慧树-新形态课程自动考试功能 (587a045)
* **script:** 添加智慧树2026上学期新版HIKE AI教学中心视频学习功能 (392a1a5)
* **script:** 添加智慧职教MOOC的单行填空题支持 (5361ec4)
* **script:** 添加职教云 flv 格式支持 (08d6719)
* **script:** 添加职教云的作业考试【客观填空题】的支持 (92c5133)
* **script:** 添加超星 gdhkmooc.com 域名支持 (c63e6d6)
* **script:** 添加超星下一章切换后自动滚动到该元素的功能 (c5c0726)
* **script:** 添加超星域名支持：jnzyjsxy.cn (a27cb49)
* **script:** 添加超星完成全部任务点后重新从开头学习功能 (86454d3)
* **script:** 添加超星对 jxgmxy.com 域名的支持 (b75b714)
* **script:** 添加超星章节测试答题时自动显示搜索结果 (967c495)
* **script:** 添加超星页面加载后自动滚动到当前任务点的功能 (16232df)
* **script:** 添加题库配置相同检测，如果相同则提示 (9acb07e)
* **script:** 添加题库配置自动读取剪贴板功能 (fe19557)
* **script:** 软件配置同步后添加脚本双击配置页面强制取消功能 (99948e9)
* **script:** 适配智慧树-AI教学中心-智慧课程作业答题功能 (3d124af)
* **script:** 适配智慧树智慧课程学习和作业（包括AI助教和智慧课程），适配智慧树新版课程页面，适配智慧课程掌握度自动答题 (7cd9dfd)
* 优化支持职教云最新版页面，支持自动切换下一章（包含大章节切换） (c73a1cc)
* 新增 answer_separator 答案分隔符设置 (a742f80)
* 添加智慧树-智慧课程掌握度答题功能 (316eb6d)
* 添加超星 ccqmxx.com 域名适配支持 (79eb947)
* 添加超星自动跳转未完成任务点功能 (24927e6)


### Bug Fixes

* **build:** 修复 Workflow 无法读取本地更新日志的BUG (5054129)
* **build:** 修复全域名通用版本不带官方域名的BUG (ce042af)
* **common:** 题库缓存清空后弹窗数量文字归零 (7a1ae7d)
* **core:** 优化Playwright软件辅助底层对接，添加软件辅助点击可视化，修复元素滚动后点击错位的BUG (e5daaae)
* **core:** 优化搜索结果显示，内部算法报错依然可以显示搜索结果 (e002e3d)
* **core:** 优化搜索结果的显示BUG，已搜到答案的题目显示未匹配到正确答案的BUG，以及答题进度不一致的显示BUG (2fd9a72)
* **core:** 优化答题器算法 (d29c74c)
* **core:** 优化答题模块算法 (545d9bc)
* **core:** 优化跨域通信只在顶部页面刷新时删除临时监听变量，优化代码添加注释 (0f07dc4)
* **core:** 修复上个版本无法打包的BUG (089aaaf)
* **core:** 修复使用精确匹配时，脚本的多选题搜索结果会全部显示已完成的BUG (65cfc48)
* **core:** 修复单选题答案回调内容不一致的BUG (4265263)
* **core:** 修复图片题解析错误导致的URL重复，图片重复显示等问题 (f5cc59f)
* **core:** 修复已经在暂停状态，但是依然在答题的BUG (3f04e21)
* **core:** 修复当数字输入框是空格后无法正确读取的BUG (fa7f2d5)
* **core:** 修复新版答题器当线程为1时，无法搜题的BUG (bd2bd53)
* **core:** 修复新版答题算法中搜题线程参数无效的BUG，始终只有一个搜题线程在运行 (9e052f8)
* **core:** 修复窗口反复闪烁的BUG (217b5e1)
* **core:** 修复窗口隐藏/显示 快捷键无效的BUG (8002c82)
* **core:** 修复答案为圆圈数字时无法答题的BUG (676f437)
* **core:** 修复设置超出最大最小值，导致变更时，本地的值没有同步导致刷新后依然没有发生变化的BUG (0b05507)
* **core:** 修复隐藏窗口按钮无法使用的BUG (c028a8f)
* **core:** 修复题库请求时无法传递类型为0或者false的值 (6c8a26f)
* **core:** 修复题库配置 AnswererWrapper 自定义字段解析 handler 函数调用两次的BUG (1e15377)
* **core:** 全局设置中部分元素的值为空时恢复默认值 (9d539d0)
* **core:** 兼容搜题结果格式A#B#C#D解析为多选题 (0d29813)
* **core:** 新答题器的旧字段搜索结果显示修改 (d8511a0)
* **core:** 答案匹配时移除标点符号保证匹配更加准确 (3f02c30)
* **icourse:** 修复中国大学MOOC无法完成富文本任务的BUG (5dc3c06)
* **scirpt:** 修复上个版本中国大学MOCC考试部分题目答题错误问题 (bcf21b3)
* **scirpt:** 修复资源库最新版链接类名改变问题 (341b37f)
* **script:** 优化 eslint 报错 (036644f)
* **script:** 优化 TikuAdapter 提示 (43622ba)
* **script:** 优化代码 (bdbcb47)
* **script:** 优化代码 (c08eece)
* **script:** 优化多选题纯答案无法解析的BUG (97d8655)
* **script:** 优化对超星视频下载错误的处理，将自动跳过错误视频 (b4f32c8)
* **script:** 优化旧版智慧树视频容易黑屏的问题 (e2535ad)
* **script:** 优化智慧树-智慧课程播放逻辑 (8ea5248)
* **script:** 优化智慧树翻转课（校内课） (af04c36)
* **script:** 优化智慧树音量开始播放后没有立即调整的问题 (eff3c71)
* **script:** 优化职教云资源库无法答题的问题 (c94c41e)
* **script:** 优化超星人脸识别检测警告 (311d8ad)
* **script:** 优化超星视频重复播放时没有重置视频进度的问题 (c167ff0)
* **script:** 优化超星英文判断题的解析 (78be04e)
* **script:** 优化超星闯关模式以及解锁模式的重复进入检测算法 (b148232)
* **script:** 优化超星非整卷预览考试流畅度，添加搜索结果对于部分答页面题过程可控的菜单 (f1f9082)
* **script:** 优化超星题库配置为空警告 (9257770)
* **script:** 优化题库配置的开启和关闭按钮 (b9197c6)
* **script:** 优化题库配置的开启和关闭按钮 (39b3046)
* **script:** 使用软件辅助模拟输入填空适配智慧树智慧课程掌握度填空题 (a57be37)
* **script:** 修复 '"@honghu/core"' has no exported member 'createQuestionTitleExtra'. BUG (9f06abe)
* **script:** 修复 waitForMedia 中 setInterval 内存泄漏 (ed06b88)
* **script:** 修复 waitForMedia 中 setInterval 内存泄漏 (4e03fef)
* **script:** 修复2026上学期智慧树-新智慧课程无法自动下一章的BUG (437696d)
* **script:** 修复2倍速被删除的BUG (a861685)
* **script:** 修复上个版本任务点检测不到的BUG (8bf7551)
* **script:** 修复上个版本图片链接处理导致的无法选择BUG (baaed06)
* **script:** 修复上个版本智慧树会长时间不播放的BUG (aa7c66f)
* **script:** 修复上个版本类型报错 (f472a0e)
* **script:** 修复中国大学MOOC作业答题错乱问题 (3dfcef1)
* **script:** 修复中国大学MOOC新版考试无法运行的BUG (8f0a188)
* **script:** 修复中国大学MOOC无法提交视频内测验的问题 (621c612)
* **script:** 修复中国大学MOOC视频答题和章节测试冲突的问题 (a61a8e0)
* **script:** 修复中国大学MOOC视频题目重复答题的BUG (7c6fd88)
* **script:** 修复全域名版本无法显示BUG (6d52ec4)
* **script:** 修复图片题中的图片在解析时重复出现的BUG (84c697e)
* **script:** 修复搜索时换行被删除导致，两行合并造成的文字合并，导致搜索引擎可能出现的的搜索问题 (b318c1e)
* **script:** 修复搜索结果AI标识重复出现的BUG (2857f2f)
* **script:** 修复新版智慧树无法关闭弹窗的BUG (7b356d3)
* **script:** 修复无法移动面板至边缘导致自动登录失效的BUG (a05d0a1)
* **script:** 修复智慧树-AI助教倍速无法点击的BUG (8ffa983)
* **script:** 修复智慧树-AI助教课程无法自动跳转小节和PPT的BUG (fe76e0e)
* **script:** 修复智慧树-新形态课程链接任务点无法跳过的BUG (51a639d)
* **script:** 修复智慧树-智慧职教无法学习文本任务点的问题，新增智慧职教已完成任务点过滤功能 (aaf7774)
* **script:** 修复智慧树-智慧课程无法自动下一章的BUG (48b8567)
* **script:** 修复智慧树-智慧课程无法自动切换下一个的BUG (b02d864)
* **script:** 修复智慧树26年上半年studywisdomh5复习模式错误的问题 (2e82a0a)
* **script:** 修复智慧树新形态课程（智慧课程）某些外链无法完成并跳过的BUG (d9bbd50)
* **script:** 修复智慧树无法使用软件辅助，无法自动答题看视频的BUG (a3cdb6f)
* **script:** 修复智慧树答题时题库缓存未正确存储的BUG (978d927)
* **script:** 修复智慧职教AI测验答题时填空功能失效的BUG (d850bea)
* **script:** 修复智慧职教AI测验答题时无法填空的BUG (edb492a)
* **script:** 修复智慧职教自定义全局倍速后导致其他脚本倍速选项也被修改的BUG (5877a6c)
* **script:** 修复智慧课程AI伴学的视频无法检测，以及掌握度只有一题的情况无法答题的BUG (8ff88f2)
* **script:** 修复添加额外菜单栏后，窗口无法正常最大化/最小化的BUG (22c45bc)
* **script:** 修复职教云PPT仅有2页时无法完成的BUG (018462f)
* **script:** 修复职教云卡在获取数据弹窗 (8acf60d)
* **script:** 修复职教云获取数据时跳转其他网页的BUG (4237698)
* **script:** 修复职教云获取数据错误的问题 (5565799)
* **script:** 修复职教云资源库，课件类型为NAN的BUG (8b8768e)
* **script:** 修复职教云资源库PPT总是会返回第一页才结束的BUG (e665f55)
* **script:** 修复职教云资源库PPT总是会返回第一页才结束的BUG (5aab29b)
* **script:** 修复职教云资源库总是无法学满进度的BUG (b06dc44)
* **script:** 修复职教云资源库无法跳过测验的问题 (34e4f38)
* **script:** 修复职教云资源库点击PPT过快的BUG (454ee5d)
* **script:** 修复职教云资源库重复下一章的BUG (b566a5c)
* **script:** 修复职教云资源库附件视频任务无法完成的BUG (e8635e5)
* **script:** 修复职教云章节列表前面有章节序号时无法读取数据的BUG (6ffd21e)
* **script:** 修复英语前缀 【True or False】 的BUG (01e1418)
* **script:** 修复解除复制粘贴限制功能无效的BUG (3f560a8)
* **script:** 修复请求记录开启后无法读取内容的BUG (31d2a85)
* **script:** 修复超星在章节列表页面提示已进入学习界面的BUG (9e899e8)
* **script:** 修复超星学习通没配置题库无法跳过章节测试的BUG (e27d978)
* **script:** 修复超星搜题时无法读取选项内图片链接的BUG (d57cb8f)
* **script:** 修复超星某些章节测试无法自动答题的BUG (62b0aaf)
* **script:** 修复超星视频加载失败无法重启的BUG (385d8a3)
* **script:** 修复超星视频暂停后长时间才播放的BUG (a26c03b)
* **script:** 修复超星答题时无法读取多行题目的问题 (338fbfc)
* **script:** 修复超星自动答题时填空题选项读取到额外冗余文字的BUG：（段落格式，字号，字体） (f95f2ea)
* **script:** 修复超星英语判断题的文本BUG (5c785ab)
* **script:** 修复超星课程，章节测试偶尔出现卡死的BUG (24b499d)
* **script:** 修复超星课程进入时需要人脸识别，但是疯狂跳转新版本导致的人脸识别疯狂刷新的BUG (4fb764b)
* **script:** 修复超星路径 mooc-ans/mycourse/studentstudy 跳转新版后404的问题 (d2137ed)
* **script:** 修复超星跳转未完成任务点模式无法使用的BUG (a1ed883)
* **script:** 修复超星章节测试多行题目第二行存在题目类型时无法解析题目的BUG (3cdfa3c)
* **script:** 修复超星默认跳转模式无法自动滚动页面到当前章节列表问题 (5600bdd)
* **script:** 修复软件开启同步后，其他非自动化辅助网页里面的脚本依然会同步的问题，造成用户以为当前页面可以使用软件辅助的错觉 (65920e2)
* **script:** 修复选择输入框中默认值匹配错误导致的超星自动保存选择'save'，但是默认值依旧是80的问题 (a2b639f)
* **script:** 修复通知时间很短就消失的BUG (cda009f)
* **script:** 修复部分脚本管理器无法读取 [@connect](https://github.com/connect) 头部元数据的问题 (69cec2f)
* **script:** 修复配置多个题库其中某个超时无法答题的BUG (dd569dc), closes [#270](https://github.com/HONGHUTECHNOLOGY/honghueasystudy/issues/270)
* **script:** 修复重新答题按钮点击后，答题完成后的一些操作依然在进行的BUG (e7148a3)
* **script:** 修复高级设置无法打开的BUG (81dbc12)
* **script:** 修改TikuAdapter type 类型解析 (9aaeb7d)
* **script:** 修改职教云资源库视频PPT跳转间隔为5秒 (32504fa)
* **script:** 修改软件辅助返回字段 (270f104)
* **script:** 全面优化答题速度，优化存在题库缓存时无需执行搜题间隔等待，优化特定网课勾选答案时需要停顿，正常网课无需停顿的情况，极大加速了答案勾选过程。 (1ca3448)
* **script:** 兼容2025下半年超星PPT新版无法完成的问题 (cbe876e)
* **script:** 兼容26年上半年智慧树新版studywisdomh5网课更新 (cf52bf0)
* **script:** 兼容中国大学MOOC网络并发的问题，调整答题速度，修复填空题无法正常填写的问题 (ad03090)
* **script:** 兼容智慧树-AI助教课程PPT和文档功能 (7c456ed)
* **script:** 兼容职教云xls任务点自动学习 (7a3a174)
* **script:** 兼容职教云添加章节层级名字后无法获取数据的问题 (afa37cf)
* **script:** 兼容职教云资源库WAV音频任务点播放 (76a1e56)
* **script:** 兼容职教云资源库新版PPT (4919cef)
* **script:** 兼容超星整卷预览禁用后的作业和答题 (07139d7)
* **script:** 兼容超星新版连线题 (f9ebaa5)
* **script:** 将超星环境调整脚本整合到内部，防止全局污染 (b8a2a20)
* **script:** 尝试修复智慧树AI学伴课程过一段时间才会播放的BUG (7c56dc9)
* **script:** 持续修复超星跳转未完成任务点模式无法使用的BUG (66a74a2)
* **script:** 新增智慧职教 webtrn.cn 套壳网站支持，新增对30分钟学习弹窗的关闭功能 (b17a19f)
* **script:** 智慧树答题时移动页面至左上角防止点击出错 (7f835c0)
* **script:** 添加中国大学MOOC空白页自动跳转的功能 (c562d2c)
* **script:** 添加多版本脚本的更新模块适配 (4a7aa19)
* **script:** 添加完成率百分比符号 (beec370)
* **script:** 添加智慧树-AI教学中心-题目作业自动答题功能 (2a630aa)
* **script:** 添加智慧树倍速最高风险说明 (cffcbc9)
* **script:** 添加智慧树智慧课程跳转模式选择 (822ab99)
* **script:** 添加职教云卡死提示解决方法 (05493be)
* **script:** 添加职教云资源库修复功能按钮 (898bb3b)
* **script:** 添加超星积分课的使用提示 (ea74563)
* **script:** 添加超星英文判断题的冗余删除 (35b8f07)
* **script:** 添加雨课堂成绩单界面进入后视频不支持提示 (fc7c2fb)
* **script:** 添加题库缓存开关 (35226d3)
* **script:** 解决超星视频播放时出现： The play() request was interrupted by a call to pause() BUG (4791bd8)
* **script:** 解决超星部分套壳网站无法自动下一章的BUG (e8f05b6)
* **script:** 适配 2026 上学期智慧树-新智慧学习界面 (6f449cc)
* **script:** 适配2025-12月智慧树新智慧学习域名 (acc2c79)
* **script:** 适配智慧树-智慧课程-AI学伴掌握度无法答题的问题 (ce6262f)
* **scrpt:** 优化题库配置在软件上的域名检测 (04fba87)
* typo (57d4077)
* 优化智慧树卡巴斯基文案 (99253d6)
* 优化智慧树智慧课程视频检测，修复智慧树智慧课程检测不到任务点问题 (2f3777d)
* 优化脚本CI自动化发布流程 (0ee2537)
* 优化软件同步功能 (2c1ecfc)
* 修复 4.9.51 版本题库配置解析问题 (b3d3e32)
* 修复 github workflow 运行后 release 不显示更新内容的BUG (96065e7)
* 修复 github workflow 运行后 release 不显示更新内容的BUG (addb25a)
* 修复 github workflow 运行后 release 不显示更新内容的BUG (2bacbfd)
* 修复 github workflow 运行后 release 不显示更新内容的BUG (676c7ed)
* 修复 select 选择框显示问题 (9f5b741)
* 修复上个版本无法打包的BUG (97608d8)
* 修复智慧树AI学伴掌握度界面无法自动触发答题的BUG (61b8005)
* 修复智慧职教题目图片链接被丢弃问题 (e2e205d)
* 修复智慧职教题目识别丢失img的src问题 (482ac64)
* 修复智慧职教题目识别丢失img的src问题,使用与学习通页面相同的方法 (488f467)
* 修复智慧职教题目识别丢失img的src问题,使用与学习通页面相同的方法,且考虑纯图片无法识别问题 (3a23e04)
* 修复智慧职教题目识别丢失img的src问题,使用与学习通页面相同的方法,且考虑纯图片无法识别问题 (d020954)
* 修复职教云0资源库无法下一章的BUG，兼容职教云部分PPT任务点 (69230c4)
* 修复超星答题时无法点击快速定位到题库配置界面问题 (855e8e9)
* 修改脚本更新链接到教程官网的更新教程 (dd24c40)
* 删除无用API (8c8425f)
* 对全部项目的依赖进行版本锁定 (f760f6d)
* 导出 $elelment 对象，便于可修改 $modal 第二个参数 (13a1b6d)
* 尝试修复Git打包错误的BUG (30cbbbc)
* 尝试修复Git打包错误的BUG (abb6e7b)
* 持续优化脚本CI自动化发布流程 (63ad1b2)
* 持续优化脚本CI自动化发布流程 (8257215)
* 持续修复 github workflow 运行后 release 不显示更新内容的BUG (ecfa203)
* 更新 easy-us API (0150b49)
* 添加 git workflow 输出 (467d53d)
* 超星任务点检测优化 (ce6c3ac)


### Performance Improvements

* aPI Update (849cde2)
* aPI优化 (f988878)
* **core:** type  update (3fd3864)
* **core:** update remote-playwright-log (3578781)
* **core:** 优化 tooltip (9655442)
* **core:** 优化题库搜索题目显示，可兼容长题目例如阅读理解上下文显示 (2e62f4c)
* **script and core:** 优化软件辅助类型提示以及代码 (3394ada)
* **script:** 优化 waitForElement API (4cf2191)
* **script:** 优化智慧树学习提示文案 (5bc0545)
* **script:** 优化版本更新验证，不符合版本书写规范的话向用户提示报错 (70dd13b)
* **script:** 优化超星跳转时间太长的问题，改成智能等待时间 (6314616)
* **script:** 优化超星闯关模式重复提示 (fd83815)
* **script:** 优化题库配置文案和第三方连接文案 (e66d399)
* **script:** 修复中国大学MOOC无法提交讨论的BUG，优化中国大学MOOC日志显示 (5b1ab57)
* **script:** 修改搜题超时默认时间为2分钟，最大值为3分钟 (a2a662f)
* **script:** 修改软件辅助启动提示 (0021b5d)
* **script:** 修改题库配置按钮文案，优化题库配置界面文案，主次分明 (3d237ea)
* **script:** 加强智慧树作业考试自动保存警告 (7a44eb7)
* **script:** 添加 TikuAdapter 解析器说明 (d200b22)
* **script:** 添加 TikuAdapter 配置域名白名单提示 (24d8026)
* **script:** 添加多个答题页面菜单自动注册功能 (b101424)
* **script:** 添加如何关闭脚本的教程提示 (4a7722d)
* **script:** 添加搜索结果界面题库连接失败的解决提示 (e42b682)
* **script:** 添加智慧树作业禁止同时打开多个界面答题文案 (f1cd8cb)
* **script:** 添加智慧树共享课作业开启前阅读须知功能 (7e7657b)
* **script:** 添加智慧树新智慧形态考试菜单进入菜单栏 (d9d362b)
* **script:** 添加更多的倍速选项 (adf7e3d)
* **script:** 添加超星凌晨刷课文案提示 (f17992c)
* **script:** 添加超星阅读界面的使用提示 (a8aa869)
* **script:** 添加题库停用状态的开启提示 (8e6aaed)
* **script:** 添加题库数量限制（10个） (65462a5)
* **script:** 添加题库连接失败解决方法 (53c01cb)
* **script:** 简化 $console 生成的堆栈信息，减少存储量 (2669525)
* **script:** 适配超星积分课的阅读任务不会自动开始阅读的问题 (9b8ff4f)
* **script:** 降低超星倍速警告阈值为2倍速，优化倍速警告 (5aababb)
* 优化倍速设置选项，减少不必要的选项数量 (566ff84)
* 优化智慧树考试提示文案 (b1e92a3)
* 优化脚本CI自动化发布流程 (ab907ef)
* 优化超星随机答题文案，提示只有在搜不到答案的时候才使用随机答题 (3e07067)
* 持续优化软件辅助安装提示 (90d9cd1)
* 更新API，添加新API $msg，可同时显示气泡和打印日志 (099907a)
* 添加智慧树-智慧课程掌握度学习提示 (908df79)
* 添加答题日志输出开关功能 (d041373)

## 4.13.24 (2026-06-11)


### Bug Fixes

* 持续优化脚本CI自动化发布流程 (8257215)

## 4.13.23 (2026-06-11)


### Bug Fixes

* **script:** 修复 waitForMedia 中 setInterval 内存泄漏 (ed06b88)
* **script:** 修复 waitForMedia 中 setInterval 内存泄漏 (4e03fef)
* 优化脚本CI自动化发布流程 (0ee2537)


### Performance Improvements

* 优化脚本CI自动化发布流程 (ab907ef)

## 4.13.19 (2026-06-04)


### Bug Fixes

* **script:** 兼容超星新版连线题 (f9ebaa5)
* **script:** 兼容中国大学MOOC网络并发的问题，调整答题速度，修复填空题无法正常填写的问题 (ad03090)


### Performance Improvements

* aPI Update (849cde2)
* **script:** 添加搜索结果界面题库连接失败的解决提示 (e42b682)



## 4.13.16 (2026-05-29)


### Bug Fixes

* **script:** 兼容职教云资源库WAV音频任务点播放 (76a1e56)



## 4.13.15 (2026-05-29)



## 4.13.14 (2026-05-29)


### Bug Fixes

* **build:** 修复 Workflow 无法读取本地更新日志的BUG (5054129)


### Features

* **script:** 支持职教云课堂作业测试 (862aff7)


### Performance Improvements

* **script:** 添加题库连接失败解决方法 (53c01cb)



## 4.13.11 (2026-05-26)


### Bug Fixes

* 修复智慧树AI学伴掌握度界面无法自动触发答题的BUG (61b8005)
* **script:** 添加雨课堂成绩单界面进入后视频不支持提示 (fc7c2fb)


### Performance Improvements

* **script:** 添加如何关闭脚本的教程提示 (4a7722d)
* **script:** 添加题库数量限制（10个） (65462a5)



## 4.13.7 (2026-05-14)


### Features

* **script:** 新增雨课堂V2学习内容自动看视频、和讨论功能 (d8095b6)



## 4.13.6 (2026-05-12)


### Bug Fixes

* **script:** 适配智慧树-智慧课程-AI学伴掌握度无法答题的问题 (ce6262f)


### Performance Improvements

* **script:** 修改题库配置按钮文案，优化题库配置界面文案，主次分明 (3d237ea)



## 4.13.4 (2026-04-23)


### Features

* **script:** 兼容超星长时阅读任务点（限制翻页时间） (ac34ba2)
* **script:** 添加超星域名支持：jnzyjsxy.cn (a27cb49)



## 4.13.2 (2026-04-22)


### Bug Fixes

* **script:** 修复智慧树26年上半年studywisdomh5复习模式错误的问题 (2e82a0a)


### Features

* **script:** 兼容雨课堂AI学伴自动学习 (c96f4db)



## 4.12.39 (2026-04-20)


### Bug Fixes

* 修复智慧职教题目识别丢失img的src问题 (482ac64)
* 修复智慧职教题目识别丢失img的src问题,使用与学习通页面相同的方法 (488f467)
* 修复智慧职教题目识别丢失img的src问题,使用与学习通页面相同的方法,且考虑纯图片无法识别问题 (3a23e04)
* 修复智慧职教题目识别丢失img的src问题,使用与学习通页面相同的方法,且考虑纯图片无法识别问题 (d020954)



## 4.12.38 (2026-04-20)


### Bug Fixes

* **script:** 兼容26年上半年智慧树新版studywisdomh5网课更新 (cf52bf0)



## 4.12.37 (2026-04-15)


### Bug Fixes

* **script:** 修复超星某些章节测试无法自动答题的BUG (62b0aaf)


### Features

* **script:** 添加智慧树2026上学期新版HIKE AI教学中心视频学习功能 (392a1a5)


### Performance Improvements

* **script:** 适配超星积分课的阅读任务不会自动开始阅读的问题 (9b8ff4f)
* **script:** 添加超星阅读界面的使用提示 (a8aa869)
* **script:** 优化超星跳转时间太长的问题，改成智能等待时间 (6314616)



## 4.12.32 (2026-04-09)


### Bug Fixes

* **script:** 尝试修复智慧树AI学伴课程过一段时间才会播放的BUG (7c56dc9)


### Performance Improvements

* **script:** 优化超星闯关模式重复提示 (fd83815)



## 4.12.30 (2026-03-20)


### Performance Improvements

* **script:** 添加智慧树新智慧形态考试菜单进入菜单栏 (d9d362b)



## 4.12.29 (2026-03-20)


### Bug Fixes

* **script:** 兼容职教云xls任务点自动学习 (7a3a174)
* **script:** 修复智慧树-新形态课程链接任务点无法跳过的BUG (51a639d)


### Features

* **script:** 添加智慧树-新形态课程自动考试功能 (587a045)



## 4.12.26 (2026-03-18)


### Bug Fixes

* **script:** 修复职教云PPT仅有2页时无法完成的BUG (018462f)
* **script:** 修复智慧职教AI测验答题时填空功能失效的BUG (d850bea)


### Features

* **script:** 添加新版职教云自动跳转旧版功能 (55a9f1e)



## 4.12.23 (2026-03-17)


### Bug Fixes

* 修复上个版本无法打包的BUG (97608d8)



## 4.12.22 (2026-03-17)


### Bug Fixes

* **script:** 添加智慧树-AI教学中心-题目作业自动答题功能 (2a630aa)
* **script:** 修复图片题中的图片在解析时重复出现的BUG (84c697e)
* **script:** 修复职教云资源库无法跳过测验的问题 (34e4f38)
* **script:** 修复智慧职教AI测验答题时无法填空的BUG (edb492a)


### Performance Improvements

* 更新API，添加新API $msg，可同时显示气泡和打印日志 (099907a)
* 添加答题日志输出开关功能 (d041373)



## 4.12.16 (2026-03-06)


### Bug Fixes

* **script:** 修复智慧课程AI伴学的视频无法检测，以及掌握度只有一题的情况无法答题的BUG (8ff88f2)
* **script:** 优化 eslint 报错 (036644f)



## 4.12.15 (2026-03-04)


### Bug Fixes

* **script:** 修复2026上学期智慧树-新智慧课程无法自动下一章的BUG (437696d)



## 4.12.14 (2026-02-28)


### Features

* **script:** 添加ZE题库域名白名单授权 (a5bdb91)



## 4.12.13 (2026-02-25)


### Bug Fixes

* **script:** 适配 2026 上学期智慧树-新智慧学习界面 (6f449cc)



## 4.12.12 (2025-12-29)


### Bug Fixes

* 修复 github workflow 运行后 release 不显示更新内容的BUG (96065e7)



## 4.12.11 (2025-12-29)


### Bug Fixes

* 添加 git workflow 输出 (467d53d)



## 4.12.10 (2025-12-29)


### Bug Fixes

* 修复 github workflow 运行后 release 不显示更新内容的BUG (addb25a)



## 4.12.9 (2025-12-29)


### Bug Fixes

* 修复 github workflow 运行后 release 不显示更新内容的BUG (2bacbfd)



## 4.12.8 (2025-12-29)


### Bug Fixes

* 持续修复 github workflow 运行后 release 不显示更新内容的BUG (ecfa203)



## 4.12.7 (2025-12-29)


### Bug Fixes

* 修复 github workflow 运行后 release 不显示更新内容的BUG (676c7ed)



## 4.12.6 (2025-12-29)


### Bug Fixes

* **script:** 适配2025-12月智慧树新智慧学习域名 (acc2c79)
* **script:** 修复超星学习通没配置题库无法跳过章节测试的BUG (e27d978)



## 4.12.4 (2025-12-16)


### Bug Fixes

* **core:** 修复答案为圆圈数字时无法答题的BUG (676f437)



## 4.12.3 (2025-12-03)


### Bug Fixes

* **script:** 添加职教云资源库修复功能按钮 (898bb3b)
* **script:** 修复中国大学MOOC新版考试无法运行的BUG (8f0a188)


### Performance Improvements

* **script:** 加强智慧树作业考试自动保存警告 (7a44eb7)



# 4.12.0 (2025-11-27)


### Bug Fixes

* 修复超星答题时无法点击快速定位到题库配置界面问题 (855e8e9)


### Features

* **core:** 添加软件辅助鼠标在空闲状态下执行辅助点击等功能，防止与用户抢夺控制权 (e5b3b1e)
* **core:** 添加自定义答题器，可自定义题目类型、答题器等参数，自由度更高 (f1f7813)
* **script:** 兼容超星繁体字判断题适配 (a81cd57)


### Performance Improvements

* **script:** 优化 waitForElement API (4cf2191)



## 4.11.98 (2025-11-24)


### Bug Fixes

* **core:** 修复上个版本无法打包的BUG (089aaaf)



## 4.11.97 (2025-11-24)


### Bug Fixes

* **script:** 修复高级设置无法打开的BUG (81dbc12)



## 4.11.96 (2025-11-24)


### Bug Fixes

* **script:** 修复中国大学MOOC视频题目重复答题的BUG (7c6fd88)



## 4.11.95 (2025-11-23)


### Performance Improvements

* aPI优化 (f988878)



## 4.11.94 (2025-11-23)


### Bug Fixes

* **common:** 题库缓存清空后弹窗数量文字归零 (7a1ae7d)
* **script:** 修复超星默认跳转模式无法自动滚动页面到当前章节列表问题 (5600bdd)


### Features

* **core:** 对移动端进行拖动面板适配 (d253f8b)


### Performance Improvements

* **core:** 优化题库搜索题目显示，可兼容长题目例如阅读理解上下文显示 (2e62f4c)



## 4.11.86 (2025-11-20)


### Bug Fixes

* **script:** 修复上个版本类型报错 (f472a0e)



## 4.11.85 (2025-11-20)


### Bug Fixes

* **script:** 将超星环境调整脚本整合到内部，防止全局污染 (b8a2a20)
* **script:** 修复中国大学MOOC作业答题错乱问题 (3dfcef1)



## 4.11.82 (2025-11-14)



## 4.11.81 (2025-11-14)


### Bug Fixes

* **script:** 修复职教云资源库附件视频任务无法完成的BUG (e8635e5)
* **script:** 修复职教云资源库总是无法学满进度的BUG (b06dc44)



## 4.11.78 (2025-11-13)


### Bug Fixes

* **script:** 修改职教云资源库视频PPT跳转间隔为5秒 (32504fa)



## 4.1.76 (2025-11-12)


### Bug Fixes

* **script:** 修复职教云资源库PPT总是会返回第一页才结束的BUG (5aab29b)



## 4.11.77 (2025-11-12)


### Bug Fixes

* **script:** 修复职教云资源库PPT总是会返回第一页才结束的BUG (e665f55)



## 4.1.76 (2025-11-12)


### Bug Fixes

* **script:** 修复职教云资源库PPT总是会返回第一页才结束的BUG (5aab29b)



## 4.11.75 (2025-11-12)


### Bug Fixes

* **script:** 修复超星在章节列表页面提示已进入学习界面的BUG (9e899e8)



## 4.11.74 (2025-11-12)


### Bug Fixes

* **script:** 修复超星视频加载失败无法重启的BUG (385d8a3)



## 4.11.73 (2025-11-12)


### Bug Fixes

* **script:** 使用软件辅助模拟输入填空适配智慧树智慧课程掌握度填空题 (a57be37)
* **script:** 添加智慧树倍速最高风险说明 (cffcbc9)
* **script:** 修复配置多个题库其中某个超时无法答题的BUG (dd569dc), closes [#270](https://github.com/HONGHUTECHNOLOGY/honghueasystudy/issues/270)



## 4.11.69 (2025-11-09)


### Bug Fixes

* **core:** 修复隐藏窗口按钮无法使用的BUG (c028a8f)
* **script:** 添加中国大学MOOC空白页自动跳转的功能 (c562d2c)
* **script:** 修复中国大学MOOC视频答题和章节测试冲突的问题 (a61a8e0)


### Features

* **script:** 适配智慧树-AI教学中心-智慧课程作业答题功能 (3d124af)
* **script:** 修复智慧树倍速失效的BUG (26a9a6d)



## 4.11.64 (2025-11-07)


### Bug Fixes

* **core:** 答案匹配时移除标点符号保证匹配更加准确 (3f02c30)
* **scirpt:** 修复上个版本中国大学MOCC考试部分题目答题错误问题 (bcf21b3)



## 4.11.61 (2025-11-06)


### Bug Fixes

* **script:** 修复职教云资源库点击PPT过快的BUG (454ee5d)
* **script:** 修复智慧树新形态课程（智慧课程）某些外链无法完成并跳过的BUG (d9bbd50)
* **script:** 优化超星非整卷预览考试流畅度，添加搜索结果对于部分答页面题过程可控的菜单 (f1f9082)


### Features

* **script:** 支持搜索结果界面可控制答题进程功能 (98573b5)
* **script:** 支持中国大学MOOC自动考试功能 (40fbfdd)


### Performance Improvements

* **script:** 添加超星凌晨刷课文案提示 (f17992c)
* **script:** 添加多个答题页面菜单自动注册功能 (b101424)



## 4.11.51 (2025-11-05)


### Bug Fixes

* **core:** 兼容搜题结果格式A#B#C#D解析为多选题 (0d29813)


### Features

* **script:** 兼容职教云在线课程内容单独任务点连续学习功能，添加PPT翻阅速度调整选项 (9883897)


### Performance Improvements

* **script:** 添加智慧树共享课作业开启前阅读须知功能 (7e7657b)



## 4.11.47 (2025-11-05)


### Bug Fixes

* 优化智慧树卡巴斯基文案 (99253d6)
* **core:** 修复窗口反复闪烁的BUG (217b5e1)
* **icourse:** 修复中国大学MOOC无法完成富文本任务的BUG (5dc3c06)
* **script:** 持续修复超星跳转未完成任务点模式无法使用的BUG (66a74a2)
* **script:** 兼容职教云资源库新版PPT (4919cef)
* **script:** 兼容智慧树-AI助教课程PPT和文档功能 (7c456ed)
* **script:** 修复超星视频暂停后长时间才播放的BUG (a26c03b)
* **script:** 修复超星跳转未完成任务点模式无法使用的BUG (a1ed883)
* **script:** 修复智慧树-AI助教倍速无法点击的BUG (8ffa983)
* **script:** 修复智慧树-AI助教课程无法自动跳转小节和PPT的BUG (fe76e0e)
* **script:** 优化多选题纯答案无法解析的BUG (97d8655)
* **script:** 优化智慧树音量开始播放后没有立即调整的问题 (eff3c71)


### Features

* **script:** 软件配置同步后添加脚本双击配置页面强制取消功能 (99948e9)
* **script:** 添加超星下一章切换后自动滚动到该元素的功能 (c5c0726)
* **script:** 添加超星页面加载后自动滚动到当前任务点的功能 (16232df)
* **script:** 添加超星章节测试答题时自动显示搜索结果 (967c495)
* **script:** 添加全局快捷菜单自动注册功能 (11403f6)
* **script:** 添加最小化/切屏窗口警告功能，优化文案 (22028e4)
* **script:** 优化超星章节测试答题时自动打开搜索结果功能 (7cc0046)
* **script:** 支持中国大学MOOC视频内弹窗答题 (8af7ec2)


### Performance Improvements

* **script:** 降低超星倍速警告阈值为2倍速，优化倍速警告 (5aababb)
* **script:** 添加智慧树作业禁止同时打开多个界面答题文案 (f1cd8cb)
* **script:** 修改搜题超时默认时间为2分钟，最大值为3分钟 (a2a662f)



## 4.11.22 (2025-10-16)


### Bug Fixes

* **script:** 兼容2025下半年超星PPT新版无法完成的问题 (cbe876e)



## 4.11.21 (2025-10-10)


### Bug Fixes

* 优化软件同步功能 (2c1ecfc)



## 4.11.20 (2025-10-07)


### Bug Fixes

* **script:** 修复软件开启同步后，其他非自动化辅助网页里面的脚本依然会同步的问题，造成用户以为当前页面可以使用软件辅助的错觉 (65920e2)



## 4.11.19 (2025-09-26)


### Bug Fixes

* **core:** 修复题库请求时无法传递类型为0或者false的值 (6c8a26f)



## 4.11.18 (2025-09-25)


### Bug Fixes

* **script:** 修复上个版本智慧树会长时间不播放的BUG (aa7c66f)



## 4.11.17 (2025-09-25)


### Bug Fixes

* **script:** 兼容超星整卷预览禁用后的作业和答题 (07139d7)
* **script:** 修复搜索结果AI标识重复出现的BUG (2857f2f)
* **script:** 优化旧版智慧树视频容易黑屏的问题 (e2535ad)
* **script:** 智慧树答题时移动页面至左上角防止点击出错 (7f835c0)


### Features

* **script:** 添加对智慧树2025-9月份教学空间-AI智慧学习支持 (da9d229)


### Performance Improvements

* **script:** 修复中国大学MOOC无法提交讨论的BUG，优化中国大学MOOC日志显示 (5b1ab57)
* **script:** 优化题库配置文案和第三方连接文案 (e66d399)
* **script:** 优化智慧树学习提示文案 (5bc0545)



## 4.11.8 (2025-09-15)


### Features

* **script:** - 添加搜题结果AI标注显示 (7783cee)



## 4.11.5 (2025-09-09)


### Bug Fixes

* 尝试修复Git打包错误的BUG (30cbbbc)



## 4.11.4 (2025-09-09)


### Bug Fixes

* 尝试修复Git打包错误的BUG (abb6e7b)



## 4.11.3 (2025-09-09)


### Bug Fixes

* 对全部项目的依赖进行版本锁定 (f760f6d)



## 4.11.2 (2025-09-09)


### Bug Fixes

* **script:** 优化代码 (bdbcb47)



## 4.11.1 (2025-09-09)


### Bug Fixes

* **script:** 优化代码 (c08eece)



# 4.11.0 (2025-09-09)


### Bug Fixes

* **core:** 优化Playwright软件辅助底层对接，添加软件辅助点击可视化，修复元素滚动后点击错位的BUG (e5daaae)


### Features

* **script:** 添加超星对 jxgmxy.com 域名的支持 (b75b714)
* **script:** 新增智慧树2025-9月份最新课程支持-新智慧课程 (4f3780a)



# 4.10.0 (2025-09-01)


### Features

* **script:** 添加对2025-8月份智慧树新掌握度页面进行适配 (07cab10)
* **script:** 新增智慧职教AI课程学习和作业脚本 (27ec1fb)



## 4.9.86 (2025-06-08)


### Bug Fixes

* **script:** 添加职教云卡死提示解决方法 (05493be)



## 4.9.85 (2025-06-08)


### Bug Fixes

* **script:** 修复职教云获取数据错误的问题 (5565799)



## 4.9.84 (2025-06-07)


### Bug Fixes

* **script:** 修复智慧职教自定义全局倍速后导致其他脚本倍速选项也被修改的BUG (5877a6c)



## 4.9.83 (2025-06-07)


### Bug Fixes

* 修改脚本更新链接到教程官网的更新教程 (dd24c40)
* **script:** 修复职教云卡在获取数据弹窗 (8acf60d)



## 4.9.81 (2025-05-29)


### Bug Fixes

* **script:** 兼容职教云添加章节层级名字后无法获取数据的问题 (afa37cf)
* **script:** 添加智慧树智慧课程跳转模式选择 (822ab99)



## 4.9.79 (2025-05-24)


### Bug Fixes

* **script:** 修复职教云章节列表前面有章节序号时无法读取数据的BUG (6ffd21e)



## 4.9.78 (2025-05-18)


### Bug Fixes

* **script:** 修复职教云获取数据时跳转其他网页的BUG (4237698)



## 4.9.77 (2025-05-11)


### Bug Fixes

* 修复职教云0资源库无法下一章的BUG，兼容职教云部分PPT任务点 (69230c4)



## 4.9.76 (2025-05-09)


### Bug Fixes

* **script:** 优化智慧树翻转课（校内课） (af04c36)


### Features

* 优化支持职教云最新版页面，支持自动切换下一章（包含大章节切换） (c73a1cc)


### Performance Improvements

* 持续优化软件辅助安装提示 (90d9cd1)
* 优化倍速设置选项，减少不必要的选项数量 (566ff84)
* 优化超星随机答题文案，提示只有在搜不到答案的时候才使用随机答题 (3e07067)



## 4.9.71 (2025-05-07)


### Bug Fixes

* **script:** 修复新版智慧树无法关闭弹窗的BUG (7b356d3)



## 4.9.70 (2025-05-05)


### Bug Fixes

* **script:** 修复超星搜题时无法读取选项内图片链接的BUG (d57cb8f)
* **script:** 修复超星章节测试多行题目第二行存在题目类型时无法解析题目的BUG (3cdfa3c)
* **script:** 修复超星自动答题时填空题选项读取到额外冗余文字的BUG：（段落格式，字号，字体） (f95f2ea)
* **script:** 修复智慧树-智慧课程无法自动切换下一个的BUG (b02d864)
* **script:** 修复智慧树-智慧课程无法自动下一章的BUG (48b8567)
* **script:** 修复智慧树-智慧职教无法学习文本任务点的问题，新增智慧职教已完成任务点过滤功能 (aaf7774)
* **script:** 优化智慧树-智慧课程播放逻辑 (8ea5248)


### Features

* **script:** 对题库配置做唯一化处理 (4bc0112)
* **script:** 适配智慧树智慧课程学习和作业（包括AI助教和智慧课程），适配智慧树新版课程页面，适配智慧课程掌握度自动答题 (7cd9dfd)
* **script:** 支持智慧树智慧课程链接任务点 (285140f)


### Performance Improvements

* **script:** 修改软件辅助启动提示 (0021b5d)



## 4.9.59 (2025-03-31)


### Bug Fixes

* typo (57d4077)


### Features

* 添加超星 ccqmxx.com 域名适配支持 (79eb947)
* **script:** 添加题库配置相同检测，如果相同则提示 (9acb07e)



## 4.9.57 (2025-03-14)


### Features

* 添加智慧树-智慧课程掌握度答题功能 (316eb6d)


### Performance Improvements

* 添加智慧树-智慧课程掌握度学习提示 (908df79)



## 4.9.55 (2025-03-14)


### Bug Fixes

* 超星任务点检测优化 (ce6c3ac)



## 4.9.54 (2025-03-13)


### Bug Fixes

* 优化智慧树智慧课程视频检测，修复智慧树智慧课程检测不到任务点问题 (2f3777d)



## 4.9.52 (2025-03-12)


### Bug Fixes

* 修复 4.9.51 版本题库配置解析问题 (b3d3e32)



## 4.9.51 (2025-03-12)



## 4.9.46 (2024-12-22)


### Performance Improvements

* 优化智慧树考试提示文案 (b1e92a3)



## 4.9.45 (2024-12-21)


### Bug Fixes

* **script:** 修复上个版本图片链接处理导致的无法选择BUG (baaed06)



## 4.9.44 (2024-12-21)


### Bug Fixes

* **core:** 修复图片题解析错误导致的URL重复，图片重复显示等问题 (f5cc59f)



## 4.9.43 (2024-12-20)



## 4.9.42 (2024-12-06)



## 4.9.41 (2024-12-03)



## 4.9.40 (2024-11-10)


### Bug Fixes

* **script:** 优化职教云资源库无法答题的问题 (c94c41e)



## 4.9.39 (2024-11-09)


### Bug Fixes

* 修复 select 选择框显示问题 (9f5b741)



## 4.9.37 (2024-11-06)


### Features

* 添加超星自动跳转未完成任务点功能 (24927e6)



## 4.9.36 (2024-11-06)


### Bug Fixes

* **script:** 修复选择输入框中默认值匹配错误导致的超星自动保存选择'save'，但是默认值依旧是80的问题 (a2b639f)



## 4.9.35 (2024-10-21)



## 4.9.34 (2024-10-18)



## 4.9.33 (2024-10-17)



## 4.9.32 (2024-10-09)



## 4.9.31 (2024-09-13)



## 4.9.29 (2024-08-10)


### Bug Fixes

* **scirpt:** 修复资源库最新版链接类名改变问题 (341b37f)



## 4.9.28 (2024-07-14)


### Bug Fixes

* **script:** 解决超星部分套壳网站无法自动下一章的BUG (e8f05b6)
* **script:** 优化对超星视频下载错误的处理，将自动跳过错误视频 (b4f32c8)


### Performance Improvements

* **script:** 优化版本更新验证，不符合版本书写规范的话向用户提示报错 (70dd13b)



## 4.9.25 (2024-07-13)


### Bug Fixes

* **script:** 新增智慧职教 webtrn.cn 套壳网站支持，新增对30分钟学习弹窗的关闭功能 (b17a19f)



## 4.9.24 (2024-06-25)



## 4.9.23 (2024-06-25)


### Bug Fixes

* **script:** 修复职教云资源库，课件类型为NAN的BUG (8b8768e)
* **script:** 修复职教云资源库重复下一章的BUG (b566a5c)



## 4.9.21 (2024-06-19)


### Bug Fixes

* **core:** 修复题库配置 AnswererWrapper 自定义字段解析 handler 函数调用两次的BUG (1e15377)
* **script:** 修复搜索时换行被删除导致，两行合并造成的文字合并，导致搜索引擎可能出现的的搜索问题 (b318c1e)



## 4.9.20 (2024-06-13)


### Features

* **script:** 新增 中国大学MOOC 考试功能 (7286fa4)



## 4.9.19 (2024-06-05)


### Bug Fixes

* **core:** 修复使用精确匹配时，脚本的多选题搜索结果会全部显示已完成的BUG (65cfc48)
* **script:** 添加完成率百分比符号 (beec370)



## 4.9.18 (2024-06-04)


### Bug Fixes

* **script:** 修复全域名版本无法显示BUG (6d52ec4)



## 4.9.17 (2024-05-24)


### Bug Fixes

* **script:** 修复上个版本任务点检测不到的BUG (8bf7551)



## 4.9.16 (2024-05-23)


### Bug Fixes

* **script:** 优化超星人脸识别检测警告 (311d8ad)
* **script:** 优化超星题库配置为空警告 (9257770)


### Features

* **script:** 新增对超星链接任务点，音频PPT任务点的支持，优化代码，删除视频错误检测功能。 (e90f1bb)



## 4.9.12 (2024-05-11)


### Bug Fixes

* **script:** 添加超星积分课的使用提示 (ea74563)
* **script:** 修复超星课程，章节测试偶尔出现卡死的BUG (24b499d)
* **script:** 修复超星课程进入时需要人脸识别，但是疯狂跳转新版本导致的人脸识别疯狂刷新的BUG (4fb764b)
* **script:** 修复超星英语判断题的文本BUG (5c785ab)



## 4.9.8 (2024-05-10)



## 4.9.7 (2024-05-10)


### Bug Fixes

* **script:** 修复 '"@honghu/core"' has no exported member 'createQuestionTitleExtra'. BUG (9f06abe)



## 4.9.6 (2024-05-10)


### Bug Fixes

* 更新 easy-us API (0150b49)
* 删除无用API (8c8425f)
* **script:** 修复英语前缀 【True or False】 的BUG (01e1418)
* **script:** 优化题库配置的开启和关闭按钮 (b9197c6)
* **script:** 优化题库配置的开启和关闭按钮 (39b3046)



## 4.9.4 (2024-05-04)


### Bug Fixes

* **script:** 修复无法移动面板至边缘导致自动登录失效的BUG (a05d0a1)



## 4.9.3 (2024-05-04)



## 4.9.2 (2024-05-04)


### Bug Fixes

* 导出 $elelment 对象，便于可修改 $modal 第二个参数 (13a1b6d)



## 4.9.1 (2024-05-04)



# 4.9.0 (2024-05-03)


### Features

* **all:** 优化API，分离UI层为新项目 easy-us (ecc4ff6)



## 4.8.30 (2024-05-01)


### Bug Fixes

* **script:** 解决超星视频播放时出现： The play() request was interrupted by a call to pause() BUG (4791bd8)


### Features

* **script:** 新增对职教云资源库的 spocjob 作业的支持 (007d39a)



## 4.8.29 (2024-04-20)



## 4.8.27 (2024-03-31)



## 4.8.26 (2024-03-29)


### Features

* **script:** 新增超星 cugbonline.cn 域名支持 (359425a)



## 4.8.25 (2024-03-28)


### Bug Fixes

* **script:** 修复添加额外菜单栏后，窗口无法正常最大化/最小化的BUG (22c45bc)



## 4.8.24 (2024-03-28)


### Bug Fixes

* **core:** 修复窗口隐藏/显示 快捷键无效的BUG (8002c82)
* **core:** 修复单选题答案回调内容不一致的BUG (4265263)
* **core:** 修复设置超出最大最小值，导致变更时，本地的值没有同步导致刷新后依然没有发生变化的BUG (0b05507)
* **core:** 修复新版答题算法中搜题线程参数无效的BUG，始终只有一个搜题线程在运行 (9e052f8)
* **core:** 修复已经在暂停状态，但是依然在答题的BUG (3f04e21)
* **core:** 优化搜索结果的显示BUG，已搜到答案的题目显示未匹配到正确答案的BUG，以及答题进度不一致的显示BUG (2fd9a72)
* **script:** 全面优化答题速度，优化存在题库缓存时无需执行搜题间隔等待，优化特定网课勾选答案时需要停顿，正常网课无需停顿的情况，极大加速了答案勾选过程。 (1ca3448)
* **script:** 修复智慧树答题时题库缓存未正确存储的BUG (978d927)
* **script:** 修复重新答题按钮点击后，答题完成后的一些操作依然在进行的BUG (e7148a3)


### Features

* **core:** 新增额外菜单栏功能，新增超星额外菜单栏快捷页面跳转按钮 (c2066a0)
* **script:** 新增【职教云】资源库作业支持 (3cf9968)



## 4.8.13 (2024-03-14)


### Bug Fixes

* **core:** 全局设置中部分元素的值为空时恢复默认值 (9d539d0)
* **core:** 优化答题模块算法 (545d9bc)



## 4.8.11 (2024-03-13)


### Bug Fixes

* **script:** 修复请求记录开启后无法读取内容的BUG (31d2a85)


### Features

* **script:** 对 TikuAdapter 做适配提示 (cf2fe10)



## 4.8.8 (2024-03-05)


### Bug Fixes

* **script:** 优化超星视频重复播放时没有重置视频进度的问题 (c167ff0)



## 4.8.7 (2024-03-01)


### Bug Fixes

* **script:** 修复2倍速被删除的BUG (a861685)



## 4.8.6 (2024-02-28)


### Bug Fixes

* **script:** 修改软件辅助返回字段 (270f104)



## 4.8.5 (2024-02-28)


### Bug Fixes

* **script:** 修复智慧树无法使用软件辅助，无法自动答题看视频的BUG (a3cdb6f)


### Features

* **core:** 新增答案匹配模式选项 (aab04af)
* **script:** 添加题库配置自动读取剪贴板功能 (fe19557)


### Performance Improvements

* **core:** 优化 tooltip (9655442)



# 4.8.0 (2024-02-26)


### Bug Fixes

* **core:** 新答题器的旧字段搜索结果显示修改 (d8511a0)
* **core:** 修复当数字输入框是空格后无法正确读取的BUG (fa7f2d5)
* **core:** 修复新版答题器当线程为1时，无法搜题的BUG (bd2bd53)
* **core:** 优化答题器算法 (d29c74c)
* **core:** 优化跨域通信只在顶部页面刷新时删除临时监听变量，优化代码添加注释 (0f07dc4)
* **core:** 优化搜索结果显示，内部算法报错依然可以显示搜索结果 (e002e3d)
* **script:** 添加超星英文判断题的冗余删除 (35b8f07)
* **script:** 添加题库缓存开关 (35226d3)
* **script:** 修复解除复制粘贴限制功能无效的BUG (3f560a8)
* **script:** 修复通知时间很短就消失的BUG (cda009f)
* **script:** 优化超星闯关模式以及解锁模式的重复进入检测算法 (b148232)
* **script:** 优化超星英文判断题的解析 (78be04e)


### Features

* 新增 answer_separator 答案分隔符设置 (a742f80)
* **script:** 添加超星 gdhkmooc.com 域名支持 (c63e6d6)
* **script:** 添加超星完成全部任务点后重新从开头学习功能 (86454d3)
* **script:** 添加对智慧树自动保存答案的解释 (53f0846)
* **script:** 添加开发人员调试：显示Tab变量功能 (a779b35)
* **script:** 添加职教云 flv 格式支持 (08d6719)
* **script:** 添加职教云的作业考试【客观填空题】的支持 (92c5133)
* **script:** 添加智慧职教MOOC的单行填空题支持 (5361ec4)
* **script:** 新增 $message 跨域调用功能，新增 $modal duration 参数，修复由于删除cors监听key导致的 undefined BUG (320903f)
* **script:** 新增新版职教云作业填空题支持 (a09dcac)
* **script:** 新增职教云考试支持，txt文档查看支持 (f95e8f8)
* **script:** 优化题库配置文案，优化超星文案，并添加运行时的反馈消息提示 (d61d3ee)
* **script:** 在拓展应用中添加鸿鹄易学全部配置的导入导出功能 (0237e88)


### Performance Improvements

* **core:** update remote-playwright-log (3578781)
* **script and core:** 优化软件辅助类型提示以及代码 (3394ada)
* **script:** 简化 $console 生成的堆栈信息，减少存储量 (2669525)
* **script:** 添加更多的倍速选项 (adf7e3d)



## 4.7.46 (2023-12-20)


### Bug Fixes

* **scrpt:** 优化题库配置在软件上的域名检测 (04fba87)


### Performance Improvements

* **core:** type  update (3fd3864)



## 4.7.35 (2023-12-19)


### Features

* **script:** 修复超星人脸验证时疯狂刷新的问题，新增超星人脸验证通知功能 (e75786c)


### Performance Improvements

* **script:** 添加题库停用状态的开启提示 (8e6aaed)



## 4.7.34 (2023-12-13)


### Bug Fixes

* **script:** 优化 TikuAdapter 提示 (43622ba)



## 4.7.33 (2023-12-13)


### Bug Fixes

* **script:** 修复部分脚本管理器无法读取 [@connect](https://github.com/connect) 头部元数据的问题 (69cec2f)



## 4.7.32 (2023-12-13)


### Bug Fixes

* **build:** 修复全域名通用版本不带官方域名的BUG (ce042af)


### Performance Improvements

* **script:** 添加 TikuAdapter 配置域名白名单提示 (24d8026)



## 4.7.30 (2023-12-11)


### Bug Fixes

* **script:** 修改TikuAdapter type 类型解析 (9aaeb7d)



## 4.7.29 (2023-12-11)


### Bug Fixes

* **script:** 添加多版本脚本的更新模块适配 (4a7aa19)


### Performance Improvements

* **script:** 添加 TikuAdapter 解析器说明 (d200b22)



## 4.7.27 (2023-12-11)


### Bug Fixes

* **script:** 修复请求模块的重大BUG (4b121bb)


### Features

* **script:** 新增 TikuAdapter 题库配置解析器，优化题库配置解析 (1fc0d59)



## 4.7.25 (2023-12-08)


### Bug Fixes

* **core:** 复上个版本无法输入任何文字的BUG (133dd69)



## 4.7.24 (2023-12-08)


### Bug Fixes

* **core:** 优化对 headers 中 content-type 解析而实现传递不同的 data 数据 (fcd962b)
* **script:** 将中国大学MOOC的页面切换信息设置为警告信息 (84f1d6e)


### Features

* **core:** 添加快捷键可以显示/隐藏 窗口功能 (f33e67f)



## 4.7.21 (2023-12-05)


### Bug Fixes

* **build:** 修复打包时不自动上传文件的BUG (4983788)



## 4.7.20 (2023-12-05)



## 4.7.19 (2023-12-05)



## 4.7.18 (2023-12-05)


### Bug Fixes

* **build:** 修复上个版本无法自动打包的BUG，优化打包代码 (74a97cd)



## 4.7.17 (2023-12-05)


### Features

* **build:** 添加全域名通用脚本打包 user.common.user.js (81f2cfa)


### Performance Improvements

* **script:** 添加请求记录方法过滤选项 HEAD (63b58d5)
* **script:** 添加在线搜题题库配置为空的提示 (7caf525)



## 4.7.14 (2023-12-05)


### Bug Fixes

* **core:** 修复 attrs 属性的 style 特殊字段不生效的BUG， 将每个文本框设置最小的宽高 (fdcc2ca)
* **core:** 修复下拉选择框只有value值时不显示的BUG (2d5f371)
* **script:** 修复搜索结果序号过多时，序号页面超出页面的BUG (8958910)
* **script:** 修复中国大学MOOC课堂测验答题完成后没有等待暂停时间步骤的BUG (3bc76b1)
* **script:** 优化在线搜题功能，缓存搜索题目，优化划词功能 (c4093b1)


### Features

* **core:** 新增题库配置的字段解析器功能 (f596488)
* **script:** 添加超星 hnvist.cn fjlecb.cn 域名支持 (afd86d6)
* **script:** 新增超星旧版学习页面自动转换新版功能 (9992a03)
* **script:** 新增开发人员请求记录调试页面 (5baac27)


### Performance Improvements

* **core:** request 模块的 gm http 的 data 使用 JSON.stringify 进行转换 (7d4f660)
* **script:** 删除超星多余日志 (7be1071)



## 4.7.7 (2023-11-30)


### Bug Fixes

* **script:** 将超星提交功能设置为3秒延时 (2161fa4)
* **script:** 新增题目冗余字段 (596101f)
* **script:** 修复超星学习通章节测验已完成，但依然开始答题的BUG (169eb4a)
* **script:** 优化超星作业考试/章节测验 中 type 传递是 undefined 的BUG (c2a1640)
* **script:** 优化职教云-资源库：新增对 mp3 的支持，新增自动跳过测验功能 (78634b4)


### Features

* **core:** 优化答题uploadHandler API，新增 commonWork.options.onWorkerCreated 选项 (c4154df)
* **script:** 新增中国大学MOOC，随堂测验自动答题功能 (f79fb08)


### Performance Improvements

* **script:** 导出 ICourseProject 变量，开发者调试功能中可用 (13d8787)
* **script:** 增加超星任务点关闭后的开启提示 (fe11e6e)



## 4.7.1 (2023-11-25)


### Bug Fixes

* **script:** 修复上个版本 职教云资源库获取课程信息失败 bug (d97e538)



# 4.7.0 (2023-11-25)


### Bug Fixes

* **core:** 添加题库配置 method 大小写适配 (d496be7)
* **core:** 修复选项元素在没有 title 时显示为 undefined 的 BUG (12ff0dc)
* **core:** 优化选择下拉框设置，优化代码，修改之前由于无法获取value而使用的 $creator.selectOptions 的BUG (2cf5318)
* **script:** 将软件辅助的点击设置成点击元素中心点 (a0e421d)
* **script:** 添加智慧树题目类型判断，修复某些题目不自动填写的BUG (7bce433)
* **script:** 修复职教云更新后-资源库不自动学习的BUG (2d4d026)
* **script:** 优化脚本字间距，搜索结果字间距和窗口间距 (bcc4d87)
* **script:** 优化软件辅助错误提示 (7f42cba)
* **script:** 优化智慧树学习提示 (ee44189)
* **script:** 优化智慧职教填空题 (586b1fc)


### Features

* **script:** 添加超星学习通 视频内题目随机答题功能 (e2d9d5d)
* **script:** 添加超星学习通-章节页面自动切换脚本 (c0ac30c)
* **script:** 添加职教云遇到讨论课件时自动跳过 (994ba3e)
* **script:** 新增网课 中国大学MOOC 的学习、作业脚本支持 (17445e5)
* **script:** 新增智慧职教-学习中心自动学习功能 (0a8de35)
* **script:** 优化全部网课平台的系统通知功能，添加任务点完成提示，添加智慧树验证码提示 (7e30125)



## 4.6.32 (2023-11-01)


### Bug Fixes

* **script:** 新增超星其他题，类型支持 (ee2cf4d)


### Features

* **core:** 添加优先级选项，排序特定脚本的执行速度 (049234c)
* **script:** 新增职教云资源库 pdf 支持，新增职教云作业脚本 (f703288)



## 4.6.28 (2023-10-24)



## 4.6.29 (2023-10-24)


### Bug Fixes

* **script:** 修复软件配置同步失败问题 (98eeb3d)



## 4.6.28 (2023-10-24)


### Bug Fixes

* **script:** 修复上个版本无法答题的BUG (7918a3d)



## 4.6.27 (2023-10-24)


### Bug Fixes

* **script:** 修复超星章节测试题库被禁用的时候依然使用的BUG (fff8cc4)
* **script:** 修复智慧树检测习惯分出错 (436eedd)



## 4.6.25 (2023-10-22)


### Bug Fixes

* **script:** 深度优化智慧树弹窗BUG，以及倍速清晰度不选择BUG (f61498c)


### Features

* **script:** 新增可以设置不被软件配置同步覆盖的设置，修复智慧树学习记录刷新后清空的BUG (b35f87f)



## 4.6.23 (2023-10-20)


### Bug Fixes

* **core:** 优化核心域名匹配逻辑 (8cbcc94)
* **script:** 持续优化智慧树倍速和清晰度选择功能 (86d133b)
* **script:** 将软件同步功能加快到 onactive (db44761)
* **script:** 优化超星新课程页面不显示使用提示的问题 (3daf262)
* **script:** 优化智慧树弹窗答题 (e7a7a1f)



## 4.6.22 (2023-10-19)


### Bug Fixes

* **script:** 修复智慧树需要调整窗口的BUG (45c5f0b)


### Features

* **script:** 兼容智慧职教套壳网站 courshare.cn (7a2a088)
* **script:** 收录超星套壳域名 qutjxjy.cn ynny.cn (2d9b6fc)



## 4.6.19 (2023-10-15)


### Bug Fixes

* **script:** 补充答题冗余字段删除数据 (6d3544d)
* **script:** 修复软件配置同步后，日志页面全锁定的BUG (e6f0610)
* **script:** 修复使用软件同步时，智慧树学习自动暂停无效的BUG，以及存在验证码时自动暂停的优化。 (8aa4bcf)
* **script:** 优化窗口大小自动调整，优化窗口大小警告模块 (6882026)


### Features

* **script:** 将软件辅助警告修改成弹窗 (6b88c29)
* **script:** 添加超星强制答题提示 (0067efc)
* **script:** 添加对自动调整窗口开关的重启提示 (46b957b)
* **script:** 添加职教云【资源库】支持 (da6f135)



## 4.6.10 (2023-10-02)



## 4.6.9 (2023-10-02)


### Bug Fixes

* **script:** 修复智慧树考试脚本无法使用的BUG (5f3f972)


### Features

* **script:** 新增超星阅读任务无限阅读功能 (137f739)



## 4.6.7 (2023-09-26)


### Bug Fixes

* **script:** 微调智慧树窗口大小要求，宽2200，高1200 (f438b79)


### Features

* **script:** 新增功能：超星强制答题功能，没有黄色任务点的章节测试也可以运行自动答题。 (453d254)



## 4.6.5 (2023-09-25)


### Bug Fixes

* **script:** 修复智慧树调成窗口大于最小值后依然说不对的BUG (be94200)



## 4.6.4 (2023-09-24)


### Features

* **script:** 添加智慧树窗口自动调节功能的选项按钮 (0543ca1)



## 4.6.3 (2023-09-24)


### Bug Fixes

* **script:** 添加智慧树窗口检测提示 (849e28d)


### Features

* **script:** 添加自动设置窗口大小功能，避免元素无法点击 (6aed250)



## 4.6.2 (2023-09-22)


### Bug Fixes

* **script:** 修复上个版本智慧树作业BUG (e782403)



## 4.6.1 (2023-09-22)


### Bug Fixes

* **script:** 优化智慧树刷课逻辑，增加流畅度 (3a93157)



# 4.6.0 (2023-09-22)


### Bug Fixes

* **script:** 新增软件辅助功能，全面优化智慧树，共享课学习作业考试以及学分课视频 (18a2725)
* **script:** 优化超星最新考试页面支持 (9e71239)



## 4.5.8 (2023-09-15)


### Bug Fixes

* **script:** 修复部分课程不显示超星阅读任务的提示页面 (907bb63)
* **script:** 修复在中国大学MOOC中点击事件监听被修改的问题，将 addEventListener('click') 改成 onlick (b1eba8f)
* **script:** 修复智慧树最新版脚本被检测的问题 (adfe7a0)



## 4.5.5 (2023-09-12)


### Features

* **script:** 使更新模块可视化 (0e27628)



## 4.5.4 (2023-09-12)


### Bug Fixes

* **core and script:** 修复上个版本出现的弹窗底部消失的问题，优化超星自动答题后台日志 (37e6749)



## 4.5.3 (2023-09-12)


### Features

* **core:** 添加跳过版本的功能 (63913b2)
* **script:** 添加新版职教云音频的播放 (b7b47b9)
* **script:** 添加新版职教云DOC文档学习功能 (9a5babd)



# 4.5.0 (2023-09-09)


### Features

* **script:** 重写职教云刷课逻辑 (1b50d5b)



## 4.4.35 (2023-09-04)


### Bug Fixes

* 优化自动发布的说明文档 (cc84599)
* **script:** 修复超星选择题选中的答案被取消的BUG (808709a)
* test (c70ec9b)



## 4.4.34 (2023-08-25)


### Bug Fixes

* 优化打包文件 (3fd8657)



## 4.4.33 (2023-08-25)


### Bug Fixes

* 优化github actions (9f6608c)



## 4.4.32 (2023-08-25)


### Bug Fixes

* **script:** 优化智慧树最新异常检测 (b634a46)



## 4.4.31 (2023-08-05)


### Bug Fixes

* **script:** 修复超星判断题更新后，文字优化不兼容的问题 (f7beff9)



## 4.4.30 (2023-06-22)


### Bug Fixes

* **script:** 新增超星分录题支持 (68c007b)



## 4.4.29 (2023-06-22)


### Bug Fixes

* **build:** 对脚本打包的 match 元数据进行去重 (9de7d2c)
* **script:** 将题库配置为空提醒设置为一直显示 (d07bdbf)
* **script:** 新增超星题目类型支持：资料题 (b6d3a00)
* **script:** 修复超星作业考试文本框无法自动保存BUG (ec58efe)



## 4.4.25 (2023-05-25)


### Bug Fixes

* **core:** 修复上个版本题库连接超时问题 (1c045ef)



## 4.4.24 (2023-05-25)


### Bug Fixes

* **script and core:** 修复题库状态检测无限执行的BUG，优化 onrender 中的监听器执行逻辑 (cbe7f0b)
* **script:** 优化智慧职教使用提示 (ca5d4b3)



## 4.4.23 (2023-05-20)



## 4.4.22 (2023-05-20)


### Bug Fixes

* **build:** update build file (c5d50b1)



## 4.4.21 (2023-05-20)



## 4.4.20 (2023-05-20)



## 4.4.19 (2023-05-20)


### Bug Fixes

* **all:** 修复添加配置分隔线后，鸿鹄易学配置同步锁的样式显示出错 (a257084)
* **script:** 添加软件自动登录辅助页面 (a2bfa20)


### Features

* **all:** 添加配置分割线，便于设置区域分组 (980d591)



## 4.4.15 (2023-05-16)


### Bug Fixes

* **core:** 规范搜题请求处理，修复在url中存在变量时多加一个问号的BUG (c0f561d), closes [#97](https://github.com/HONGHUTECHNOLOGY/honghueasystudy/issues/97)



## 4.4.14 (2023-05-16)


### Bug Fixes

* **script:** 修复智慧职教多层级任务检测 (64aaf13)
* **script:** 优化题库状态停用显示 (a012a56)



## 4.4.13 (2023-05-12)


### Bug Fixes

* **script:** 修复题库缓存不是最新的BUG (a7a89b9)



## 4.4.12 (2023-05-12)


### Bug Fixes

* **script:** 修复题库配置清空后会留下两个小括号的bug (0993a52)



## 4.4.11 (2023-05-12)


### Bug Fixes

* **script:** 继续优化智慧树作业考试检测 (2a337bb)



## 4.4.10 (2023-05-11)



## 4.4.9 (2023-05-11)



## 4.4.8 (2023-05-11)



## 4.4.7 (2023-05-11)


### Bug Fixes

* **script:** 将更新通知的请求方法改成油猴跨域请求，防止有些页面的 safe 策略阻止请求。 (6613973)
* **script:** 优化智慧树考试作业提示 (3703e97)


### Features

* **script:** 新增题库开关功能 (07f3cfc)



## 4.4.5 (2023-05-10)



## 4.4.4 (2023-05-10)


### Bug Fixes

* **script:** 修复智慧树考试作业进入后不自动开始，而是需要刷新才能开始的BUG (8f197ec)



## 4.4.3 (2023-05-09)



## 4.4.2 (2023-05-09)


### Bug Fixes

* **script:** 修复智慧树作业考试阅读理解小题读取失败的BUG (37e42f1)



## 4.4.1 (2023-05-09)


### Bug Fixes

* **script:** 优化没有题库配置的提示 (dc55244)



# 4.4.0 (2023-05-09)


### Bug Fixes

* **core:** 修复搜索结果图片显示问题 (0ebc3f9)
* **core:** 优化单选题选项ABCD冗余并没有去掉的BUG (f88fd86)
* **script:** 全面优化自动答题逻辑，并将搜索结果直接显示在各自的脚本面板下，无需反复跳转查看。 (8712b24)
* **script:** 修复智慧树图片题的BUG (5adda0b)
* **script:** 优化日志显示 (bc7521a)
* **script:** 优化智慧树视频加载缓慢时无法自动播放的BUG (640bc72)
* **script:** 优化智慧树校内课作业 (c877ed6)
* **script:** 优化智慧职教MOOC的自动学习逻辑 (9694773)
* **script:** 智慧树考试强制添加保存弹窗，并从头开始每题保存，防止用户切换题目导致保存失败 (f6c0e22)
* **script:** update build script (4aa68f1)


### Features

* **script:** 增加搜索结果与题目同步显示功能 (f793d43)
* **script:** 增加职教云考试功能 (c9bc7ad)



## 4.3.7 (2023-04-24)


### Bug Fixes

* **script:** 修复智慧职教MOOC学院自动答题无法处理判断题的BUG (b573684)


### Features

* **script:** 添加职教云作业自动答题 (4db11a4)


### Performance Improvements

* **core:** add woker.onElementSearched args[1] : root (c0244e9)



## 4.3.5 (2023-04-24)


### Bug Fixes

* **script:** 修复题库缓存搜索时每题只出一个结果的BUG (222735a)
* **script:** 修复智慧职教MOOC自动答题的填空题无法填空的BUG (565f879)



## 4.3.3 (2023-04-24)


### Bug Fixes

* **script:** 撤回智慧树图片识别，否则导致作业考试无法使用。 (fe5b197)



## 4.3.2 (2023-04-24)


### Bug Fixes

* **script:** 修复一些显示BUG (eb4cbc1)



## 4.3.1 (2023-04-24)


### Bug Fixes

* **script:** 帮助智慧树修复图片题无法显示的BUG (bb4c5aa)



# 4.3.0 (2023-04-24)


### Bug Fixes

* **app:** 优化浏览器环境问题 (090c7af)
* **core:** 修复题库搜题时出现 Cannot convert object to primitive value 问题 (9af5f3f)
* **scirpt:** 优化搜索结果的显示，并且添加快捷百度一下按钮 (e074a95)
* **script:** 添加超星自动答题后暂停提示 (0635db9)
* **script:** 新增超星匹配域名： hnsyu.net (481445f)
* **script:** 新增超星视频加载失败检测功能 (1b1e9b8)
* **script:** 修复上个版本智慧职教MOOC学院中作业自动答题题目为空的BUG (e095493)
* **script:** 修复手贱导致的判断题乱选的BUG (4cfa3c8)
* **script:** 优化 $modal API ，修复 onClose 执行逻辑 (37cd819)
* **script:** 优化超星编辑框复制粘贴问题 (b263146)
* **script:** 优化脚本教程，优化搜索结果，删除独立的通知提示和版本日志，转移到脚本首页中。 (12d9cef)
* **script:** 优化屏蔽复制粘贴限制 (3c124c3)
* **script:** 优化搜索结果空白的BUG (5de62f5)
* **script:** 优化智慧树学习逻辑，用户手动切换视频时脚本可以重新生效。 (ad5757c)


### Features

* **core:** 优化 el API 方便自定义样式 (e3468f7)
* **script:** 将题库缓存储域切换成本地存储 (6969b52)
* **script:** 添加题库缓存功能 (38bde15)
* **script:** 添加智慧职教MOOC学院的作业自动答题功能，优化刷课逻辑。 (e2954f4)



## 4.2.31 (2023-04-20)


### Bug Fixes

* **script:** 修复超星图片题选择BUG (93c520c)
* **script:** 优化智慧树共享课和校内课的作业和考试 (c80b08c)



## 4.2.29 (2023-04-20)


### Bug Fixes

* **script:** 优化超星繁体字识别，优化http网站下复制粘贴问题 (f98f2c4)
* **script:** 优化智慧树作业考试文字识别BUG (317f136)
* **scripts:** 修复超星倍速提示没有显示的BUG (ec02677)



## 4.2.26 (2023-04-19)


### Bug Fixes

* **app:** 修复软件批量创建中无法导出模板的BUG (7ba565e)
* **app:** 修复OCR初始化软件路径读取问题 (2ef18e0)
* **scirpt:** 在鸿鹄易学软件中不显示软件配置同步的面板 (baf3815)
* **script and app:** 修复脚本题库检测BUG，优化软件更新提示 (7e217d1)
* **script:** - 优化超星章节测试题目解析 (6b39e40)
* **script:** 对超星繁体字库加载进行异常处理 (7a0c825)
* **script:** 删除清空答案选项 (06936a5)
* **script:** 修复超星输入框无法复制粘贴的BUG (d8a3c30)
* **script:** 修复超星章节测试出现年份丢失的BUG (941c0e9)
* **script:** 修复超星章节测试出现年份丢失的BUG (2bc1ce1)
* **script:** 修复搜索结果答案是图片但没有显示的BUG (860d1fe)
* **script:** 修复智慧树考试无法识别题目的BUG (5140d95)
* **script:** 优化软件同步设置，优化题库状态显示 (4e3cc96)
* **scripts:** 每次渲染强制更新通知和版本日志 (7cc5347)


### Features

* **script:** 添加题目冗余字段自定义删除功能 (198e240)



## 4.2.15 (2023-04-04)


### Bug Fixes

* **all:** 修复软件配置同步导致的各种问题 (6040d70)
* **script:** 修复搜索结果超时后全部题库都显示超时的BUG (a11b2a5)
* **script:** 修复通知和版本日志在有些页面访问不了的BUG (7fa694a)
* **script:** 优化全局设置题库检测，增加防抖 (a1de6ab)



## 4.2.11 (2023-04-03)


### Bug Fixes

* **all:** 修改项目链接 enncy/online-course-script => HONGHUTECHNOLOGY/honghueasystudy (e7f0229)
* **app:** 使用JSON消除自定义脚本的响应式特性，修复每个浏览器自定义脚数据相同的问题。 (af7b97e)
* **app:** 新增软件 zip 打包方式，修复工作区丢失的BUG (8fe1357)
* **app:** 修复部分用户加载不出导航页的BUG (19f4d10)
* **app:** 修复软件标题栏重载时不自动切换的BUG (25f45ce)
* **app:** 修复软件浏览器标签输入时不自动提示的BUG (6aececb)
* **app:** 修复软件运行途中删除文件会导致所有浏览器关闭的BUG (45a2c22)
* **app:** 修改app加载文件以及油猴插件路径问题 (cbf6930)
* **app:** 优化 app remote 模块，修改成异步通信，修复同步通信导致的页面卡死问题。 (9a81721)
* **app:** 优化软件导航页，将旧版 app-info 接口代理删除，全局使用15319端口进行访问，修改浏览器启动选项，使浏览器环境更接近真实浏览器 (9c8d3fd)
* **app:** 优化软件更新程序，并修复更新通知抽搐问题 (460e79a)
* **app:** 优化软件监控问题，以及启动脚本，和浏览器状态处理优化。 (7b7475d)
* **app:** 优化软件自动化脚本，添加类型声明 (b3f1565)
* **app:** app version update (5ddce81)
* **app:** remove public build (d3e4340)
* **core:** 持续优化超星直播回放脚本 (1d3b399)
* **core:** 调整职教云任务读取速度 (b2adafb)
* **core:** 更改  $gm 和 $ 修改后的代码 (941ea30)
* **core:** 更新超星未完成章节会出现提示框的问题 (ebd75d1)
* **core:** 更新教程链接 (f07fe39)
* **core:** 更新智慧树脚本 (dc04328)
* **core:** 继续修复上个版本问题 (41ca48c)
* **core:** 将 dropdown 的 opiton 元素改成 div 元素 (5a8877e)
* **core:** 将 unsafeWindow 全局变量封装成 useUnsafeWindow (1c0f0bb)
* **core:** 将超星视频进度步数调整为0.25，倍速颗粒度控制更高。 (1702aa9)
* **core:** 将整个项目修改成跨域响应式模式 (10aaf0a)
* **core:** 脚本学习核心修改，适配 useSettings 和 useContext 两个 API (b4e38b1)
* **core:** 解决cx任务点未完成出现弹窗的问题 (d9a6738)
* **core:** 删除超星在作业考试中题目多余内容导致的正确率下降 (5ff27e5)
* **core:** 删除全局变量 鸿鹄易学 (c74195d)
* **core:** 添加本地存储初始化时删除无用字段 (dc57a4a)
* **core:** 为所有参数提供默认值，防止页面空白或者头部空白。 (baf6086)
* **core:** 限制请求超时时间最小为10 (f3fc59e)
* **core:** 新增ICVE字段 (abbcfec)
* **core:** 修复 store 环境检测问题 (cd14eb0)
* **core:** 修复 StringUtils 导入问题 (50b83dd)
* **core:** 修复$message不能永久显示bug (3eec4b8)
* **core:** 修复不能关闭路线切换的BUG (a5694f1)
* **core:** 修复部分页面存在不执行 interactive 生命周期的问题 (1f9a8cc)
* **core:** 修复超星复习模式自动切换的BUG (64c63cc)
* **core:** 修复超星视频答题永远只选2个选项的BUG (1209ee7)
* **core:** 修复超星音频任务不能播放的BUG (2777c69)
* **core:** 修复答题结果中存在答案但是不选的BUG (8129842)
* **core:** 修复打包后文件中文变成Unicode编码的问题 (ea6da2c)
* **core:** 修复代码中带有特殊字符时，unicode 转换失败 (fb0cb21)
* **core:** 修复跨域问题 (8ad21bf)
* **core:** 修复每次页面加载都要删除core监听队列的bug (230d43a)
* **core:** 修复日志面板不会实时滚动的BUG (a0b9fff)
* **core:** 修复视频频繁停止导致的频繁验证码 (62f708e)
* **core:** 修复数字输入可以超过范围的BUG (edbd3bc)
* **core:** 修复题库配置报错异常未捕获的BUG (4e04da0)
* **core:** 修复职教云进度不显示的BUG (480cfa3)
* **core:** 修复职教云任务获取出现子节点BUG (ba63921)
* **core:** 修复职教云子节点读取的问题，优化任务列表，优化学习脚本 (5a11f13)
* **core:** 修复智慧树倍速失效的BUG (7943442)
* **core:** 修复智慧树视脚本的频路径匹配 (b03dd08)
* **core:** 修复智慧树视频测验弹窗无法关闭的BUG (fc0741f)
* **core:** 修复select,range等对value不显示的bug (201b3ad)
* **core:** 修复zhs弹窗关闭的问题 (a688768)
* **core:** 修改 $creator.tooltip 的卡死BUG，很多元素时会导致卡顿，这里将 tooltip 变成单个全局元素。 (da59c28)
* **core:** 修改 userjs.templete 模板文件，兼容跨域响应式，并修改 homepage 等字段 (f945a80)
* **core:** 修改生命周期执行规则 (99b66fb)
* **core:** 修改搜索结果文案 (00f185e)
* **core:** 修改元素是否存在的判断 (345fbcc)
* **core:** 修改cdn地址 (013e3ba)
* **core:** 移除页面反调试脚本至超星 (77cb19c)
* **core:** 因全局变量删除，且需要封装 store 中多个变量的处理，以及防止变量污染，新增了 useContext 和 useSettings 的API，相应涉及代码同步更新。 (6d9fa51)
* **core:** 优化 start 主函数，防止脚本重新执行 (bef652d)
* **core:** 优化超星直播回放 (0727bea)
* **core:** 优化登录脚本，非空判断 (684c441)
* **core:** 优化获取远程本地软件题库配置功能 (09986b5)
* **core:** 优化题库解析器 (67b50a4)
* **core:** 优化题库配置字段 (d674f00)
* **core:** 优化图片识别时图片链接显示的问题 (d9778f6)
* **core:** 优化响应式存储 (b307f74)
* **core:** 优化页面通讯以及构建 (7a20041)
* **core:** 优化智慧树脚本，适配 useContext 和 useSettings 两个 API (a24d991)
* **core:** 优化自动答题逻辑，修复有答案不选的BUG (23df64d)
* **core:** 优化鸿鹄易学环境加载问题 (2742ed4)
* **core:** 暂时删除视频答题功能 (b8eeba5)
* **core:** 增加答题器的 await 等待机制，多选题选择时需要 await 等待 (853a30d)
* **root:** 修复 release.sh 打包文件错误时仍然执行的BUG (6f14bd8)
* **root:** 优化构建发布release.sh文件 (a855740)
* **scirpt:** 修复搜索结果显示与搜题不一致的BUG，优化各脚本，持续优化学习通任务检测算法。 (f49737a)
* **script:** 持续修复超星问题 (f2f08e2)
* **script:** 登录时将脚本至于左上方防止挡住软件操作 (dc2bf1d)
* **script:** 删除超星的强制答题选项 (60bf03c)
* **script:** 删除脚本展开功能 (ec1f527)
* **script:** 删除浏览器窗口检测，经过测试全屏游戏中也会进行误报。 (bf30309)
* **script:** 使用固定端口与桌面软件通讯 (7bc6de4)
* **script:** 添加环境检测，优化职教云逻辑 (709e673)
* **script:** 修复超星多个视频同时播放的BUG (51ea1b0)
* **script:** 修复超星频繁验证码的BUG (8544e87)
* **script:** 修复超星章节测试填空题不填的问题 (05a3cd1)
* **script:** 修复超星BUG (8fe0a40)
* **script:** 修复窗口移除页面问题 (bf2017a)
* **script:** 修复答题器出现错误时会一直卡死 (0f02745)
* **script:** 修复复制粘贴解除限制的BUG (ebded93)
* **script:** 修复通用-全局设置中题库状态检测BUG (ebd6536)
* **script:** 修复学习通刷课逻辑 (831f1d3)
* **script:** 修复智慧树答题后不保存的BUG (c56b54f)
* **script:** 修复智慧树作业答题完成后选择BUG (8abf168)
* **script:** 优化播放函数 (4204594)
* **script:** 优化超星和智慧树脚本 (cb5fe71)
* **script:** 优化窗口加载问题 (e5cba2c)


### Features

* **all:** 脚本2.0与软件4.0更新完毕 (6e04369)
* **all:** 脚本更新至 4.0 ， 软件更新至 2.0 (7cb995f)
* **app and web:** 将 electron 升级到 23.0.0 ， 删除 electron 原生窗口样式 frame: false，自定义 titlebar ，并优化主题切换。 (961235f)
* **app:** 将OCR识别模块整合打包，修复OCR路径存在空格执行失败的BUG (9609af6)
* **app:** 删除超星智慧树的其他登录，新增自定义链接进入。 (5851511)
* **app:** 文件中新增图片预览一栏，定时更新页面图像，无需在多个浏览器中切换查看。 (526dbd6)
* **app:** 新增网页打开脚本，将ocr模块一同打包 (7686cf1)
* **app:** 新增仪表盘功能，新增浏览器拓展管理功能，新增新手教程功能，新增批量运行文件功能，并重写文件管理系统。 (8adfede)
* **app:** 新增用户脚本，可自定义网络脚本添加到本地脚本，并自动载入本地脚本，极大拓展软件功能。 (7926b35)
* **app:** 新增资源加载器，优化各种资源加载问题，移除原有的OCR模块打包方式。 (1b83d8a)
* **app:** 修改app主进程从 commonjs 改成 ts (3e29f82)
* **app:** 优化 script 工作线程，规范代码，修复人工错误导致的无限递归。 (156b2f7)
* **core and app:** 新增软件服务端，使脚本可读取软件信息。 (6f4ff54)
* **core:** - 拆分 core ，- 添加多线程答题 - 添加超星作业考试功能 - 将 core/utils 全部进行 $ 前缀声明以便区分 - 优化搜题结果元素。 (a252e85)
* **core:** 4.0 init (4a43ee9)
* **core:** 4.0 init (7151eb3)
* **core:** 持续优化zhs答题功能 (b120ce7)
* **core:** 处理 onbeforeunload 执行结果 (9e0fc87)
* **core:** 给 script 的全部声明周期同样添加相同的事件触发 (289c0d8)
* **core:** 将 鸿鹄易学Woker 和 Script 都变成 EventEmitter 对象，实现内部的事件分发 (2e0872c)
* **core:** 删除窗口关闭按钮，用户可以通过“窗口设置”进行隐藏窗口。 (4a447e4)
* **core:** 搜索结果页面新增复制题目按钮 (4cbd032)
* **core:** 添加 $creator 元素创建工具类变量，并且重写登录脚本，使用动态添加元素的方式重写。 (ba94b16)
* **core:** 添加 $modal.onClose 不管关闭还是确认和取消都会触发此函数 (5cec198)
* **core:** 添加 onhistorychange 钩子 (e8c1ecb)
* **core:** 添加 Script.configs 参数生产后 this.cfg 的代码提示 (d31704e)
* **core:** 添加 script.onrender 钩子 (a81404b)
* **core:** 添加 SearchResultsElement 元素 (d66dffb)
* **core:** 添加 StringUtils 工具类 (4f1341a)
* **core:** 添加超星登录脚本 (9b2e086)
* **core:** 添加面板选择器分组功能 (226d1eb)
* **core:** 添加全局跨域通讯对象,并使用此技术重写模态框调出方法 (81b1daf)
* **core:** 添加使用教程, 重载 el 函数, 修改cors跨域模块使用 setTab, getTab 进行cors跨域标签分区. 优化页面选择逻辑 (eaa6ae5)
* **core:** 添加页面复制粘贴限制解除脚本 (4acdfd0)
* **core:** 添加在线搜题功能 (dc26b2e)
* **core:** 添加智慧树自动答题功能 (642901d)
* **core:** 完成4.0基本架构 (23129f4)
* **core:** 完成脚本内容的元素和数值同步 (4d1dc60)
* **core:** 完成智慧树登录脚本,学习脚本,修复BUG (f07dd0f)
* **core:** 新增 $creator 多个API (d245726)
* **core:** 新增 $message 和 $model 方法进行用户交互 (c6d365c)
* **core:** 新增 通用-搜索结果 显示 (9d9ead8)
* **core:** 新增 智慧职教mooc脚本 ， 优化职教云脚本 (0e44978)
* **core:** 新增 Script.methods 方法可自定义对外暴露函数，优化搜索结果的显示。 (53043d1)
* **core:** 新增 SCript.pin 方法，置顶某个面板 (766f87e)
* **core:** 新增 unsafeWindow 全局变量 (9438a1e)
* **core:** 新增超星直播回放视频脚本 (3788a6f)
* **core:** 新增跨域响应式特性 (d7f967e)
* **core:** 新增智慧树：清晰度选择，定时停止，视频总时长计算，等功能 (7204f26)
* **core:** 新增智慧树的视频画质选择功能 (290ce51)
* **core:** 新增智慧树视频反反混淆脚本 (5de857f)
* **core:** 新增智慧树验证码检测功能 (dcf73b3)
* **core:** 新增智慧职教（职教云）脚本 (59c0cc2)
* **core:** 新增j脚本热更新功能，大大提升开发效率 (42ba110)
* **core:** 修改脚本声明写法，修改 project.scripts 由数组变成对象声明，好处是可以由 project.scripts.[脚本名].cfg.xxx 进行类型推断实现类型提示。 (b73fdb0)
* **core:** 优化 cx 的 Project 新写法 (61f466a)
* **core:** 优化使用$creator (23efe42)
* **core:** 优化渲染工程 (31b5728)
* **core:** 优化智慧树文字识别脚本 (608e760)
* **core:** 增加多线程查题功能 (be3b85c)
* **core:** 增加智慧树习惯分检测，学习记录查询，答题手动控制 (e753da9)
* **core:** 支持跨域调出模态框 (f1f4271)
* **core:** 智慧职教（职教云）发布 (f0eb02f)
* **script and core:** 添加全局错误捕获功能 (476483d)
* **script:** 超星刷课逻辑重写，兼容旧版浏览器CSS样式 (184e0e9)
* **script:** 添加浏览器版本检测 (5c81815)
* **script:** 添加页面关闭提示 (477fb01)
* **script:** 添加智慧职教音频支持 (0e6402c)
* **script:** 新增【职教云】和【智慧职教】脚本 (0cf366a)
* **script:** 新增浏览器最小化检测脚本 (4934f65)
* **script:** 修改浏览器下载链接，新增脚本版本更新检测 (9265c2b)
* **script:** version release 4.0.5 (d7c4574)
* **script:** version update to 4.1.0 (216596f)
* **utils:** 新增utils包，其内置各种实用工具。其中新增脚本打包器，可对打包流程进行优化。 (01879dd)


### Performance Improvements

* **core:** 更新 MoelElement 参数以及实现 (219ca6f)
* **core:** 添加 SearchResultsElement 元素映射 (6f86f6f)
* **core:** 添加defineScript中的domain和hide字段，实现动态修改脚本头部信息的功能。 (a13ab50)



# 3.13.0 (2022-05-23)


### Features

* **core:** 添加页面反调试脚本 (1174617)
* **core:** 新增超星视频中答题功能 (3f925cb)
* **core:** 新增网课视频选项：显示视频进度 (b6086df)



## 3.12.3 (2022-05-22)


### Bug Fixes

* **core:** 修复误删最大长宽导致的超出页面范围 (9b0bcd4)



## 3.12.2 (2022-05-21)


### Bug Fixes

* **core:** 修复某些填空题识别不出的BUG (c2c1c3d)


### Features

* **core:** 新增自动答题选项：强制提交 (e0ff3a2)



# 3.12.0 (2022-05-21)


### Bug Fixes

* **core:** 删除多余输出 (8cee017)
* **core:** 修改userjs打包代码未加分号报错 BUG (e0ec319)
* **core:** 优化多选题答案分割判断 (7da6f92)


### Features

* **core:** 新增随机作答功能 (ecc2a87)
* **core:** 新增图片题识别脚本，新增搜索结果显示题目图片和答案图片 (fd483c3)



# 3.11.0 (2022-05-21)


### Bug Fixes

* **core:** 新增未经压缩代码的打包 (4099fc4)


### Features

* **core:** 新增userjs未经压缩代码打包 (42badc8)



## 3.10.6 (2022-05-20)


### Bug Fixes

* **core:** 修复题库配置解析器BUG (3986a49)



## 3.10.4 (2022-05-20)


### Bug Fixes

* **app:** 修复浏览器报错BUG (fd3780c)
* **core:** 修复超星考试页面样式问题 (03fa9be)
* **core:** 修复题库配置BUG (2b8c939)



## 3.10.2 (2022-05-19)


### Bug Fixes

* **core:** 还原文件，修改 release 执行错误但继续打包发布的BUG (201ae0f)



## 3.10.1 (2022-05-19)


### Bug Fixes

* **app:** 修复软件浏览器选择BUG，并停止火狐浏览器使用。 (5e2559b)
* **core:** 修改 typr 库，减少部分打包体积。 (51e26de)



# 3.10.0 (2022-05-17)


### Features

* **core:** 新增超星繁体字识别选项 - 字典识别 (2a241d6)
* **core:** 新增超星强制答题功能 (e7c4fc0)



## 3.9.6 (2022-05-16)


### Bug Fixes

* 修复日志记录问题 (c9f2147)
* **app:** 修复软件文件重命名时，运行文件名不同步的BUG (28a1af1)
* **app:** 修复智慧树登录后白屏错误的BUG (9622f7e)


### Features

* **app:** 新增软件自动选择浏览器路径功能 (eb56f67)
* **app:** 新增自定义脚本载入路径功能, 路径将托管到官方服务器 (289cefe)



## 3.9.5 (2022-05-16)


### Bug Fixes

* 修复新增 shadowroot 后，复制粘贴脚本失效的BUG (081a99e)
* 优化超星识别时可能遇到选项按钮被删除的BUG (ef396b4)


### Features

* 新增 AnswererWrapper 参数: headers 和 type (8c970bb)
* 新增题库配置跨域模块，可对不同域名的服务器进行跨域访问，并且新增 root 环境变量，可访问元素题目的跟节点元素对象。 (4e8ea1c)



# 3.8.0 (2022-05-11)


### Bug Fixes

* 避免重复劫持函数导致页面内存移除 (067ee58)
* 修复智慧树倍速不能立刻改变的BUG (39d7402)


### Features

* + 新增消息提示 + 修复火狐底部版本不显示的BUG  + 优化eslint代码 + 增加文字识别错误提示 + 将原有弹出框修改为消息提示 + 增加API:message (534bee3)
* 使用ShadowRoot对脚本进行加固 (346d9d1)



## 3.7.4 (2022-05-09)



## 3.7.3 (2022-05-08)



## 3.7.2 (2022-05-07)


### Bug Fixes

* 修改 store 初始化位置 (808eb08)


### Features

* 添加智慧树文本识别脚本和屏蔽视频检测脚本 (85ddac1)



# 3.7.0 (2022-05-04)


### Features

* 添加答题等待时间，方便检查或者使用其他答题工具。 (12f2960)



## 3.6.4 (2022-05-04)


### Bug Fixes

* 深度优化OCR (a21a8ad)
* 修复填空题多个填空不填的BUG (4a0f031)



## 3.6.2 (2022-04-30)


### Bug Fixes

* 修改 OCR 脚本加载路径, 确保能够访问 work 和 core 脚本 (9b1544a)



## 3.6.1 (2022-04-30)


### Bug Fixes

* 修改环境依赖 (9c69d35)



# 3.6.0 (2022-04-29)


### Features

* 新增智慧树共享课考试脚本 (5ba2022)



## 3.5.5 (2022-04-28)


### Bug Fixes

* 适当增大了文本便于识别 (483d68b)



## 3.5.4 (2022-04-28)


### Bug Fixes

* 优化OCR空格问题，还有上个版本OCR锁初始化的问题 (82a84d7)



## 3.5.3 (2022-04-28)


### Bug Fixes

* 优化 OCR ， 解决题目选项没有识别的BUG (e534658)



## 3.5.2 (2022-04-27)


### Bug Fixes

* 优化 OCR 加载逻辑 (9dd69dc)



## 3.5.1 (2022-04-27)


### Bug Fixes

* 优化 OCR 数据加载问题 (ed958a9)



# 3.5.0 (2022-04-27)


### Bug Fixes

* 修复超星有时不能自动下一章的BUG (7c5516f)


### Features

* 繁体字乱码识别功能 (ec01cd1)
* 开发智慧树倍速选项 (83015b7)



## 3.4.5 (2022-04-23)


### Bug Fixes

* 修复软件重命名有时会无效的BUG (48fb520)
* 优化软件启动加载 (be866d1)



## 3.4.4 (2022-04-22)


### Bug Fixes

* 修复提交设置的BUG (612dccc)



## 3.4.3 (2022-04-21)


### Bug Fixes

* 删除无用的选项：搜题错误时暂停 (e30446c)



## 3.4.2 (2022-04-19)


### Bug Fixes

* 修复软件设置空白的BUG (f757a3b)
* 修复自动答题提交设置保存不了的BUG (fb9bd39)
* app version upate (505ce22)



## 3.4.1 (2022-04-17)


### Bug Fixes

* 修复ABCD纯答案直接点击的BUG (9df1222)



# 3.4.0 (2022-04-17)


### Features

* 新增智慧树学分课作业脚本 (978bf47)



## 3.3.14 (2022-04-15)


### Bug Fixes

* 修复 release.sh 版本命令 (652a022)



## 3.3.13 (2022-04-15)



## 3.3.12 (2022-04-13)



## 3.3.11 (2022-04-13)


### Bug Fixes

* 修复 paste 和 input 共存导致的粘贴BUG (370e46f)



## 3.3.10 (2022-04-13)


### Bug Fixes

* 修复不能右键复制粘贴的BUG (9af5480)



## 3.3.9 (2022-04-13)


### Bug Fixes

* 修复上个版本store加载问题 (48fdc1a)



## 3.3.8 (2022-04-13)


### Bug Fixes

* app 兼容鸿鹄易学助手最新版的响应式特性 (eaa66dd)


### Features

* 新增全局存储功能，使用油猴自带API实现。 (be13a5b)



## 3.3.7 (2022-04-13)


### Bug Fixes

* 支持纯浏览器端的加载，仅用于核心API的调用。 (cf9dbe8)


### Features

* 删除调试输出 (a096447)



## 3.3.6 (2022-04-13)


### Bug Fixes

* 修复打包压缩选项 (9425289)


### Features

* 新增超星 : 屏蔽作业考试填空简答题粘贴限制 功能 (591971e)



## 3.2.20 (2022-04-09)


### Bug Fixes

* 延长一点视频暂停后启动的时间，防止超星鬼畜。 (837d873)



## 3.3.5 (2022-04-13)


### Bug Fixes

* 修复搜索结果 undefined 的 BUG, 修复超星章节测试填空题BUG (97500c5)



## 3.3.4 (2022-04-13)


### Bug Fixes

* 修复超星考试作业页面不能复制粘贴的BUG (4c64c00)
* 修复上个版本响应式导致的倍速，音量失效的BUG (5182d02)
* 修复智慧树复习模式的BUG，修复已经播放完的视频但没有完成却跳过的BUG (3cd12a7)



## 3.3.3 (2022-04-12)


### Bug Fixes

* 兼容库模式，并且优化自动答题答案显示 (fcd2311)


### Features

* 新增自动答题答案预览功能 (29b17e8)



## 3.3.2 (2022-04-12)


### Bug Fixes

* 修复闯关模式因为刷新太快任务点没有出现导致重复的BUG (dad5eb3)
* 修复答题配置输入后会消失的BUG， 新增音量设置 (34cd585)



## 3.3.1 (2022-04-11)



# 3.3.0 (2022-04-11)


### Bug Fixes

* 修复各种问题，并且兼容了响应式特性 (0c42947)
* 修改打包方式为压缩打包 (333661f)


### Features

* 切换网络路线 (0a0a5dd)
* 响应式特性 (5e21f0a)
* vnode 重构成 tsx , 并且新增数据响应式特性 (18c5a78)



## 3.2.20 (2022-04-09)


### Bug Fixes

* 延长一点视频暂停后启动的时间，防止超星鬼畜。 (837d873)



## 3.2.19 (2022-04-08)


### Bug Fixes

* 修复切换路线后倍速无效的BUG (4e3f78b)



## 3.2.18 (2022-04-08)


### Features

* 新增超星视频路线切换功能 (8721e48)



## 3.2.16 (2022-04-08)


### Bug Fixes

* 修复快捷键有时候失效的问题 (0d5df16)



## 3.2.14 (2022-04-08)


### Features

* 新增隐藏按钮 (dce116e)
* 新增ocs快捷键，可重置位置，优化面板初始位置 (af7d231)



## 3.2.13 (2022-04-07)


### Features

* 彻底修复超星验证码问题 (0cf69f2)



## 3.2.12 (2022-04-05)


### Features

* 新增超星支持域名 edu.cn ， 修复多个视频播放时，播放完成继续播放的BUG (959cc9b)



## 3.2.11 (2022-04-04)


### Bug Fixes

* 修改点击间隔 (176d83e)



## 3.2.10 (2022-04-04)


### Bug Fixes

* 继续优化答题问题 (2dfd14d)



## 3.2.9 (2022-04-04)


### Bug Fixes

* 修复超星重复暂停的BUG (c5c7681)



## 3.2.8 (2022-04-04)


### Features

* 新增解除右键，复制粘贴限制的功能， 修复超星播放视频重复卡死的BUG (fe9b59a)



## 3.2.7 (2022-04-04)


### Features

* 答案判断优化 (801e4f3)



## 3.2.6 (2022-04-03)


### Bug Fixes

* 修复软件1.2.0自动更新BUG (512b61c)
* 修复智慧树作业重复关闭的BUG (2288d61)


### Features

* 新增 common 包 ， 修复脚本执行BUG ， 修复通知 ， 新增打包脚本 scripts 文件夹 (0831102)
* aPP版本更新 1.2.0 (4ebd3cb)



## 3.2.5 (2022-04-01)


### Bug Fixes

* 修复答题时多选不全的BUG， 修复答题时答案为空报错的BUG (75177b5)
* 修改远程信息获取路径 (b80d091)


### Features

* 自动更新功能， scripts 分包 ， 浏览器端修改为 core 文件夹 (f536614)



## 3.2.4 (2022-03-31)


### Bug Fixes

* 修复上个版本视频跳过问题 (1719bbd)
* 修复油猴脚本更新BUG (fd043dd)



## 3.2.3 (2022-03-30)


### Features

* 添加任务点是否完成检测，不重复执行已完成任务点， 修复判断题不选择的BUG (dbc1a86)



## 3.2.2 (2022-03-27)


### Features

* 添加智慧树学分课脚本 (37b112a)



## 3.2.1 (2022-03-27)


### Features

* 添加禁止弹窗脚本 (2b6be41)



# 3.2.0 (2022-03-26)


### Features

* **app:** 软件更新，支持超星学习作业考试，支持脚本自动更新 (f500119)



## 3.1.11 (2022-03-26)


### Features

* 更新软件，加载时自动更新ocs脚本 (e16d954)



## 3.1.10 (2022-03-26)


### Bug Fixes

* 修复脚本只能在油猴环境下执行的BUG (4f081c9)



## 3.1.9 (2022-03-26)



## 3.1.8 (2022-03-26)


### Bug Fixes

* 修改答案结果判断bug (a2808d0)



## 3.1.7 (2022-03-25)


### Bug Fixes

* 修改题库配置设置，取消必选，添加判断，如果没有题库设置，则不开始自动答题。 (b25ef93)
* 修改油猴配置 (db8a733)
* **cx:** 兼容cx选项获取不到，以及设置保存bug (5a2e672)
* **script:** 修复答题解析器bug， 更新做题标题获取，修复学习时章节测验类型获取失败bug， 更新 app 的脚本 (659955b)
* **script:** 修改答题配置解析器 (6e4332f)
* **style:** 修改样式引入 (8a6ab90)
* **url:** 修改 url cdn 资源 (5cad7c1)



# [3.0.0-beta.9](https://github.com/HONGHUTECHNOLOGY/honghueasystudy/compare/3.0.0-beta.6...3.0.0-beta.9) (2022-03-24)


### Bug Fixes

* **index:** 修改数据路径 (c97bdaf)


### Features

* 版本更新至 beta.6 (cc63a07)
* 新增答题器，新增题库配置选项，新增zhs作业功能 (449c008)
* 修改为单进程软件，支持.ocs文件的点击加载，新增软件标题栏，删除原生标题栏 (8427936)
* **all:** 版本更新 (3b17a92)
* **scripts:** 添加超星学习，考试，作业脚本。 添加日志，搜题结果面板。 (94d99d4)



# [3.0.0-beta.6](https://github.com/HONGHUTECHNOLOGY/honghueasystudy/compare/3.0.0-beta.5...3.0.0-beta.6) (2022-03-15)


### Features

* **app | script:** 新增 script/browser 端的面板显示，替换之前的油猴头部信息加载模式，添加app主进程端的脚本调用 (f9cf10f)
* **web:** 添加文件关闭编辑功能，取消页面所有动画效果，删除'关于'页面，新增'帮助'一栏。 (1f4d4ad)



# [3.0.0-beta.5](https://github.com/HONGHUTECHNOLOGY/honghueasystudy/compare/0675ac6a631e8946a52e7e4e655b28faee8248d4...3.0.0-beta.5) (2022-03-07)


### Bug Fixes

* **package.json:** fix dependency security (948662a)
* **web:** 优化侧边栏： 优化文件列表头部，优化文件列表搜索 (84acc62)


### Features

* add glup (15c0015)
* **all:** 添加终端显示，添加脚本执行，添加文件属性 (cf5dc9a)
* **app and web:** 添加文件夹管理，添加右键菜单，初始化设置和关于页面 (24930ad)
* **app and web:** add elctron-builder in app , init  page view in web (fe60df6)
* **init:** init project (0675ac6)
* **packages:** init packages : web app scripts (24e5386)
* **script|web|app:** add commander line support, and update web view (35efb39)
* **script:** add cx and zhs login (8d69e16)
* **script:** change folder name, and add browser script (c540500)
* **scripts-tempaermonkey:** add tempermonkey support, update browser export (456af02)
* **scripts/cx:** add new login : phone-code login (494e523)
* **scripts:** 修改 package.json ， 调整登录api (614c628)
* **scripts:** add script package (6f03fb4)
* **test and cx login:** update tests README.md and add new login way of cx : phone-code-login (ab46a1d)
* **web:** 添加文件解析，使用懒加载进行文件的显示 (0da0f02)
* **web:** 添加文件拖拽，文件搜索功能 (fb1b7c9)
* **web:** 添加重命名功能，添加目录展开记录保存，添加帮助页面 (0b90cc2)
* **web:** 文件编辑，文件拓展 (9f2f4fb)
* **web:** 支持文件（夹）拖拽放置，文件（夹）的创建，删除 (705cc21)
