/// <reference types="tampermonkey" />
import { start } from './utils/start';
import * as Utils from './utils';
import * as Elements from './elements';
import * as Interfaces from './interfaces';
declare const EUS: {
    CommonEventEmitter: typeof Interfaces.CommonEventEmitter;
    CorsEventEmitter: typeof Interfaces.CorsEventEmitter;
    cors: Interfaces.CorsEventEmitter;
    Project: typeof Interfaces.Project;
    BaseScript: typeof Interfaces.BaseScript;
    Script: typeof Interfaces.Script;
    LocalStoreChangeEvent: typeof Interfaces.LocalStoreChangeEvent;
    MemoryStoreProvider: typeof Utils.MemoryStoreProvider;
    GMStoreProvider: typeof Utils.GMStoreProvider;
    ConfigElement: typeof Elements.ConfigElement;
    ContainerElement: typeof Elements.ContainerElement;
    HeaderElement: typeof Elements.HeaderElement;
    MessageElement: typeof Elements.MessageElement;
    ModalElement: typeof Elements.ModalElement;
    ScriptPanelElement: typeof Elements.ScriptPanelElement;
    definedCustomElements: (typeof Elements.ContainerElement | typeof import("./elements/dropdown").DropdownElement | typeof Elements.MessageElement | typeof Elements.ModalElement | typeof Elements.ScriptPanelElement | typeof Elements.HeaderElement | typeof Elements.ConfigElement)[];
    $menu(label: string, config: {
        scriptPanelLink?: import("./interfaces/custom-window").ScriptIdentify | undefined;
    }): Promise<HTMLButtonElement> | undefined;
    createRenderScript: (config?: {
        name?: string | undefined;
        matches?: (string | RegExp)[] | [string, string | RegExp][] | undefined;
    } | undefined) => Interfaces.Script<{
        notes: {
            defaultValue: string;
        };
        x: {
            defaultValue: number;
        };
        y: {
            defaultValue: number;
        };
        visual: {
            defaultValue: import("./interfaces/custom-window").VisualType;
        };
        firstCloseAlert: {
            defaultValue: boolean;
        };
        fontsize: {
            label: string;
            attrs: {
                type: string;
                min: number;
                max: number;
                step: number;
            };
            defaultValue: number;
        };
        switchPoint: {
            label: string;
            attrs: {
                type: string;
                min: number;
                max: number;
                step: number;
                title: string;
            };
            defaultValue: number;
        };
    }, {
        pin: (script: any) => Promise<void> | undefined;
        minimize: () => void | undefined;
        setPosition: (x: number, y: number) => void;
        normal: () => void;
    }>;
    $modal: {
        confirm: (attrs: import("./interfaces/custom-window").ModalAttrs, parent?: HTMLElement | ShadowRoot | Document | undefined) => HTMLDivElement | undefined;
        alert: (attrs: import("./interfaces/custom-window").ModalAttrs, parent?: HTMLElement | ShadowRoot | Document | undefined) => HTMLDivElement | undefined;
        prompt: (attrs: import("./interfaces/custom-window").ModalAttrs, parent?: HTMLElement | ShadowRoot | Document | undefined) => HTMLDivElement | undefined;
        simple: (attrs: import("./interfaces/custom-window").ModalAttrs, parent?: HTMLElement | ShadowRoot | Document | undefined) => HTMLDivElement | undefined;
    };
    $message: {
        info: (attrs: import("./interfaces/custom-window").MessageAttrs) => Elements.MessageElement | undefined;
        success: (attrs: import("./interfaces/custom-window").MessageAttrs) => Elements.MessageElement | undefined;
        warn: (attrs: import("./interfaces/custom-window").MessageAttrs) => Elements.MessageElement | undefined;
        error: (attrs: import("./interfaces/custom-window").MessageAttrs) => Elements.MessageElement | undefined;
    };
    resolveCustomElementName<T extends HTMLElement = HTMLElement>(el: new () => T, target: string): string;
    $: {
        createConfigProxy(script: Interfaces.Script<Interfaces.ScriptConfigs, Interfaces.ScriptMethods>): {
            [x: string]: any;
            readonly notes?: unknown;
        } & {
            notes?: string | undefined;
        };
        getAllRawConfigs(scripts: Interfaces.Script<Interfaces.ScriptConfigs, Interfaces.ScriptMethods>[]): Record<string, Interfaces.Config<keyof import("./elements/configs/interface").ConfigTagMap, any>>;
        getMatchedScripts(projects: Interfaces.Project<Record<string, Interfaces.Script<Interfaces.ScriptConfigs, Interfaces.ScriptMethods>>>[], urls: string[]): Interfaces.Script<Interfaces.ScriptConfigs, Interfaces.ScriptMethods>[];
        namespaceKey(namespace: string | undefined, key: any): any;
        uuid(): string;
        random(min: number, max: number): number;
        sleep(period: number): Promise<void>;
        isInBrowser(): boolean;
        onresize<E extends HTMLElement>(el: E, handler: (el: E) => void): void;
        loadCustomElements(elements: (new () => HTMLElement)[]): void;
        isInTopWindow(): boolean;
        createCenteredPopupWindow(url: string, winName: string, opts: {
            width: number;
            height: number;
            scrollbars: boolean;
            resizable: boolean;
        }): Window | null;
        waitForElement(selector: string | (() => HTMLElement | undefined), opts?: {
            timeout_seconds?: number | undefined;
            check_period_ms?: number | undefined;
        } | undefined): Promise<HTMLElement | null | undefined>;
        waitFor<T_1>(predicate: () => T_1, opts?: {
            timeout_seconds?: number | undefined;
            check_period_ms?: number | undefined;
        } | undefined): Promise<T_1>;
    };
    $ui: {
        tooltip<T_2 extends HTMLElement>(target: T_2): T_2;
        scriptPanel(script: Interfaces.Script<Interfaces.ScriptConfigs, Interfaces.ScriptMethods>, store: Interfaces.StoreProvider, opts?: {
            onload?: ((el: Elements.ConfigElement<"input">) => void) | undefined;
        } | undefined): Elements.ScriptPanelElement;
        configsArea(configElements: Record<string, Elements.ConfigElement<any>>): HTMLDivElement;
        configs<T_3 extends Record<string, Interfaces.Config<any, any>>>(namespace: string | undefined, store: Interfaces.StoreProvider, configs: T_3, onload?: ((el: Elements.ConfigElement<"input">) => void) | undefined): { [K in keyof T_3]: Elements.ConfigElement<T_3[K]["tag"]>; };
        notes(lines: (string | HTMLElement | (string | HTMLElement)[])[], tag?: "ol" | "ul"): HTMLOListElement | HTMLUListElement;
        copy(name: string, value: string): HTMLSpanElement;
        preventText(opts: Utils.PreventTextOptions): HTMLSpanElement;
        space(children: HTMLElement[], options?: {
            x?: number | undefined;
            y?: number | undefined;
            separator?: string | undefined;
        } | undefined): HTMLDivElement;
        button(text?: string | undefined, attrs?: Utils.CustomElementStyleAttrs<Omit<Partial<HTMLInputElement>, "type">> | undefined, handler?: Utils.ElementHandler<"input"> | undefined): HTMLInputElement;
    };
    h<K_1 extends keyof HTMLElementTagNameMap | keyof import("./elements/interface").CustomElementTagMap | (new () => HTMLElement)>(element: K_1, attrs?: (K_1 extends keyof HTMLElementTagNameMap | keyof import("./elements/interface").CustomElementTagMap ? Utils.CustomElementStyleAttrs<Partial<Utils.AllElementTagMaps[K_1]>> : K_1 extends abstract new () => any ? Partial<Utils.CustomElementStyleAttrs<InstanceType<K_1>>> : unknown) | undefined): K_1 extends keyof HTMLElementTagNameMap | keyof import("./elements/interface").CustomElementTagMap ? Utils.AllElementTagMaps[K_1] : K_1;
    h<K_2 extends keyof HTMLElementTagNameMap | keyof import("./elements/interface").CustomElementTagMap | (new () => HTMLElement)>(element: K_2, children?: Utils.ElementChildren | undefined): K_2 extends keyof HTMLElementTagNameMap | keyof import("./elements/interface").CustomElementTagMap ? Utils.AllElementTagMaps[K_2] : K_2;
    h<K_3 extends keyof HTMLElementTagNameMap | keyof import("./elements/interface").CustomElementTagMap | (new () => HTMLElement)>(element: K_3, attrsOrChildren?: Utils.ElementChildren | (K_3 extends keyof HTMLElementTagNameMap | keyof import("./elements/interface").CustomElementTagMap ? Utils.CustomElementStyleAttrs<Partial<Utils.AllElementTagMaps[K_3]>> : K_3 extends abstract new () => any ? Partial<Utils.CustomElementStyleAttrs<InstanceType<K_3>>> : unknown) | undefined): K_3 extends keyof HTMLElementTagNameMap | keyof import("./elements/interface").CustomElementTagMap ? Utils.AllElementTagMaps[K_3] : K_3;
    h<K_4 extends keyof HTMLElementTagNameMap | keyof import("./elements/interface").CustomElementTagMap | (new () => HTMLElement)>(element: K_4, attrs: K_4 extends keyof HTMLElementTagNameMap | keyof import("./elements/interface").CustomElementTagMap ? Utils.CustomElementStyleAttrs<Partial<Utils.AllElementTagMaps[K_4]>> : K_4 extends abstract new () => any ? Partial<Utils.CustomElementStyleAttrs<InstanceType<K_4>>> : unknown, children?: Utils.ElementChildren | undefined): K_4 extends keyof HTMLElementTagNameMap | keyof import("./elements/interface").CustomElementTagMap ? Utils.AllElementTagMaps[K_4] : K_4;
    h<K_5 extends keyof HTMLElementTagNameMap | keyof import("./elements/interface").CustomElementTagMap | (new () => HTMLElement)>(element: K_5, attrs: K_5 extends keyof HTMLElementTagNameMap | keyof import("./elements/interface").CustomElementTagMap ? Utils.CustomElementStyleAttrs<Partial<Utils.AllElementTagMaps[K_5]>> : K_5 extends abstract new () => any ? Partial<Utils.CustomElementStyleAttrs<InstanceType<K_5>>> : unknown, handler?: Utils.ElementHandler<K_5 extends keyof HTMLElementTagNameMap | keyof import("./elements/interface").CustomElementTagMap ? K_5 : {
        new (): HTMLDivElement;
        prototype: HTMLDivElement;
    }> | undefined): K_5 extends keyof HTMLElementTagNameMap | keyof import("./elements/interface").CustomElementTagMap ? Utils.AllElementTagMaps[K_5] : K_5;
    h<K_6 extends keyof HTMLElementTagNameMap | keyof import("./elements/interface").CustomElementTagMap | (new () => HTMLElement)>(element: K_6, children: Utils.ElementChildren, handler?: Utils.ElementHandler<K_6 extends keyof HTMLElementTagNameMap | keyof import("./elements/interface").CustomElementTagMap ? K_6 : {
        new (): HTMLDivElement;
        prototype: HTMLDivElement;
    }> | undefined): K_6 extends keyof HTMLElementTagNameMap | keyof import("./elements/interface").CustomElementTagMap ? Utils.AllElementTagMaps[K_6] : K_6;
    $el<T_4 extends HTMLElement>(selector: string, root?: HTMLElement | Document): (T_4 & {
        [x: string]: any;
    }) | undefined;
    $$el<T_5 extends HTMLElement>(selector: string, root?: HTMLElement | Document): (T_5 & {
        [x: string]: any;
    })[];
    enableElementDraggable(header: HTMLElement, target: HTMLElement, ondrag?: (() => void) | undefined): void;
    enableElementTouchDraggable(header: HTMLElement, target: HTMLElement, ondrag?: (() => void) | undefined): void;
    $elements: {
        tooltipContainer: HTMLDivElement | undefined;
        root: ShadowRoot | undefined;
        currentScriptPanel: Elements.ScriptPanelElement | undefined;
        wrapper: HTMLDivElement | undefined;
    };
    $gm: {
        unsafeWindow: Window & {
            [x: string]: any;
        };
        isInGMContext(): boolean;
        getInfos(): Tampermonkey.ScriptInfo | undefined;
        getTab(callback: (obj: any) => void): void;
        notification(content: string, options?: {
            extraTitle?: string | undefined;
            onclick?: (() => void) | undefined;
            ondone?: (() => void) | undefined;
            important?: boolean | undefined;
            duration?: number | undefined;
            silent?: boolean | undefined;
        } | undefined): void;
        getMetadataFromScriptHead(key: string): string[];
    };
    $store: Interfaces.StoreProvider;
    $const: {
        TAB_UID: string;
        TAB_URLS: string;
        TAB_CURRENT_PANEL_NAME: string;
    };
    start: typeof start;
};
export default EUS;
