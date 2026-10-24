# -*- coding: utf-8 -*-
"""从 website/api/honghu-app-langs.json 生成桌面端内置默认语言包 default-langs.ts"""
import json
import io
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'website', 'api', 'honghu-app-langs.json')
DEST = os.path.join(ROOT, 'honghueasystudy_desktop', 'packages', 'web', 'src', 'config', 'default-langs.ts')

data = json.load(io.open(SRC, encoding='utf-8'))

lines = []
lines.append('/** 桌面端内置默认语言包：内容镜像 website/api/honghu-app-langs.json（官网托管版本作为远端覆盖）。')
lines.append(' *  修改文案时两处同步；远端获取失败时应用仍有完整文案，不再弹错误。 */')
lines.append('export const DEFAULT_LANGS: Record<string, string> = {')
for k, v in data.items():
    esc = v.replace('\\', '\\\\').replace('`', '\\`').replace('${', '\\${')
    lines.append('\t' + json.dumps(k, ensure_ascii=False) + ': `' + esc + '`,')
lines.append('};')

os.makedirs(os.path.dirname(DEST), exist_ok=True)
io.open(DEST, 'w', encoding='utf-8', newline='\n').write('\n'.join(lines) + '\n')
print('written', DEST, len(data), 'entries')
