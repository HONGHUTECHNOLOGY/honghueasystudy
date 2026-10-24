<template>
	<div class="doc-page guide-page">
		<div class="doc-ambient" aria-hidden="true">
			<div class="doc-ambient__grid"></div>
			<div class="doc-ambient__orb"></div>
		</div>

		<DocHeader active="guide" />

		<main class="doc-shell">
			<section class="doc-hero">
				<div>
					<span class="doc-kicker">GUIDE / DESKTOP & EXTENSION</span>
					<h1 class="doc-title">从打开课程，<br /><span>到专注学习。</span></h1>
					<p class="doc-lead">
						这份指南基于鸿鹄易学当前公开能力整理，覆盖桌面端浏览器、浏览器扩展、课程学习、自动答题配置与自动程序。第一次使用时按顺序阅读即可，不需要额外安装其他同类脚本。
					</p>
					<div class="doc-badges">
						<span><i></i>桌面端浏览器</span>
						<span><i></i>浏览器扩展</span>
						<span><i></i>AI 与题库答题</span>
					</div>
				</div>

				<aside class="doc-index" aria-label="本页目录">
					<div class="doc-index__head"><strong>本页内容</strong><span>约 6 分钟</span></div>
					<ol>
						<li><a href="#choose">选择使用方式</a></li>
						<li><a href="#start">四步开始使用</a></li>
						<li><a href="#learning">课程学习</a></li>
						<li><a href="#answering">答题配置</a></li>
						<li><a href="#desktop">多浏览器与自动程序</a></li>
						<li><a href="#faq">常见问题</a></li>
					</ol>
				</aside>
			</section>

			<aside class="compat-alert" role="note" aria-label="平台兼容提醒">
				<span class="compat-alert__icon">
					<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
						<path d="M12 3 4 7v5c0 4.6 3.2 7.8 8 9 4.8-1.2 8-4.4 8-9V7l-8-4Z" />
						<path d="M12 8v5M12 16.5v.5" />
					</svg>
				</span>
				<div class="compat-alert__copy">
					<span>平台兼容提醒</span>
					<strong>部分平台受反检测限制，完整功能需使用桌面端。</strong>
					<p>例如智慧树等平台会限制浏览器扩展环境中的自动化行为。要运行全部功能，请在鸿鹄易学桌面端启动的浏览器中学习；普通浏览器扩展可能只能使用部分能力。</p>
				</div>
				<a href="#start">查看桌面端流程 <span>↓</span></a>
			</aside>

			<section id="choose" class="doc-section">
				<aside class="doc-section__aside">
					<span class="doc-section__number">01</span>
					<p class="doc-section__name">选择使用方式</p>
					<small>DESKTOP OR EXTENSION</small>
				</aside>
				<div class="doc-section__body">
					<h2>先选择适合你的入口。</h2>
					<p class="section-lead">桌面端和浏览器扩展共用鸿鹄易学的课程学习能力，区别主要在浏览器环境、自动登录与多账号管理。</p>

					<div class="mode-grid">
						<article class="mode-card mode-card__recommended">
							<div class="mode-card__top">
								<span class="mode-icon">
									<svg viewBox="0 0 24 24" fill="none"><rect x="3" y="4" width="18" height="16" rx="3" /><path d="M3 9h18M8 4v5" /></svg>
								</span>
								<span class="mode-card__tag">RECOMMENDED</span>
							</div>
							<h3>桌面端浏览器</h3>
							<p>适合多课程、多账号或需要自动登录的场景。每个浏览器使用独立环境，并在启动时加载内置扩展。</p>
							<div class="mode-list"><span>环境隔离</span><span>自动程序</span><span>内置扩展</span></div>
						</article>

						<article class="mode-card">
							<div class="mode-card__top">
								<span class="mode-icon">
									<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c3 3.4 3 14.6 0 18M12 3c-3 3.4-3 14.6 0 18" /></svg>
								</span>
								<span class="mode-card__tag">EXTENSION</span>
							</div>
							<h3>浏览器扩展</h3>
							<p>适合已经在使用 Chrome 或 Edge 的用户。安装扩展后直接打开学习平台，不改变原有浏览器习惯。</p>
							<div class="mode-list"><span>轻量</span><span>Edge 商店</span><span>手动加载</span></div>
						</article>
					</div>

					<div class="capability-note">
						<span>提示</span>
						<p>下文以桌面端为主线；扩展端从「进入课程页面」开始的操作与悬浮面板基本一致。</p>
					</div>
				</div>
			</section>

			<section id="start" class="doc-section">
				<aside class="doc-section__aside">
					<span class="doc-section__number">02</span>
					<p class="doc-section__name">四步开始使用</p>
					<small>FROM ZERO TO COURSE</small>
				</aside>
				<div class="doc-section__body">
					<h2>第一次使用，按这四步走。</h2>
					<p class="section-lead">鸿鹄易学的入口是浏览器环境。准备完成后，日常只需要进入课程页面并打开悬浮面板。</p>

					<ol class="step-list">
						<li>
							<span class="step-number">01</span>
							<div class="step-copy">
								<h3>创建浏览器</h3>
								<p>在桌面端首页点击「新建浏览器」。如果开启了自动初始化，可以同时选择需要的自动程序；每个浏览器拥有独立的缓存、登录状态与运行环境。</p>
							</div>
						</li>
						<li>
							<span class="step-number">02</span>
							<div class="step-copy">
								<h3>登录学习平台</h3>
								<p>启动浏览器后，从学习平台入口进入对应网站并完成登录。也可以在自动程序中预先填写账号信息，让登录流程在浏览器启动时自动执行。</p>
							</div>
						</li>
						<li>
							<span class="step-number">03</span>
							<div class="step-copy">
								<h3>进入具体课程页面</h3>
								<p>打开课程目录中的视频、阅读、文档、章节任务或作业页面。脚本会在匹配到支持的页面后运行，并在页面中显示鸿鹄易学悬浮面板。</p>
							</div>
						</li>
						<li>
							<span class="step-number">04</span>
							<div class="step-copy">
								<h3>在悬浮面板中选择功能</h3>
								<p>课程学习、答题设置、搜索结果与运行状态都集中在悬浮面板中。不同平台显示的项目会略有差异，以页面实际面板为准。</p>
							</div>
						</li>
					</ol>

					<div class="doc-note">
						<h3>如果是浏览器扩展</h3>
						<ul>
							<li>从 Edge 加载项商店安装，或下载 Release 中的扩展包并在扩展管理页手动加载解压目录。</li>
							<li>安装后直接访问已支持的网课平台，不需要额外打开桌面端客户端。</li>
							<li>建议只保留一个鸿鹄易学实例，避免与其他同类脚本同时运行造成点击冲突。</li>
						</ul>
					</div>
				</div>
			</section>

			<section id="learning" class="doc-section">
				<aside class="doc-section__aside">
					<span class="doc-section__number">03</span>
					<p class="doc-section__name">课程学习</p>
					<small>COURSE & TASKS</small>
				</aside>
				<div class="doc-section__body">
					<h2>把重复操作交给脚本。</h2>
					<p class="section-lead">课程学习能力会随平台页面类型变化。脚本根据当前页面识别视频、阅读、文档和章节任务，并按照面板设置执行。</p>

					<div class="capability-grid">
						<article class="capability-item">
							<div class="capability-item__head">
								<svg viewBox="0 0 24 24" fill="none"><rect x="3" y="5" width="18" height="14" rx="3" /><path d="m10 9 5 3-5 3z" /></svg>
								<h3>视频课程</h3>
							</div>
							<p>处理视频播放与课程进度，支持章节切换；倍速、音量等选项以当前平台与面板提供的能力为准。</p>
						</article>
						<article class="capability-item">
							<div class="capability-item__head">
								<svg viewBox="0 0 24 24" fill="none"><path d="M5 4h11l3 3v13H5z" /><path d="M8 9h8M8 13h8M8 17h5" /></svg>
								<h3>阅读与文档</h3>
							</div>
							<p>针对阅读、文档、PPT 等课程任务点执行页面要求的操作，完成后继续后续章节。</p>
						</article>
						<article class="capability-item">
							<div class="capability-item__head">
								<svg viewBox="0 0 24 24" fill="none"><path d="M4 7h16M4 12h16M4 17h10" /><circle cx="19" cy="17" r="2" /></svg>
								<h3>章节与任务切换</h3>
							</div>
							<p>识别课程目录中的任务点与完成状态，按顺序处理尚未完成的课程内容。</p>
						</article>
						<article class="capability-item">
							<div class="capability-item__head">
								<svg viewBox="0 0 24 24" fill="none"><path d="M4 19V9M10 19V5M16 19v-7M22 19H2" /></svg>
								<h3>运行状态</h3>
							</div>
							<p>悬浮面板会展示当前任务与答题进度。遇到平台改版时，未适配的页面不会强行执行。</p>
						</article>
					</div>

					<div class="doc-note">
						<h3>运行期间请保持页面处于正常可见状态</h3>
						<ul>
							<li>不要同时运行其他同类网课脚本，也不要重复开启相同脚本实例。</li>
							<li>尽量避免最小化浏览器或频繁切换窗口，否则部分平台会暂停计时或阻止自动执行。</li>
							<li>课程能力与平台页面结构相关，具体支持项以对应平台的面板提示为准。</li>
						</ul>
					</div>
				</div>
			</section>

			<section id="answering" class="doc-section">
				<aside class="doc-section__aside">
					<span class="doc-section__number">04</span>
					<p class="doc-section__name">答题配置</p>
					<small>QUESTION BANK & AI</small>
				</aside>
				<div class="doc-section__body">
					<h2>自动答题需要先配置答案来源。</h2>
					<p class="section-lead">鸿鹄易学支持题库与 AI 两种答题来源。没有完成配置时，脚本仍可用于课程学习，但不会凭空生成作业或考试答案。</p>

					<div class="config-steps">
						<article class="config-step">
							<span>STEP 01</span>
							<strong>打开全局设置</strong>
							<p>在悬浮面板中进入「通用 → 全局设置」，找到「题库配置」。</p>
						</article>
						<article class="config-step">
							<span>STEP 02</span>
							<strong>填写答案来源</strong>
							<p>选择默认题库、TikuAdapter，或启用 AI 答题。</p>
						</article>
						<article class="config-step">
							<span>STEP 03</span>
							<strong>回到题目页面</strong>
							<p>进入章节测试、作业或考试页面，等待题目识别与答案匹配。</p>
						</article>
					</div>

					<div class="answer-modes">
						<div class="answer-mode">
							<span class="answer-mode__badge">题库模式</span>
							<h3>TikuAdapter 与自定义题库</h3>
							<p>题库配置支持导入多个答案源，也可衔接 TikuAdapter。答案会先查缓存，再按启用的题库依次搜索；面板可查看题目搜索结果。建议启用的题库数量不要过多，以免拖慢答题速度。</p>
						</div>
						<div class="answer-mode">
							<span class="answer-mode__badge answer-mode__badge--ai">AI 模式</span>
							<h3>兼容 OpenAI 接口的大模型</h3>
							<p>在「AI 答题配置」中填写 API 地址、API Key 与模型名称，然后点击「启用 AI 答题」。启用后会替代题库作为答案来源，适合题库未收录的题目。</p>
						</div>
					</div>

					<div class="config-panel">
						<div class="config-panel__head">
							<span class="config-panel__dots"><i></i><i></i><i></i></span>
							AI 答题配置 · 字段示例
						</div>
						<pre><span class="token-key">API 地址</span>   <span class="token-value">https://api.deepseek.com</span>
