"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.modal = exports.CustomWindow = void 0;
const _1 = require(".");
const elements_1 = require("../elements");
const utils_1 = require("../utils");
const start_1 = require("../utils/start");
const minimizeSvg = '<svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 0 24 24" width="24"><path d="M0 0h24v24H0V0z" fill="none"/><path d="M19 13H5v-2h14v2z"/></svg>';
const expandSvg = '<svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 0 24 24" width="24"><path d="M0 0h24v24H0V0z" fill="none"/><path d="M18 4H6c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 14H6V6h12v12z"/></svg>';
class CustomWindow {
    constructor(projects, inputStoreProvider, config) {
        /** 消息内容元素 */
        this.messageContainer = (0, utils_1.h)('div', { className: 'message-container' });
        /** 额外的菜单栏 */
        this.extraMenuBar = (0, utils_1.h)('div', { className: 'extra-menu-bar' });
        /** 默认值 */
        this.defaults = {
            /** 当前页面存在默认页面 */
            urls: (urls) => (urls && urls.length ? urls : [location.href]),
            /** 默认面板名 */
            panelName: (name) => name || this.config.render.defaultPanelName || ''
        };
        this.projects = projects;
        this.inputStoreProvider = inputStoreProvider;
        this.config = config;
        /** 兼容低版本浏览器 */
        handleLowLevelBrowser();
        /** 加载自定义元素 */
        utils_1.$.loadCustomElements(elements_1.definedCustomElements);
        this.wrapper = (0, utils_1.h)('div');
        // 挂载全局元素
        // 禁止修改下面赋值顺序，防止平台篡改 attachShadow 导致无法使用 Shadow DOM 模式的窗口
        // =====================================================
        utils_1.$elements.tooltipContainer = (0, utils_1.h)('div', { className: 'tooltip-container' });
        utils_1.$elements.wrapper = this.wrapper;
        this.root = this.wrapper.attachShadow({ mode: 'closed' });
        utils_1.$elements.root = this.root;
        // =====================================================
        /** 根元素 */
        this.container = (0, utils_1.h)('container-element');
        this.root.append(this.container);
        const styles = config.render.styles.map((s) => (0, utils_1.h)('style', s));
        // 创建样式元素
        this.container.append(...styles, this.messageContainer);
        /** 处理面板位置 */
        const handlePosition = () => {
            const pos = config.store.getPosition();
            if (pos.x > document.documentElement.clientWidth || pos.x < 0) {
                config.store.setPosition(10, 10);
            }
            if (pos.y > document.documentElement.clientHeight || pos.y < 0) {
                config.store.setPosition(10, 10);
            }
            this.container.style.left = pos.x + 'px';
            this.container.style.top = pos.y + 'px';
            const positionHandler = () => {
                config.store.setPosition(this.container.offsetLeft, this.container.offsetTop);
            };
            (0, utils_1.enableElementDraggable)(this.container.header, this.container, positionHandler);
            (0, utils_1.enableElementTouchDraggable)(this.container.header, this.container, positionHandler);
        };
        /** 处理面板可视状态 */
        const handleVisible = () => {
            window.addEventListener('click', (e) => {
                // 三击以上重置位置
                if (e.detail === Math.max(config.render.switchPoint, 3)) {
                    this.container.style.top = e.y + 'px';
                    this.container.style.left = e.x + 'px';
                    config.store.setPosition(e.x, e.y);
                    this.setVisual('normal');
                }
            });
        };
        /** 初始化跨域模态框系统 */
        const initCorsModalSystem = () => {
            // 添加 modals 监听队列
            _1.cors.on('modal', (args) => __awaiter(this, void 0, void 0, function* () {
                const [type, _attrs] = args || [];
                return new Promise((resolve, reject) => {
                    const attrs = _attrs;
                    attrs.onCancel = () => resolve('');
                    attrs.onConfirm = resolve;
                    attrs.onClose = resolve;
                    modal(type, attrs);
                });
            }));
        };
        /** 初始化跨域消息框系统 */
        const initCorsMessageSystem = () => {
            // 添加 modals 监听队列
            _1.cors.on('message', (args) => __awaiter(this, void 0, void 0, function* () {
                const [type, attrs] = args || [];
                console.log('message', type, attrs);
                this.message(type, attrs);
            }));
        };
        // 监听快捷键
        window.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === config.render.switchKey) {
                e.stopPropagation();
                e.preventDefault();
                this.setVisual(config.store.getVisual() === 'hidden' ? 'normal' : 'hidden');
            }
        }, { capture: true });
        // 首先处理窗口状态，防止下方的IO速度过慢可能导致窗口闪烁
        handleVisible();
        // 初始化面板可视状态
        this.setVisual(config.store.getVisual());
        (() => __awaiter(this, void 0, void 0, function* () {
            const urls = yield config.store.getRenderURLs();
            const currentPanelName = yield config.store.getCurrentPanelName();
            yield this.rerender(this.defaults.urls(urls), this.defaults.panelName(currentPanelName));
        }))();
        // 初始化跨域模态框系统
        initCorsModalSystem();
        // 初始化跨域消息框系统
        initCorsMessageSystem();
        // 处理面板位置
        handlePosition();
        // 初始化字体大小
        this.setFontSize(config.render.fontsize);
    }
    rerender(urls, currentPanelName) {
        return __awaiter(this, void 0, void 0, function* () {
            this.initHeader(urls, currentPanelName);
            yield this.renderBody(currentPanelName);
        });
    }
    initHeader(urls, currentPanelName) {
        /** 版本  */
        const profile = utils_1.$ui.tooltip((0, utils_1.h)('div', { className: 'profile', title: '菜单栏（可拖动区域）' }, this.config.render.title || '无标题'));
        const scriptDropdowns = [];
        for (const project of this.projects) {
            const dropdown = (0, utils_1.h)('dropdown-element');
            let selected = false;
            const options = [];
            // 如果整个工程下面有一个需要显示的脚本，那此工程就添加到头部
            const scripts = utils_1.$.getMatchedScripts([project], urls).filter((s) => !s.hideInPanel);
            if (scripts.length) {
                for (const key in project.scripts) {
                    if (Object.prototype.hasOwnProperty.call(project.scripts, key)) {
                        const script = project.scripts[key];
                        // 只显示需要显示的面板
                        if (!script.hideInPanel) {
                            const optionSelected = isCurrentPanel(project.name, script, currentPanelName);
                            const option = (0, utils_1.h)('div', { className: 'dropdown-option' }, script.name);
                            if (optionSelected) {
                                option.classList.add('active');
                            }
                            if (selected !== true && optionSelected) {
                                selected = true;
                            }
                            option.onclick = () => __awaiter(this, void 0, void 0, function* () {
                                yield this.config.store.setCurrentPanelName(project.name + '-' + script.name);
                                // $store.setTab($const.TAB_CURRENT_PANEL_NAME, project.name + '-' + script.name);
                            });
                            options.push(option);
                        }
                    }
                }
                if (selected) {
                    dropdown.classList.add('active');
                }
                dropdown.triggerElement = (0, utils_1.h)('div', { className: 'dropdown-trigger-element' }, project.name);
                dropdown.triggerElement.style.padding = '0px 8px';
                dropdown.content.append(...options);
                scriptDropdowns.push(dropdown);
            }
        }
        /** 窗口是否最小化 */
        const isMinimize = () => this.config.store.getVisual() === 'minimize';
        /** 窗口状态切换按钮 */
        const visualSwitcher = utils_1.$ui.tooltip((0, utils_1.h)('div', {
            className: 'switch ',
            title: isMinimize() ? '点击展开窗口' : '点击最小化窗口',
            innerHTML: isMinimize() ? expandSvg : minimizeSvg,
            onclick: () => {
                this.setVisual(isMinimize() ? 'normal' : 'minimize');
                visualSwitcher.title = isMinimize() ? '点击展开窗口' : '点击最小化窗口';
                visualSwitcher.innerHTML = isMinimize() ? expandSvg : minimizeSvg;
            }
        }));
        this.container.header.visualSwitcher = visualSwitcher;
        this.container.header.replaceChildren();
        this.container.header.append((0, utils_1.h)('div', { style: { width: '100%' } }, [
            (0, utils_1.h)('div', { style: { display: 'flex', width: '100%' } }, [
                profile,
                ...scriptDropdowns,
                this.container.header.visualSwitcher || ''
            ]),
            (0, utils_1.h)('div', { style: { display: 'flex', width: '100%' } }, [this.extraMenuBar])
        ]));
    }
    renderBody(currentPanelName) {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            for (const project of this.projects) {
                for (const key in project.scripts) {
                    if (Object.prototype.hasOwnProperty.call(project.scripts, key)) {
                        const script = project.scripts[key];
                        if (isCurrentPanel(project.name, script, currentPanelName)) {
                            // 生成脚本面板
                            const panel = utils_1.$ui.scriptPanel(script, this.inputStoreProvider);
                            script.projectName = project.name;
                            script.panel = panel;
                            script.header = this.container.header;
                            utils_1.$elements.currentScriptPanel = panel;
                            this.container.body.replaceChildren(panel);
                            // 执行重新渲染钩子
                            (_a = script.onrender) === null || _a === void 0 ? void 0 : _a.call(script, { panel: panel, header: this.container.header });
                            script.emit('render', { panel: panel, header: this.container.header });
                        }
                    }
                }
            }
        });
    }
    setFontSize(fontsize) {
        this.container.style.font = `${fontsize}px  Menlo, Monaco, Consolas, 'Courier New', monospace`;
    }
    setVisual(value) {
        this.container.className = '';
        // 最小化
        if (value === 'minimize') {
            this.container.classList.add('minimize');
        }
        // 关闭
        else if (value === 'hidden') {
            this.container.classList.add('hidden');
        }
        // 展开
        else {
            this.container.classList.add('normal');
        }
        this.config.store.setVisual(value);
    }
    changeRenderURLs(urls) {
        return __awaiter(this, void 0, void 0, function* () {
            const currentPanelName = yield this.config.store.getCurrentPanelName();
            yield this.rerender(this.defaults.urls(urls), this.defaults.panelName(currentPanelName));
        });
    }
    changePanel(currentPanelName) {
        return __awaiter(this, void 0, void 0, function* () {
            const urls = (yield this.config.store.getRenderURLs()) || [location.href];
            yield this.rerender(this.defaults.urls(urls), this.defaults.panelName(currentPanelName));
        });
    }
    /**
     * 将当前的脚本置顶
     * @param script 脚本
     */
    pin(script) {
        return __awaiter(this, void 0, void 0, function* () {
            if (script.projectName) {
                yield this.config.store.setCurrentPanelName(`${script.projectName}-${script.name}`);
            }
            else if (script.namespace) {
                yield this.config.store.setCurrentPanelName(script.namespace);
            }
            else {
                console.warn('[ERROR]', `${script.name} 无法置顶， projectName 与 namespace 都为 undefined`);
            }
        });
    }
    /**
     * 最小化窗口
     */
    minimize() {
        this.setVisual('minimize');
    }
    normal() {
        this.setVisual('normal');
    }
    hidden() {
        this.setVisual('hidden');
    }
    /**
     * 消息推送
     */
    message(type, attrs) {
        if (typeof attrs === 'string') {
            attrs = { content: attrs };
        }
        const message = (0, utils_1.h)('message-element', Object.assign({ type }, attrs));
        this.messageContainer.append(message);
        return message;
    }
    /**
     * 注册额外菜单栏
     * @param label	名称
     * @param config 设置
     */
    menu(label, config) {
        return __awaiter(this, void 0, void 0, function* () {
            this.extraMenuBar.style.display = 'flex';
            const btn = (0, utils_1.h)('button', label);
            btn.addEventListener('click', () => {
                if (config.scriptPanelLink) {
                    // 置顶脚本页面
                    this.pin(config.scriptPanelLink)
                        .then(() => {
                        // 最大化窗口
                        this.normal();
                    })
                        .catch(console.error);
                }
            });
            if (config.scriptPanelLink) {
                const full_name = (config.scriptPanelLink.projectName ? config.scriptPanelLink.projectName + ' -> ' : '') +
                    config.scriptPanelLink.name;
                btn.title = '快捷跳转：' + full_name;
                btn.setAttribute('data-name', (config.scriptPanelLink.projectName + '-' + config.scriptPanelLink.name).replace(/\s/g, '_'));
                btn.classList.add('script-panel-link');
            }
            this.extraMenuBar.append(utils_1.$ui.tooltip(btn));
            const name = yield utils_1.$store.getTab(utils_1.$const.TAB_CURRENT_PANEL_NAME);
            if (config.scriptPanelLink) {
                if (isCurrentPanel(config.scriptPanelLink.projectName, config.scriptPanelLink, name)) {
                    // 排除其他
                    this.extraMenuBar.querySelectorAll('.script-panel-link').forEach((el) => el.classList.remove('active'));
                    btn.classList.add('active');
                }
            }
            return btn;
        });
    }
    /**
     * 随机挂载到指定的父元素
     * @param parent 挂载的父元素
     */
    mount(parent) {
        // 随机位置插入操作面板到页面
        parent.children[utils_1.$.random(0, parent.children.length - 1)].after(this.wrapper);
    }
}
exports.CustomWindow = CustomWindow;
/** 判断这个脚本是否为当前显示页面 */
function isCurrentPanel(projectName, script, currentPanelName) {
    return projectName + '-' + script.name === currentPanelName || script.namespace === currentPanelName;
}
/** 兼容低版本浏览器 */
function handleLowLevelBrowser() {
    if (typeof Element.prototype.replaceChildren === 'undefined') {
        Element.prototype.replaceChildren = function (...nodes) {
            this.innerHTML = '';
            for (const node of nodes) {
                this.append(node);
            }
        };
    }
}
/**
 * 创建一个模态框代替原生的 alert, confirm, prompt
 * 如果已经调用了 start 函数那么则会挂载到自定义窗口中，否则可以挂载到全局元素中（可以修改 $elements.root 实现自定义挂载位置），或者 document.body 上
 */
