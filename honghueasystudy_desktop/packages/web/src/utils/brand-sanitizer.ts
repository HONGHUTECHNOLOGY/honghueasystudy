const BRAND_NAME = '鸿鹄易学';
const OCS_TEXT = /OCS/g;
const BRAND_ATTRIBUTES = ['title', 'placeholder', 'aria-label', 'alt'];

function replaceAttributes(element: Element) {
	for (const name of BRAND_ATTRIBUTES) {
		const value = element.getAttribute(name);
		if (value && value.includes('OCS')) {
			element.setAttribute(name, value.replace(OCS_TEXT, BRAND_NAME));
		}
	}
}

function sanitizeText(root: ParentNode) {
	const doc = root instanceof Document ? root : (root as Node).ownerDocument || document;
	const walker = doc.createTreeWalker(root as Node, NodeFilter.SHOW_TEXT);
	let node: Node | null;
	while ((node = walker.nextNode())) {
		const parent = node.parentElement;
		if (parent && (parent.tagName === 'SCRIPT' || parent.tagName === 'STYLE')) continue;
		if (node.nodeValue && node.nodeValue.includes('OCS')) {
			node.nodeValue = node.nodeValue.replace(OCS_TEXT, BRAND_NAME);
		}
	}
}

/** 替换可见文本/提示属性中的旧品牌字样，不修改内部变量、接口地址和存储键 */
export function sanitizeVisibleBrand(root: ParentNode) {
	if (!root) return;
	if (root instanceof Element) replaceAttributes(root);
	for (const element of Array.from(root.querySelectorAll('*'))) {
		replaceAttributes(element);
	}
	sanitizeText(root);
}

/** 监听动态渲染的配置界面/弹窗，持续清理可见旧品牌字样 */
export function observeVisibleBrand(root: ParentNode): MutationObserver {
	sanitizeVisibleBrand(root);
	const observer = new MutationObserver(() => {
		sanitizeVisibleBrand(root);
	});
	observer.observe(root as Node, {
		subtree: true,
		childList: true,
		characterData: true,
		attributes: true,
		attributeFilter: BRAND_ATTRIBUTES
	});
	return observer;
}