<span class="token-key">API Key</span>   <span class="token-value">sk-••••••••••••</span>
<span class="token-key">模型</span>      <span class="token-value">deepseek-chat</span>

<span class="token-comment"># 可填写完整接口，也可只填写域名</span>
<span class="token-comment"># 只填域名时会自动补全 /v1/chat/completions</span></pre>
					</div>

					<div class="doc-note">
						<h3>答题前请确认</h3>
						<ul>
							<li>单选、多选、判断、填空的识别能力会因平台页面结构不同而变化，作答结果可以在「搜索结果」面板中查看。</li>
							<li>AI 答题需要兼容 OpenAI 格式的接口。API Key 由使用者自行申请和保管，相关请求会发送到所填写的服务地址。</li>
							<li>自动答题是辅助工具，不保证每道题都有答案。重要作业与考试请自行核对，并遵守学校与平台规定。</li>
						</ul>
					</div>
				</div>
			</section>

			<section id="desktop" class="doc-section">
				<aside class="doc-section__aside">
					<span class="doc-section__number">05</span>
					<p class="doc-section__name">多浏览器与自动程序</p>
					<small>DESKTOP WORKFLOW</small>
				</aside>
				<div class="doc-section__body">
					<h2>把多账号与登录流程管理好。</h2>
					<p class="section-lead">桌面端为每个浏览器维护独立用户目录，缓存、Cookie 与登录状态互不干扰。启动浏览器后，配置好的自动程序会按顺序执行。</p>

					<div class="capability-grid">
						<article class="capability-item">
							<div class="capability-item__head">
								<svg viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="8" height="8" rx="2" /><rect x="13" y="3" width="8" height="8" rx="2" /><rect x="3" y="13" width="8" height="8" rx="2" /><rect x="13" y="13" width="8" height="8" rx="2" /></svg>
								<h3>独立浏览器环境</h3>
							</div>
							<p>不同课程或账号可分别建立浏览器，不用反复清理 Cookie，也不会互相覆盖登录状态。</p>
						</article>
						<article class="capability-item">
							<div class="capability-item__head">
								<svg viewBox="0 0 24 24" fill="none"><path d="M6 4h12v16H6z" /><path d="M9 8h6M9 12h6M9 16h3" /></svg>
								<h3>自动程序</h3>
							</div>
							<p>为浏览器添加登录、打开页面等自动化步骤，启动浏览器时自动执行，减少重复输入。</p>
						</article>
					</div>

					<h3 class="subheading">当前内置的登录与页面脚本</h3>
					<div class="login-script-list">
						<div class="login-script"><i></i><span>超星 · 学校机构登录</span><span>账号密码</span></div>
						<div class="login-script"><i></i><span>超星 · 手机密码登录</span><span>手机号</span></div>
						<div class="login-script"><i></i><span>智慧树 · 学校登录</span><span>学校 / 学号</span></div>
						<div class="login-script"><i></i><span>智慧树 · 手机密码登录</span><span>手机号</span></div>
						<div class="login-script"><i></i><span>智慧职教 · 账号密码登录</span><span>账号</span></div>
						<div class="login-script"><i></i><span>职教云 · 账号密码登录</span><span>账号</span></div>
						<div class="login-script"><i></i><span>通用 · 新建页面</span><span>指定网址</span></div>
					</div>
					<p class="small-note">填写账号信息后请先在对应浏览器中验证一次登录结果。部分平台的验证码识别需要在桌面端配置 OCR 服务后才能使用。</p>
				</div>
			</section>

			<section id="faq" class="doc-section">
				<aside class="doc-section__aside">
					<span class="doc-section__number">06</span>
					<p class="doc-section__name">常见问题</p>
					<small>TROUBLESHOOTING</small>
				</aside>
				<div class="doc-section__body">
					<h2>遇到问题时，先看这里。</h2>
					<p class="section-lead">大多数问题与页面未加载完成、答案源未配置或脚本冲突有关。</p>

					<div class="doc-faq">
						<details open>
							<summary>为什么智慧树等平台需要使用桌面端？</summary>
							<p>部分平台存在反检测限制，会识别或限制普通浏览器扩展环境中的自动化操作。鸿鹄易学桌面端通过独立浏览器环境运行内置扩展，才能在这些平台上启用完整功能。若使用普通浏览器中的扩展版本，部分能力可能不可用。</p>
						</details>
						<details>
							<summary>进入课程后没有看到悬浮面板怎么办？</summary>
							<p>先确认当前页面是受支持的课程、作业或任务页面，并等待页面加载完成；如果仍未出现，刷新一次页面。桌面端请确认浏览器是通过软件启动的，扩展端请确认鸿鹄易学扩展已启用。</p>
						</details>
						<details>
							<summary>为什么自动答题没有结果？</summary>
							<p>先检查「通用 → 全局设置 → 题库配置」是否已填写并启用有效答案源。若使用 AI 答题，请确认 API 地址、Key 和模型可用，并在配置面板测试连接。题库未收录、网络异常或接口额度不足都会导致没有答案。</p>
						</details>
						<details>
							<summary>可以同时开多个浏览器学习吗？</summary>
							<p>桌面端支持建立多个独立浏览器，但同一账号、同一课程不建议重复开启。多个实例同时操作可能触发平台的风控或进度冲突，请根据实际课程安排使用。</p>
						</details>
						<details>
							<summary>自动程序登录失败怎么处理？</summary>
							<p>检查学校名称、学号或手机号、密码是否与平台当前登录方式一致。平台登录页改版、学校选择项变化或验证码未配置 OCR 时，自动程序可能无法完成登录，可以在浏览器中手动登录后继续使用课程脚本。</p>
						</details>
						<details>
							<summary>题库和 AI 答题应该选哪个？</summary>
							<p>已有稳定题库时优先使用题库，命中后速度快且结果可追溯；题库没有收录时，再启用 AI 答题处理未匹配题目。两者是答案来源的选择关系，不需要同时启用。</p>
						</details>
						<details>
							<summary>使用鸿鹄易学会影响课程成绩吗？</summary>
							<p>脚本只负责执行页面操作与答案查询，不改变课程内容，也不保证学习成绩。请把自动学习当作减少重复操作的工具，并遵守学校、教师与平台的使用规则。</p>
						</details>
					</div>
				</div>
			</section>

			<section class="doc-cta">
				<div>
					<strong>准备好开始了吗？</strong>
					<p>选择一个学习平台，进入你的课程空间。</p>
				</div>
				<a class="doc-cta__link" href="#/bookmarks">
					前往学习平台
					<svg viewBox="0 0 24 24" fill="none"><path d="M5 12h14M14 7l5 5-5 5" /></svg>
				</a>
			</section>
		</main>

		<footer class="doc-footer">
			<div class="doc-shell doc-footer__inner">
				<span>鸿鹄易学 · 使用指南</span>
				<nav aria-label="页脚导航">
					<a href="#/bookmarks">学习平台</a>
					<a href="#/about">关于鸿鹄易学</a>
					<a href="https://easystudy.honghutech.eu.org" target="_blank" rel="noopener noreferrer">官方网站</a>
				</nav>
			</div>
		</footer>
	</div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import DocHeader from '../components/DocHeader.vue';

onMounted(() => {
	document.title = '使用指南 · 鸿鹄易学';
	window.scrollTo({ top: 0 });
});
</script>

<style lang="less">
@import './doc-page.less';

.answer-modes { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 11px; margin-top: 16px; }
.answer-mode { padding: 20px; border: 1px solid rgba(25, 29, 39, 0.07); border-radius: 13px; background: rgba(255, 255, 255, 0.6); }
.answer-mode__badge { display: inline-flex; padding: 4px 7px; border-radius: 5px; background: rgba(37, 174, 132, 0.08); color: #37836a; font-size: 7px; font-weight: 650; letter-spacing: 0.08em; }
.answer-mode__badge--ai { background: rgba(99, 91, 255, 0.08); color: #635bff; }
.answer-mode h3 { margin: 12px 0 8px; }
.answer-mode p { margin: 0; font-size: 10px; line-height: 1.8; }
.token-comment { color: rgba(201, 204, 216, 0.34); }
.subheading { margin: 28px 0 0; font-size: 12px; }
.small-note { margin-top: 13px; color: #969da7; font-size: 9px; line-height: 1.75; }

@media (max-width: 720px) {
	.answer-modes { grid-template-columns: 1fr; }
}
</style>