function modal(type, attrs, parent = (start_1.$win === null || start_1.$win === void 0 ? void 0 : start_1.$win.container) || utils_1.$elements.root || document.body) {
    const { maskCloseable = true, onConfirm, onCancel, onClose, notification: notify, notificationOptions, duration } = attrs, _attrs = __rest(attrs, ["maskCloseable", "onConfirm", "onCancel", "onClose", "notification", "notificationOptions", "duration"]);
    if (notify) {
        utils_1.$gm.notification(typeof _attrs.content === 'string' ? _attrs.content : _attrs.content.textContent || '', notificationOptions);
    }
    const wrapper = (0, utils_1.h)('div', { className: 'modal-wrapper' }, (wrapper) => {
        const modal = (0, utils_1.h)('modal-element', Object.assign({ onConfirm(val) {
                return __awaiter(this, void 0, void 0, function* () {
                    const isClose = yield (onConfirm === null || onConfirm === void 0 ? void 0 : onConfirm.apply(modal, [val]));
                    if (isClose !== false) {
                        wrapper.remove();
                    }
                    return isClose;
                });
            },
            onCancel() {
                onCancel === null || onCancel === void 0 ? void 0 : onCancel.apply(modal);
                wrapper.remove();
            },
            onClose(val) {
                onClose === null || onClose === void 0 ? void 0 : onClose.apply(modal, [val]);
                wrapper.remove();
            },
            type }, _attrs));
        wrapper.append(modal);
        modal.addEventListener('click', (e) => {
            e.stopPropagation();
        });
        if (maskCloseable) {
            /** 点击遮罩层关闭模态框 */
            wrapper.addEventListener('click', () => {
                onClose === null || onClose === void 0 ? void 0 : onClose.apply(modal);
                wrapper.remove();
            });
        }
    });
    if (duration) {
        setTimeout(() => {
            wrapper.remove();
        }, duration * 1000);
    }
    parent.append(wrapper);
    return wrapper;
}
exports.modal = modal;
