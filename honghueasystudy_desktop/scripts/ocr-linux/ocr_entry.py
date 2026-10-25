# -*- coding: utf-8 -*-
"""
Linux OCR 入口（ddddocr 封装）

CLI 契约（与 win/mac 包保持一致，供桌面端 child_process 调用）：
    ocr --ocr <img>                          -> stdout 输出识别文本
    ocr --det-target <img> --det-bg <img>    -> stdout 输出单引号对象字面量
                                                 {'target_y': int, 'target': [x1, y1, x2, y2]}

错误契约：参数缺失/文件不可读/推理异常 -> 非零退出码，错误信息走 stderr，stdout 不输出内容。

推理使用 ddddocr 自带 ONNX 模型（common_old.onnx），无需外部模型文件。
"""
import argparse
import sys

import ddddocr


def main() -> int:
    parser = argparse.ArgumentParser(description='ddddocr CLI (linux)')
    parser.add_argument('--ocr', metavar='IMG', help='文本验证码识别，输出识别结果')
    parser.add_argument('--det-target', dest='det_target', metavar='IMG', help='滑块识别：滑块小图')
    parser.add_argument('--det-bg', dest='det_bg', metavar='IMG', help='滑块识别：背景大图')
    args = parser.parse_args()

    if args.ocr:
        try:
            with open(args.ocr, 'rb') as f:
                image = f.read()
        except OSError as e:
            print('read image error: %s' % e, file=sys.stderr)
            return 1
        try:
            # show_ad=False：与 win/mac 入口一致，关闭 ddddocr 广告输出
            # old=True：加载 common_old.onnx 旧版模型，与 win 包对齐（win 包内仅含该模型）
            ocr = ddddocr.DdddOcr(show_ad=False, old=True)
            print(ocr.classification(image))
        except Exception as e:  # noqa: BLE001 推理异常统一转非零退出码
            print('ocr inference error: %s' % e, file=sys.stderr)
            return 1
        return 0

    if args.det_target and args.det_bg:
        try:
            with open(args.det_target, 'rb') as f:
                target = f.read()
            with open(args.det_bg, 'rb') as f:
                background = f.read()
        except OSError as e:
            print('read image error: %s' % e, file=sys.stderr)
            return 1
        try:
            # old=True：与 --ocr 路径一致加载 common_old.onnx（slide_match 纯 cv2 不依赖模型）
            ocr = ddddocr.DdddOcr(show_ad=False, old=True)
            result = ocr.slide_match(target, background)
            # dict 直接 print 即单引号字面量：{'target_y': n, 'target': [x1, y1, x2, y2]}
            print(result)
        except Exception as e:  # noqa: BLE001
            print('det inference error: %s' % e, file=sys.stderr)
            return 1
        return 0

    parser.error('--ocr 与 (--det-target + --det-bg) 必须提供其中一组')
    return 2


if __name__ == '__main__':
    sys.exit(main())
