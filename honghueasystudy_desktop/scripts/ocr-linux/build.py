#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Linux OCR 二进制构建脚本

流程：
    1. 创建虚拟环境（Python 3.8，与 win 包基准一致）
    2. 安装 requirements.txt 锁定版本依赖
    3. PyInstaller onedir 打包 ocr_entry.py 为 `ocr` 入口
       （5.x onedir 布局：可执行文件与依赖同级，无 _internal/，与 win 包一致）
    4. 归档 dist/ocr/ 内容为 ocr-linux-<arch>.zip（zip 根即 ocr 二进制，保留 +x 权限位）
    5. 冒烟自校验：对产物执行 CLI 契约测试（--ocr / --det-target + --det-bg）

用法（Linux 环境，Python 3.8）：
    python3 build.py                     # 输出到 <脚本目录>/dist/
    python3 build.py --output-dir /tmp/o # 指定输出目录
    python3 build.py --skip-smoke        # 跳过冒烟测试

说明：
    - 本脚本必须在 Linux 上执行（无法在 Windows/macOS 交叉产出 Linux 二进制）
    - pip 源可通过标准 PIP_INDEX_URL / PIP_EXTRA_INDEX_URL 环境变量覆盖
    - zip 使用 external_attr 保留文件权限位，解压后 ocr 直接具备执行权限
"""
import argparse
import ast
import os
import platform
import shutil
import subprocess
import sys
import zipfile
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent

MIN_PY = (3, 8)


def normalize_arch(machine: str) -> str:
    """platform.machine() -> 资源命名架构（与 init.ocr.ts / ocr.install.js 的 <platform>-<arch> 对齐）"""
    m = machine.lower()
    if m in ('x86_64', 'amd64'):
        return 'x64'
    if m in ('aarch64', 'arm64'):
        return 'arm64'
    raise SystemExit('不支持的架构: %s（仅支持 x86_64 / aarch64）' % machine)


def check_python():
    if sys.version_info < MIN_PY or sys.version_info >= (3, 9):
        print(
            '[warn] 推荐 Python 3.8（与 win 包基准一致），当前 %d.%d.%d'
            % (sys.version_info[0], sys.version_info[1], sys.version_info[2])
        )
    if sys.platform != 'linux':
        raise SystemExit('本脚本仅支持在 Linux 上执行，当前平台: %s' % sys.platform)


def run(cmd, **kwargs):
    print('[run] %s' % ' '.join(str(c) for c in cmd))
    subprocess.run([str(c) for c in cmd], check=True, **kwargs)


def build_venv(venv_dir: Path) -> Path:
    """创建虚拟环境并安装依赖，返回 venv 内 python 路径"""
    if venv_dir.exists():
        shutil.rmtree(venv_dir)
    run([sys.executable, '-m', 'venv', str(venv_dir)])
    # 注意：条件表达式优先级低于 /，子路径必须先拼成字符串再与 venv_dir 连接
    # （写成 'bin' / 'python' 会先求值为 str/str 的 TypeError）
    venv_python = venv_dir / ('Scripts/python.exe' if os.name == 'nt' else 'bin/python')
    # 先升级 pip，避免旧 pip 解析 wheel 元数据失败
    run([venv_python, '-m', 'pip', 'install', '--upgrade', 'pip'])
    run([venv_python, '-m', 'pip', 'install', '-r', str(SCRIPT_DIR / 'requirements.txt')])
    return venv_python


def build_binary(venv_python: Path, output_dir: Path) -> Path:
    """PyInstaller onedir 打包，返回 dist/ocr 目录"""
    dist_path = output_dir / 'dist'
    work_path = output_dir / 'build'
    if dist_path.exists():
        shutil.rmtree(dist_path)
    if work_path.exists():
        shutil.rmtree(work_path)
    run(
        [
            venv_python,
            '-m',
            'PyInstaller',
            '--clean',
            '--yes',
            '--name',
            'ocr',
            # 收集 ddddocr 包数据（自带 ONNX 模型 common_old.onnx），避免打包后模型缺失
            '--collect-all',
            'ddddocr',
            '--distpath',
            str(dist_path),
            '--workpath',
            str(work_path),
            '--specpath',
            str(work_path),
            str(SCRIPT_DIR / 'ocr_entry.py'),
        ]
    )
    app_dir = dist_path / 'ocr'
    binary = app_dir / 'ocr'
    if not binary.exists():
        raise SystemExit('打包失败：未找到产物 %s' % binary)
    binary.chmod(0o755)
    return app_dir


def archive(app_dir: Path, output_dir: Path, arch: str) -> Path:
    """将 dist/ocr/ 内容归档到 zip 根（ocr 位于顶层，与 win 包布局一致），保留权限位"""
    zip_path = output_dir / ('ocr-linux-%s.zip' % arch)
    if zip_path.exists():
        zip_path.unlink()
    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zf:
        for p in sorted(app_dir.rglob('*')):
            rel = p.relative_to(app_dir)
            zi = zipfile.ZipInfo(rel.as_posix())
            # 保留执行权限位：解压后 ocr 直接可执行
            zi.external_attr = (p.stat().st_mode & 0xFFFF) << 16
            if p.is_dir():
                zi.external_attr |= 0x10
                zf.writestr(zi, '')
            else:
                with p.open('rb') as f:
                    zf.writestr(zi, f.read())
    print('[ok] 归档完成: %s (%d bytes)' % (zip_path, zip_path.stat().st_size))
    return zip_path


def make_smoke_images(venv_python: Path, output_dir: Path):
    """用 venv 内 Pillow 生成冒烟测试图片（背景 + 滑块小图）"""
    gen = output_dir / 'smoke_gen.py'
    gen.write_text(
        """# -*- coding: utf-8 -*-
