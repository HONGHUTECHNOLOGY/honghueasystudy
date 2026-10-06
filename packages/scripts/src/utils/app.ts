import { $message, $modal, h } from 'easy-us';

export const $playwright = {
	showError: () => {
		const errorEl = h('div', [
			'当前页面需要下载鸿鹄易学桌面端，并在桌面端中新建浏览器，在新建的浏览器中才能进行正常刷课。'
		]);
		$modal.alert({
			maskCloseable: false,
			title: '错误',
			confirmButtonText: '知道了',
			content: errorEl.cloneNode(true)
		});
		$message.error({ content: errorEl.cloneNode(true), duration: 0 });
	}
};
