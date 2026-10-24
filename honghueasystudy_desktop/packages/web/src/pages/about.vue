<template>
	<div class="doc-page about-page">
		<div class="doc-ambient" aria-hidden="true">
			<div class="doc-ambient__grid"></div>
			<div class="doc-ambient__orb"></div>
		</div>

		<DocHeader active="about" />

		<main class="doc-shell">
			<section class="about-hero">
				<div class="about-hero__copy">
					<span class="doc-kicker">ABOUT HONGHU EASYSTUDY</span>
					<h1 class="doc-title">让技术退到幕后，<br /><span>让学习回到专注。</span></h1>
					<p class="doc-lead">
						鸿鹄易学是一套面向高校网课场景的学习辅助工具，由鸿鹄科技开发并 MIT 开源。它把分散的学习平台、课程任务与答题配置整理到同一条工作流里，减少机械点击，把时间留给理解与思考。
					</p>
					<div class="doc-badges">
						<span><i></i>MIT 开源</span>
						<span><i></i>浏览器扩展 + 桌面端</span>
						<span><i></i>七大学习平台</span>
					</div>
				</div>

				<div class="about-emblem" aria-hidden="true">
					<div class="about-emblem__orbit about-emblem__orbit--outer"></div>
					<div class="about-emblem__orbit about-emblem__orbit--inner"></div>
					<div class="about-emblem__core">
						<img src="/favicon.png" alt="" />
						<strong>鸿鹄易学</strong>
						<small>EASYSTUDY</small>
					</div>
					<span class="about-emblem__label about-emblem__label--top">BROWSER AUTOMATION</span>
					<span class="about-emblem__label about-emblem__label--bottom">FOCUS ON LEARNING</span>
				</div>
			</section>

			<div class="about-stats">
				<div><strong>7</strong><span>主流学习平台</span></div>
				<div><strong>2</strong><span>使用形态</span></div>
				<div><strong>4</strong><span>类常见题型</span></div>
				<div><strong>MIT</strong><span>开放源代码</span></div>
			</div>

			<section id="why" class="doc-section">
				<aside class="doc-section__aside">
					<span class="doc-section__number">01</span>
					<p class="doc-section__name">为什么做</p>
					<small>THE PROBLEM WE CARE ABOUT</small>
				</aside>
				<div class="doc-section__body">
					<h2>学习已经够复杂，工具应该简单。</h2>
					<p class="section-lead">
						一名学生可能同时面对多个课程平台、不同的章节结构、重复的播放与确认操作。这些操作本身不产生理解，却持续消耗注意力。鸿鹄易学希望把这些与学习目标无关的步骤收敛起来。
					</p>

					<div class="principle-grid">
						<article>
							<span>01</span>
							<h3>减少操作，不替代理解</h3>
							<p>自动播放、章节切换与答案查询处理的是重复流程；阅读、判断和知识内化仍然属于使用者自己。</p>
						</article>
						<article>
							<span>02</span>
							<h3>能力透明，配置可控</h3>
							<p>答题依赖使用者配置的题库或 AI 接口。没有答案来源时，工具不会假装知道答案。</p>
						</article>
						<article>
							<span>03</span>
							<h3>面向真实页面持续适配</h3>
							<p>不同平台有各自的课程结构、题型和登录流程。项目按平台维护脚本，而不是用一套假设覆盖所有页面。</p>
						</article>
					</div>
				</div>
			</section>

			<section id="products" class="doc-section">
				<aside class="doc-section__aside">
					<span class="doc-section__number">02</span>
					<p class="doc-section__name">产品形态</p>
					<small>ONE CORE, TWO EXPERIENCES</small>
				</aside>
				<div class="doc-section__body">
					<h2>同一套学习能力，两种使用方式。</h2>
					<p class="section-lead">浏览器扩展适合轻量使用；桌面端进一步提供隔离的浏览器环境与自动程序，应对多账号和集中管理场景。</p>

					<div class="product-grid">
						<article class="product-card">
							<div class="product-card__head">
								<span class="product-icon">
									<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c3 3.4 3 14.6 0 18M12 3c-3 3.4-3 14.6 0 18" /></svg>
								</span>
								<span class="product-label">EXTENSION</span>
							</div>
							<h3>浏览器扩展</h3>
							<p>以 MV3 扩展运行在 Chrome / Edge 中，匹配学习平台页面后注入脚本与悬浮面板，保留用户原有浏览器与登录习惯。</p>
							<ul>
								<li>Edge 加载项与手动加载两种安装方式</li>
								<li>进入支持页面后显示统一面板</li>
								<li>课程学习、题库与 AI 答题共用核心能力</li>
							</ul>
						</article>

						<article class="product-card product-card--dark">
							<div class="product-card__head">
								<span class="product-icon">
									<svg viewBox="0 0 24 24" fill="none"><rect x="3" y="4" width="18" height="16" rx="3" /><path d="M3 9h18M8 4v5" /></svg>
								</span>
								<span class="product-label">DESKTOP</span>
							</div>
							<h3>桌面工作站</h3>
							<p>使用 Electron 构建，通过 Playwright 管理独立浏览器实例。创建浏览器时初始化环境并加载内置扩展，适合多账号与自动化登录。</p>
							<ul>
								<li>每个浏览器独立缓存与登录环境</li>
								<li>自动程序负责登录、页面跳转等步骤</li>
								<li>浏览器、扩展与任务集中管理</li>
							</ul>
						</article>
					</div>
				</div>
			</section>

			<section id="capabilities" class="doc-section">
				<aside class="doc-section__aside">
					<span class="doc-section__number">03</span>
					<p class="doc-section__name">核心能力</p>
					<small>WHAT IT ACTUALLY DOES</small>
				</aside>
				<div class="doc-section__body">
					<h2>从课程页面出发的真实能力。</h2>
					<p class="section-lead">不是抽象的“万能助手”，而是围绕网课页面上实际存在的播放、阅读、任务点、作业与考试流程设计的一组能力。</p>

					<div class="about-capabilities">
						<article>
							<span class="cap-index">01</span>
							<div><h3>课程学习</h3><p>处理视频播放、阅读、文档与章节任务，按课程顺序推进已完成状态。</p></div>
						</article>
						<article>
							<span class="cap-index">02</span>
							<div><h3>题库与 AI 答题</h3><p>支持自定义题库、TikuAdapter，以及兼容 OpenAI 格式的大模型接口；答案来源由使用者配置。</p></div>
						</article>
						<article>
							<span class="cap-index">03</span>
							<div><h3>划词搜题与缓存</h3><p>选中页面文字即可发起题目搜索；同一页面中的重复题目可利用题库缓存减少请求。</p></div>
						</article>
						<article>
							<span class="cap-index">04</span>
							<div><h3>自动化登录</h3><p>桌面端为超星、智慧树、智慧职教与职教云提供账号登录自动程序，减少重复输入。</p></div>
						</article>
						<article>
							<span class="cap-index">05</span>
							<div><h3>多浏览器隔离</h3><p>不同课程或账号可以分配独立浏览器，Cookie、缓存与登录状态互不干扰。</p></div>
						</article>
						<article>
							<span class="cap-index">06</span>
							<div><h3>页面体验处理</h3><p>围绕课程页面提供悬浮面板、倍速与音量控制、弹窗处理等使用体验优化。</p></div>
						</article>
					</div>

					<div class="platform-line">
						<span>已适配</span>
						<p>超星学习通 · 知到智慧树 · 职教云 · 智慧职教 · 中国大学MOOC · 雨课堂 · U校园</p>
					</div>
				</div>
			</section>

			<section id="technology" class="doc-section">
				<aside class="doc-section__aside">
					<span class="doc-section__number">04</span>
					<p class="doc-section__name">技术底座</p>
					<small>HOW IT IS BUILT</small>
				</aside>
				<div class="doc-section__body">
					<h2>开放、可检查、按平台维护。</h2>
					<p class="section-lead">鸿鹄易学采用浏览器扩展与桌面端共享核心脚本的方式实现。源码公开，具体能力可以直接从代码与页面脚本中核对。</p>

					<div class="tech-stack">
						<div><span>EXTENSION</span><strong>Manifest V3</strong><p>Chrome 120+，用户脚本与页面脚本按需注入。</p></div>
						<div><span>DESKTOP</span><strong>Electron + Playwright</strong><p>独立用户目录、多浏览器实例与自动化任务管理。</p></div>
						<div><span>CORE</span><strong>TypeScript</strong><p>各平台学习脚本共享项目、设置与悬浮面板基础设施。</p></div>
						<div><span>ANSWER</span><strong>题库 / OpenAI 兼容</strong><p>答案来源可替换，支持自定义 API 与第三方题库适配。</p></div>
					</div>

					<div class="architecture-note">
						<div class="architecture-note__line"></div>
						<p><strong>一套核心，两个宿主。</strong> 扩展负责把能力带进日常浏览器，桌面端负责创建可控的学习环境。两端都以用户主动打开课程页面为起点，不对平台服务器进行绕过或篡改。</p>
					</div>
				</div>
			</section>

			<section id="principles" class="doc-section">
				<aside class="doc-section__aside">
					<span class="doc-section__number">05</span>
					<p class="doc-section__name">原则与边界</p>
					<small>WHAT WE BELIEVE</small>
				</aside>
				<div class="doc-section__body">
					<h2>工具负责效率，选择仍然属于你。</h2>
					<p class="section-lead">自动化可以减少重复劳动，但不能代替学习，也不能越过学校与平台的规则。我们更愿意把鸿鹄易学定义为“学习流程工具”，而不是“成绩捷径”。</p>

					<div class="boundary-list">
						<div><span>01</span><p><strong>遵守规则。</strong> 使用前应确认所在学校、教师与课程平台对辅助工具的要求，并自行承担使用行为带来的结果。</p></div>
						<div><span>02</span><p><strong>答案需要核对。</strong> 题库与 AI 都可能给出错误答案，自动答题结果不构成学习结论，也不保证作业或考试成绩。</p></div>
						<div><span>03</span><p><strong>数据由你掌控。</strong> 题库与 AI 服务需要使用者自行配置。启用 AI 后，题目内容会发送到所填写的接口服务，请自行评估其隐私与合规要求。</p></div>
						<div><span>04</span><p><strong>开源接受检验。</strong> 项目以 MIT 协议开放，欢迎通过代码仓库提交问题、建议与平台适配反馈。</p></div>
					</div>
				</div>
			</section>

			<section id="links" class="about-links">
				<div>
					<span class="doc-kicker">OFFICIAL & OPEN SOURCE</span>
					<h2>从官方入口了解鸿鹄易学。</h2>
					<p>下载、更新日志、问题反馈与源代码都在这里。</p>
				</div>
				<div class="about-links__grid">
					<a href="https://easystudy.honghutech.eu.org" target="_blank" rel="noopener noreferrer"><span>官方网站</span><strong>easystudy.honghutech.eu.org</strong><i>↗</i></a>
					<a href="https://gitcode.com/honghutech/honghueasystudy" target="_blank" rel="noopener noreferrer"><span>GitCode</span><strong>项目源码与国内协作</strong><i>↗</i></a>
					<a href="https://github.com/HONGHUTECHNOLOGY/honghueasystudy" target="_blank" rel="noopener noreferrer"><span>GitHub</span><strong>开放源代码与版本记录</strong><i>↗</i></a>
				</div>
			</section>

			<section class="doc-cta">
				<div>
					<strong>了解之后，回到学习本身。</strong>
					<p>选择一个平台，进入你的课程空间。</p>
				</div>
				<a class="doc-cta__link" href="#/bookmarks">
					前往学习平台
					<svg viewBox="0 0 24 24" fill="none"><path d="M5 12h14M14 7l5 5-5 5" /></svg>
				</a>
			</section>
		</main>

		<footer class="doc-footer">
			<div class="doc-shell doc-footer__inner">
				<span>鸿鹄易学 · 关于我们</span>
				<nav aria-label="页脚导航">
					<a href="#/bookmarks">学习平台</a>
					<a href="#/guide">使用指南</a>
					<a href="https://github.com/HONGHUTECHNOLOGY/honghueasystudy" target="_blank" rel="noopener noreferrer">开放源代码</a>
				</nav>
			</div>
		</footer>
	</div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import DocHeader from '../components/DocHeader.vue';