from pathlib import Path
from PIL import Image, ImageDraw

d = Path(%r)
d.mkdir(parents=True, exist_ok=True)

bg = Image.new('RGB', (300, 150), 'white')
ImageDraw.Draw(bg).rectangle([180, 60, 220, 100], fill='black')
bg.save(d / 'smoke_bg.png')

# 滑块小图：从背景裁剪含缺口的部分
piece = bg.crop((175, 55, 230, 110))
piece.save(d / 'smoke_target.png')

# 文本验证码图
code = Image.new('RGB', (120, 40), 'white')
ImageDraw.Draw(code).text((10, 10), '8888', fill='black')
code.save(d / 'smoke_code.png')
print('smoke images ready')
"""
        % str(output_dir),
        encoding='utf-8',
    )
    run([venv_python, str(gen)])


def smoke_test(binary: Path, venv_python: Path, output_dir: Path):
    """CLI 契约冒烟自校验：文本识别 + 滑块识别"""
    print('[smoke] 生成测试图片...')
    make_smoke_images(venv_python, output_dir)

    print('[smoke] --ocr 文本识别...')
    r = subprocess.run([str(binary), '--ocr', str(output_dir / 'smoke_code.png')], capture_output=True, text=True)
    print('    rc=%d stdout=%r stderr=%r' % (r.returncode, r.stdout[:120], r.stderr[:120]))
    if r.returncode != 0:
        raise SystemExit('[smoke] --ocr 契约失败：退出码 %d' % r.returncode)

    print('[smoke] --det-target/--det-bg 滑块识别...')
    r = subprocess.run(
        [
            str(binary),
            '--det-target',
            str(output_dir / 'smoke_target.png'),
            '--det-bg',
            str(output_dir / 'smoke_bg.png'),
        ],
        capture_output=True,
        text=True,
    )
    print('    rc=%d stdout=%r stderr=%r' % (r.returncode, r.stdout[:120], r.stderr[:120]))
    if r.returncode != 0:
        raise SystemExit('[smoke] det 契约失败：退出码 %d' % r.returncode)
    try:
        result = ast.literal_eval(r.stdout.strip())
        assert 'target_y' in result and 'target' in result, '缺少 target_y/target 字段: %r' % (result,)
    except Exception as e:
        raise SystemExit('[smoke] det 输出不符合契约 %r: %s' % (r.stdout[:200], e))
    print('[smoke] 契约自校验通过 ✓')


def main():
    check_python()
    parser = argparse.ArgumentParser(description='Linux OCR 构建脚本')
    parser.add_argument('--output-dir', default=str(SCRIPT_DIR / 'dist'), help='输出目录（默认 <脚本目录>/dist）')
    parser.add_argument('--skip-smoke', action='store_true', help='跳过 CLI 契约冒烟测试')
    args = parser.parse_args()

    arch = normalize_arch(platform.machine())
    output_dir = Path(args.output_dir).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    print('== Linux OCR 构建 ==')
    print('arch       : %s (%s)' % (arch, platform.machine()))
    print('python     : %s (%d.%d.%d)' % (sys.executable, *sys.version_info[:3]))
    print('output dir : %s' % output_dir)

    venv_python = build_venv(output_dir / 'venv')
    app_dir = build_binary(venv_python, output_dir)
    zip_path = archive(app_dir, output_dir, arch)
    if not args.skip_smoke:
        smoke_test(app_dir / 'ocr', venv_python, output_dir)
    print('\n== 构建完成 ==')
    print('产物: %s' % zip_path)


if __name__ == '__main__':
    main()
