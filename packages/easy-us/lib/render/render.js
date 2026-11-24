"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.$menu = exports.$message = exports.$modal = exports.createRenderScript = void 0;
const script_1 = require("../interfaces/script");
const ui_1 = require("../utils/ui");
const dom_1 = require("../utils/dom");
const custom_window_1 = require("../interfaces/custom-window");
const start_1 = require("../utils/start");
const interfaces_1 = require("../interfaces");
const createRenderScript = (config) => new script_1.Script({
    name: (config === null || config === void 0 ? void 0 : config.name) || '窗口设置',
    matches: (config === null || config === void 0 ? void 0 : config.matches) || [['所有', /.*/]],
    namespace: 'render.panel',
    configs: {
        notes: {
            defaultValue: ui_1.$ui.notes([
                [
                    '如果需要隐藏整个窗口，可以点击下方隐藏按钮，',
                    '隐藏后可以快速三击屏幕中的任意地方',
                    '来重新在鼠标位置显示窗口。'
                ],
                '窗口连续点击显示的次数可以自定义，默认为三次',
                ['窗口快捷键列表：', 'ctrl + o : 隐藏/打开 面板']
            ]).outerHTML
        },
        x: { defaultValue: window.innerWidth * 0.1 },
        y: { defaultValue: window.innerWidth * 0.1 },
        /**
         * - minimize: 最小化
         * - hidden: 隐藏
         * - normal: 正常
         */
        visual: { defaultValue: 'normal' },
        // 首次关闭时警告
        firstCloseAlert: {
            defaultValue: true
        },
        fontsize: {
            label: '字体大小（像素）',
            attrs: { type: 'number', min: 12, max: 24, step: 1 },
            defaultValue: 14
        },
        switchPoint: {
            label: '窗口显示连点（次数）',
            attrs: {
                type: 'number',
                min: 3,
                max: 10,
                step: 1,
                title: '设置当连续点击屏幕 N 次时，可以进行面板的 隐藏/显示 切换，默认连续点击屏幕三下'
            },
            defaultValue: 3
        }
    },
    // 暴露给外部的方法
    methods() {
        return {
            /**
             * 将当前的脚本置顶
             * @param script 脚本
             */
            pin: (script) => start_1.$win === null || start_1.$win === void 0 ? void 0 : start_1.$win.pin(script),
            /**
             * 最小化窗口
             */
            minimize: () => start_1.$win === null || start_1.$win === void 0 ? void 0 : start_1.$win.minimize(),
            /**
             * 将窗口最小化，并移动至窗口边缘
             */
            setPosition: (x, y) => {
                if (start_1.$win) {
                    start_1.$win.config.store.setPosition(x, y);
                    start_1.$win.container.style.left = x + 'px';
                    start_1.$win.container.style.top = y + 'px';
                }
            },
            /**
             * 还原窗口
             */
            normal: () => {
                start_1.$win === null || start_1.$win === void 0 ? void 0 : start_1.$win.normal();
            }
        };
    },
    onrender({ panel }) {
        const closeBtn = (0, dom_1.h)('button', { className: 'base-style-button' }, '隐藏窗口');
        closeBtn.onclick = () => {
            if (this.cfg.firstCloseAlert) {
                exports.$modal.confirm({
                    content: ui_1.$ui.notes([
                        '隐藏脚本页面后，快速点击页面三下（可以在悬浮窗设置中调整次数）即可重新显示脚本。如果三下无效，可以尝试删除脚本重新安装。',
                        '请确认是否关闭。（此后不再显示此弹窗）'
                    ]),
                    onConfirm: () => {
                        start_1.$win === null || start_1.$win === void 0 ? void 0 : start_1.$win.hidden();
                        this.cfg.firstCloseAlert = false;
                    }
                });
            }
            else {
                start_1.$win === null || start_1.$win === void 0 ? void 0 : start_1.$win.hidden();
            }
        };
        panel.body.replaceChildren((0, dom_1.h)('hr'), closeBtn);
    }
});
exports.createRenderScript = createRenderScript;
function _modal(type, attrs, parent) {
    if (self === top) {
        return (0, custom_window_1.modal)(type, attrs, parent);
    }
    else {
        interfaces_1.cors.emit('modal', [type, attrs], (args) => {
            var _a, _b, _c;
            if (args) {
                (_a = attrs.onConfirm) === null || _a === void 0 ? void 0 : _a.call(attrs, args);
            }
            else {
                (_b = attrs.onCancel) === null || _b === void 0 ? void 0 : _b.call(attrs);
            }
            (_c = attrs.onClose) === null || _c === void 0 ? void 0 : _c.call(attrs, args);
        });
    }
}
/**
 * 打开弹窗，如果调用时不在顶级窗口，则会通过跨域通信发送消息
 */
exports.$modal = {
    confirm: (attrs, parent) => _modal('confirm', attrs, parent),
    alert: (attrs, parent) => _modal('alert', attrs, parent),
    prompt: (attrs, parent) => _modal('prompt', attrs, parent),
    simple: (attrs, parent) => _modal('simple', attrs, parent)
};
function _message(type, attrs) {
    if (self === top) {
        return start_1.$win === null || start_1.$win === void 0 ? void 0 : start_1.$win.message(type, attrs);
    }
    else {
        /**
         * 同源子 frame：直接调顶层的方法，即时显示
         *
         * 走 `cors.emit` 要经过 chrome.storage 往返 + 后台广播（至少 100ms），
         * 而学习脚本的提示几乎都紧跟着页面跳转 —— 消息还在路上页面就卸载了，
         * 表现就是「有时候通知不显示」。同源时没有这个窗口期。
         * 跨域会抛 SecurityError，落到下面的 cors 通道。
         */
        try {
            const topWin = window.top && window.top.__HH_UI_WIN__;
            if (topWin && typeof topWin.message === 'function') {
                return topWin.message(type, attrs);
            }
        } catch (e) {}
        if (typeof attrs === 'string') {
            attrs = { content: attrs };
        }
        // 跨域无法传递 HTMLElement，所以这里需要将 HTMLElement 转换为字符串
        else if (typeof attrs.content !== 'string') {
            attrs.content = attrs.content.innerHTML;
        }
        try {
            console.log('[鸿鹄] 跨帧消息发送:', type, typeof attrs.content === 'string' ? attrs.content : '');
        } catch (e) {}
        interfaces_1.cors.emit('message', [type, attrs]);
    }
}
/**
 * 消息提示，如果调用时不在顶级窗口，则会通过跨域通信发送消息
 */
exports.$message = {
    info: (attrs) => _message('info', attrs),
    success: (attrs) => _message('success', attrs),
    warn: (attrs) => _message('warn', attrs),
    error: (attrs) => _message('error', attrs)
};
/**
 * 注册菜单
 * @param label 菜单名称
 * @param config 菜单配置
 */
function $menu(label, config) {
    if (self !== top) {
        return;
    }
    return start_1.$win === null || start_1.$win === void 0 ? void 0 : start_1.$win.menu(label, config);
}
exports.$menu = $menu;