onMounted(() => {
	document.title = '关于鸿鹄易学 · 鸿鹄易学';
	window.scrollTo({ top: 0 });
});
</script>

<style lang="less">
@import './doc-page.less';

.about-hero {
	display: grid;
	grid-template-columns: minmax(0, 1.2fr) 380px;
	gap: 70px;
	align-items: center;
	padding: 86px 0 72px;
}
.about-emblem {
	position: relative;
	width: 360px;
	height: 360px;
	display: flex;
	align-items: center;
	justify-content: center;
	justify-self: end;
}
.about-emblem__orbit { position: absolute; border-radius: 50%; border: 1px solid rgba(99, 91, 255, 0.12); }
.about-emblem__orbit--outer { width: 352px; height: 352px; animation: emblem-spin 42s linear infinite; }
.about-emblem__orbit--outer::before, .about-emblem__orbit--outer::after { content: ''; position: absolute; width: 7px; height: 7px; border: 3px solid #f6f7f9; border-radius: 50%; background: #635bff; }
.about-emblem__orbit--outer::before { top: 51px; left: 53px; }
.about-emblem__orbit--outer::after { right: 28px; bottom: 91px; background: #c9f77b; }
.about-emblem__orbit--inner { width: 278px; height: 278px; border-style: dashed; opacity: 0.65; }
.about-emblem__core {
	position: relative;
	width: 208px;
	height: 208px;
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	border: 1px solid rgba(255, 255, 255, 0.8);
	border-radius: 50%;
	background: rgba(255, 255, 255, 0.85);
	box-shadow: 0 25px 65px rgba(36, 39, 57, 0.1);
	backdrop-filter: blur(16px);
	img { width: 62px; height: 62px; object-fit: contain; margin-bottom: 16px; filter: drop-shadow(0 8px 15px rgba(99, 91, 255, 0.12)); }
	strong { font-size: 17px; font-weight: 680; letter-spacing: 0.04em; }
	small { margin-top: 5px; color: #9ba1ac; font-size: 7px; font-weight: 650; letter-spacing: 0.2em; }
}
.about-emblem__label { position: absolute; padding: 5px 8px; border: 1px solid rgba(30, 35, 47, 0.08); border-radius: 5px; background: rgba(255, 255, 255, 0.65); color: #989fa9; font-size: 7px; font-weight: 600; letter-spacing: 0.12em; }
.about-emblem__label--top { top: 18px; right: 16px; }
.about-emblem__label--bottom { bottom: 23px; left: 10px; }

.about-stats {
	display: grid;
	grid-template-columns: repeat(4, minmax(0, 1fr));
	margin-bottom: 10px;
	border: 1px solid rgba(24, 28, 38, 0.075);
	border-radius: 15px;
	background: rgba(255, 255, 255, 0.55);
	> div { padding: 22px 25px; border-right: 1px solid rgba(24, 28, 38, 0.07); &:last-child { border: 0; } }
	strong { display: block; color: #20242c; font-size: 27px; font-weight: 660; letter-spacing: -0.05em; }
	span { display: block; margin-top: 7px; color: #979ea8; font-size: 9px; }
}

.principle-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
.principle-grid article { padding: 20px; border: 1px solid rgba(25, 29, 39, 0.07); border-radius: 13px; background: rgba(255, 255, 255, 0.55); }
.principle-grid article > span { color: #b4b0ff; font-size: 9px; font-weight: 650; letter-spacing: 0.08em; }
.principle-grid h3 { margin: 15px 0 8px; font-size: 12px; }
.principle-grid p { margin: 0; font-size: 10px; line-height: 1.8; }

.product-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 13px; }
.product-card { padding: 24px; border: 1px solid rgba(25, 29, 39, 0.075); border-radius: 16px; background: rgba(255, 255, 255, 0.75); }
.product-card--dark { border-color: rgba(255, 255, 255, 0.06); background: radial-gradient(circle at 100% 0%, rgba(99, 91, 255, 0.19), transparent 40%), #17191f; color: #fff; }
.product-card__head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 22px; }
.product-icon { width: 39px; height: 39px; display: grid; place-items: center; border-radius: 10px; background: rgba(99, 91, 255, 0.075); color: #635bff; }
.product-icon svg { width: 19px; stroke: currentColor; stroke-width: 1.45; }
.product-card--dark .product-icon { background: rgba(255, 255, 255, 0.08); color: #b9b5ff; }
.product-label { color: #a5abb4; font-size: 7px; font-weight: 650; letter-spacing: 0.12em; }
.product-card h3 { font-size: 16px; }
.product-card > p { margin: 11px 0 17px; font-size: 10px; line-height: 1.8; }
.product-card--dark > p { color: rgba(226, 230, 239, 0.53); }
.product-card ul { display: flex; flex-direction: column; gap: 7px; margin: 0; padding: 0; list-style: none; }
.product-card li { position: relative; padding-left: 12px; color: #7e8591; font-size: 9px; line-height: 1.6; }
.product-card li::before { content: ''; position: absolute; left: 0; top: 6px; width: 4px; height: 4px; border-radius: 50%; background: rgba(99, 91, 255, 0.55); }
.product-card--dark li { color: rgba(226, 230, 239, 0.53); }
.product-card--dark li::before { background: #c9f77b; }

.about-capabilities { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 30px; border-top: 1px solid rgba(23, 27, 36, 0.08); }
.about-capabilities article { display: flex; gap: 14px; padding: 19px 0; border-bottom: 1px solid rgba(23, 27, 36, 0.08); }
.cap-index { color: #b3b8c1; font-size: 9px; font-weight: 600; letter-spacing: 0.05em; }
.about-capabilities h3 { margin-bottom: 7px; font-size: 11px; }
.about-capabilities p { margin: 0; font-size: 9px; line-height: 1.75; }
.platform-line { display: flex; gap: 15px; align-items: flex-start; margin-top: 22px; padding: 16px 18px; border-radius: 10px; background: rgba(99, 91, 255, 0.045); }
.platform-line span { flex: 0 0 auto; color: #635bff; font-size: 8px; font-weight: 650; letter-spacing: 0.08em; }
.platform-line p { margin: 0; color: #6d7581; font-size: 9px; line-height: 1.7; }

.tech-stack { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.tech-stack > div { padding: 18px; border: 1px solid rgba(25, 29, 39, 0.07); border-radius: 11px; background: rgba(255, 255, 255, 0.58); }
.tech-stack span { color: #a3a9b3; font-size: 7px; font-weight: 650; letter-spacing: 0.12em; }
.tech-stack strong { display: block; margin: 7px 0 6px; font-size: 11px; font-weight: 600; }
.tech-stack p { margin: 0; font-size: 9px; line-height: 1.7; }
.architecture-note { display: flex; gap: 17px; margin-top: 20px; padding: 19px 21px; border-radius: 11px; background: #17191f; }
.architecture-note__line { width: 2px; flex: 0 0 auto; border-radius: 2px; background: #635bff; }
.architecture-note p { margin: 0; color: rgba(226, 230, 239, 0.54); font-size: 9px; line-height: 1.85; }
.architecture-note strong { color: #dcd9ff; font-weight: 600; }

.boundary-list { display: flex; flex-direction: column; border-top: 1px solid rgba(23, 27, 36, 0.08); }
.boundary-list > div { display: flex; gap: 18px; padding: 17px 0; border-bottom: 1px solid rgba(23, 27, 36, 0.08); }
.boundary-list span { color: #b2b7c0; font-size: 9px; font-weight: 600; }
.boundary-list p { margin: 0; font-size: 10px; line-height: 1.8; }
.boundary-list strong { color: #444b55; font-weight: 600; }

.about-links { display: grid; grid-template-columns: 0.9fr 1.1fr; gap: 55px; align-items: center; padding: 60px 0; border-top: 1px solid rgba(23, 27, 36, 0.08); }
.about-links h2 { margin: 18px 0 10px; font-size: 25px; font-weight: 650; letter-spacing: -0.04em; }
.about-links p { margin: 0; color: #8b929c; font-size: 10px; }
.about-links__grid { display: flex; flex-direction: column; gap: 8px; }
.about-links__grid a { position: relative; display: grid; grid-template-columns: 100px 1fr 20px; gap: 12px; align-items: center; padding: 15px 16px; border: 1px solid rgba(25, 29, 39, 0.075); border-radius: 10px; background: rgba(255, 255, 255, 0.6); text-decoration: none; transition: border-color 0.25s, background 0.25s, transform 0.25s; }
.about-links__grid a:hover { border-color: rgba(99, 91, 255, 0.2); background: #fff; transform: translateX(3px); }
.about-links__grid span { color: #8c939d; font-size: 9px; }
.about-links__grid strong { color: #474e58; font-size: 10px; font-weight: 550; }
.about-links__grid i { color: #9da3ac; font-size: 12px; font-style: normal; text-align: right; }

@keyframes emblem-spin { to { transform: rotate(360deg); } }

@media (max-width: 960px) {
	.about-hero { grid-template-columns: 1fr; gap: 30px; padding: 66px 0 58px; }
	.about-emblem { width: 300px; height: 300px; justify-self: start; }
	.about-emblem__orbit--outer { width: 292px; height: 292px; }
	.about-emblem__orbit--inner { width: 228px; height: 228px; }
	.about-emblem__core { width: 170px; height: 170px; img { width: 50px; height: 50px; margin-bottom: 12px; } strong { font-size: 15px; } }
	.principle-grid { grid-template-columns: 1fr; }
	.about-links { grid-template-columns: 1fr; gap: 28px; }
}
@media (max-width: 720px) {
	.about-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
	.about-stats > div { border-bottom: 1px solid rgba(24, 28, 38, 0.07); &:nth-child(2) { border-right: 0; } &:nth-child(3), &:nth-child(4) { border-bottom: 0; } }
	.product-grid, .about-capabilities, .tech-stack { grid-template-columns: 1fr; }
	.about-emblem { width: 260px; height: 260px; }
	.about-emblem__orbit--outer { width: 252px; height: 252px; }
	.about-emblem__orbit--inner { width: 195px; height: 195px; }
	.about-emblem__core { width: 145px; height: 145px; }
	.about-emblem__label { display: none; }
	.platform-line { flex-direction: column; gap: 7px; }
	.about-links__grid a { grid-template-columns: 1fr 20px; strong { display: none; } }
}
</style>
