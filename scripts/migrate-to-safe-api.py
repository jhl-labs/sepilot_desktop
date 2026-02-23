#!/usr/bin/env python3
"""
window.electronAPI를 safeElectronAPI로 안전하게 마이그레이션하는 스크립트

구조를 유지하면서 다음 변환을 수행:
1. import 추가
2. window.electronAPI.X(...) → safeElectronAPI.X(...)
3. if 조건에서 window.electronAPI 체크 제거 (isElectron() 유지)
"""

import re
import sys
from pathlib import Path

def has_safe_electron_import(content: str) -> bool:
    """파일에 safeElectronAPI import가 있는지 확인"""
    return 'safeElectronAPI' in content

def add_safe_electron_import(content: str) -> str:
    """safeElectronAPI import 추가"""
    if has_safe_electron_import(content):
        return content

    # @sepilot/extension-sdk import 찾기
    sdk_import_pattern = r"from ['\"]@sepilot/extension-sdk['\"]"

    if re.search(sdk_import_pattern, content):
        # 기존 import에 safeElectronAPI 추가
        def add_to_import(match):
            line = match.group(0)
            # import { A, B } from '@sepilot/extension-sdk' 형태 찾기
            import_match = re.match(r"import\s*{\s*([^}]+)\s*}\s*from\s*['\"]@sepilot/extension-sdk['\"]", line)
            if import_match:
                imports = import_match.group(1)
                if 'safeElectronAPI' not in imports:
                    new_imports = imports.strip() + ', safeElectronAPI'
                    return f"import {{ {new_imports} }} from '@sepilot/extension-sdk'"
            return line

        content = re.sub(r"import\s*{[^}]+}\s*from\s*['\"]@sepilot/extension-sdk['\"]", add_to_import, content, count=1)
    else:
        # 새로운 import 추가 (첫 번째 import 문 뒤에)
        lines = content.split('\n')
        first_import_idx = -1
        for i, line in enumerate(lines):
            if line.strip().startswith('import '):
                first_import_idx = i
                break

        if first_import_idx >= 0:
            lines.insert(first_import_idx + 1, "import { safeElectronAPI } from '@sepilot/extension-sdk';")
            content = '\n'.join(lines)

    return content

def replace_electron_api_calls(content: str) -> str:
    """window.electronAPI 호출을 safeElectronAPI로 변경"""

    # window.electronAPI.X(...) → safeElectronAPI.X(...)
    # window.electronAPI!.X(...) → safeElectronAPI.X(...)
    # window.electronAPI?.X(...) → safeElectronAPI.X(...)
    content = re.sub(r'window\.electronAPI[!?]?\.', 'safeElectronAPI.', content)

    return content

def remove_electron_api_checks(content: str) -> str:
    """if 조건에서 window.electronAPI 체크 제거"""

    # && !window.electronAPI 제거
    content = re.sub(r'\s*&&\s*!window\.electronAPI[!?]?\s*', '', content)

    # && window.electronAPI 제거
    content = re.sub(r'\s*&&\s*window\.electronAPI[!?]?\s*', '', content)

    # || !window.electronAPI 제거
    content = re.sub(r'\s*\|\|\s*!window\.electronAPI[!?]?\s*', '', content)

    # || window.electronAPI 제거
    content = re.sub(r'\s*\|\|\s*window\.electronAPI[!?]?\s*', '', content)

    return content

def migrate_file(file_path: Path) -> bool:
    """파일 마이그레이션"""
    try:
        content = file_path.read_text(encoding='utf-8')
        original_content = content

        # window.electronAPI 사용이 없으면 스킵
        if 'window.electronAPI' not in content:
            return False

        print(f"  Migrating: {file_path}")

        # 1. import 추가
        content = add_safe_electron_import(content)

        # 2. window.electronAPI 호출 변경
        content = replace_electron_api_calls(content)

        # 3. if 조건에서 window.electronAPI 체크 제거
        content = remove_electron_api_checks(content)

        # 변경사항이 있으면 저장
        if content != original_content:
            file_path.write_text(content, encoding='utf-8')
            return True

        return False

    except Exception as e:
        print(f"  Error: {file_path}: {e}", file=sys.stderr)
        return False

def main():
    # 마이그레이션 대상 디렉토리
    editor_dir = Path('sepilot-desktop-extension-editor-local/src')
    browser_dir = Path('sepilot-desktop-extension-browser-local/src')

    print("🔄 Starting safe API migration...")
    print()

    migrated_count = 0

    for base_dir in [editor_dir, browser_dir]:
        if not base_dir.exists():
            print(f"⚠️  Directory not found: {base_dir}")
            continue

        print(f"📁 Processing {base_dir}...")

        # .ts, .tsx 파일 찾기
        for file_path in base_dir.rglob('*.ts*'):
            if file_path.suffix in ['.ts', '.tsx']:
                if migrate_file(file_path):
                    migrated_count += 1

    print()
    print("✅ Migration complete!")
    print(f"  Migrated files: {migrated_count}")

if __name__ == '__main__':
    main()
