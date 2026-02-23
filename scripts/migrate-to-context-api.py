#!/usr/bin/env python3
"""
useChatStore를 useExtensionAPIContext로 마이그레이션하는 스크립트

패턴 변환:
- import useChatStore → import useExtensionAPIContext
- useChatStore((state) => state.X) → context.api.X
- useChatStore.getState().X() → context.api.X()
"""

import re
import sys
from pathlib import Path
from typing import Dict, List, Tuple

# ============================================================================
# State to API Mapping
# ============================================================================

STATE_TO_API_MAP = {
    # Files API
    'openFiles': 'files.openFiles',
    'activeFilePath': 'files.activeFilePath',
    'setActiveFile': 'files.setActiveFile',
    'closeFile': 'files.closeFile',
    'updateFileContent': 'files.updateContent',
    'markFileDirty': 'files.markDirty',
    'setOpenFiles': 'files.openFile',  # Note: may need manual adjustment

    # Workspace API
    'workingDirectory': 'workspace.workingDirectory',
    'expandedFolderPaths': 'workspace.expandedFolderPaths',
    'setWorkingDirectory': 'workspace.setWorkingDirectory',
    'toggleExpandedFolder': 'workspace.toggleExpandedFolder',

    # UI API
    'showTerminalPanel': 'ui.showTerminalPanel',
    'setShowTerminalPanel': 'ui.toggleTerminal',  # Note: signature changed
    'editorAppearanceConfig': 'ui.editorAppearanceConfig',
    'setEditorAppearanceConfig': 'ui.updateEditorConfig',

    # Chat API
    'editorChatMessages': 'chat.messages',
    'setEditorChatMessages': 'chat.addMessage',  # Note: may need manual adjustment
}

def update_imports(content: str) -> str:
    """import 문 업데이트"""

    # useChatStore import 제거 또는 변경
    lines = content.split('\n')
    updated_lines = []
    import_added = False

    for line in lines:
        # useChatStore import 찾기
        if "import { useChatStore }" in line or "import {useChatStore}" in line:
            # import 제거하고 useExtensionAPIContext로 교체
            if not import_added:
                updated_lines.append("import { useExtensionAPIContext } from '@sepilot/extension-sdk';")
                import_added = True
            # 기존 import는 제거
            continue
        elif "from '@/lib/store/chat-store'" in line:
            # 독립적인 import 라인 제거
            continue
        else:
            updated_lines.append(line)

    return '\n'.join(updated_lines)

def migrate_zustand_selectors(content: str) -> str:
    """Zustand selector 패턴을 Context API로 변환

    useChatStore((state) => state.X) → context.api.X
    """

    # Pattern: useChatStore((state) => state.property)
    # 각 state 속성을 API로 매핑
    for state_key, api_path in STATE_TO_API_MAP.items():
        # Selector pattern
        pattern1 = rf'useChatStore\(\(state\)\s*=>\s*state\.{state_key}\)'
        replacement1 = f'context.{api_path}'
        content = re.sub(pattern1, replacement1, content)

        # Alternative selector pattern with explicit return
        pattern2 = rf'useChatStore\(\s*\(state\)\s*=>\s*{{\s*return\s+state\.{state_key};\s*}}\s*\)'
        content = re.sub(pattern2, replacement1, content)

    return content

def migrate_getstate_calls(content: str) -> str:
    """getState() 호출을 Context API로 변환

    useChatStore.getState().X() → context.api.X()
    useChatStore.getState().X → context.api.X
    """

    for state_key, api_path in STATE_TO_API_MAP.items():
        # Method call pattern: useChatStore.getState().method()
        pattern1 = rf'useChatStore\.getState\(\)\.{state_key}\('
        replacement1 = f'context.{api_path}('
        content = re.sub(pattern1, replacement1, content)

        # Property access pattern: useChatStore.getState().property
        pattern2 = rf'useChatStore\.getState\(\)\.{state_key}(?!\()'
        replacement2 = f'context.{api_path}'
        content = re.sub(pattern2, replacement2, content)

    return content

def add_context_hook(content: str) -> str:
    """컴포넌트 내부에 useExtensionAPIContext hook 추가"""

    # 함수 컴포넌트 찾기 (export function ComponentName 또는 function ComponentName)
    component_pattern = r'(export\s+)?function\s+\w+\s*\([^)]*\)\s*[:{]'

    def add_hook_inside_component(match):
        # 컴포넌트 시작 부분에 hook 추가
        component_start = match.group(0)
        # 함수 바디 시작점 찾기
        if component_start.endswith('{'):
            # JavaScript 함수
            return component_start + '\n  const context = useExtensionAPIContext();'
        else:
            # TypeScript 함수 (타입 명시 있음)
            return component_start + ' {\n  const context = useExtensionAPIContext();'

    # 이미 context hook이 있으면 추가하지 않음
    if 'const context = useExtensionAPIContext()' in content:
        return content

    # 첫 번째 컴포넌트에만 추가
    content = re.sub(component_pattern, add_hook_inside_component, content, count=1)

    return content

def migrate_file(file_path: Path) -> Tuple[bool, List[str]]:
    """파일 마이그레이션

    Returns:
        (success: bool, warnings: List[str])
    """
    warnings = []

    try:
        content = file_path.read_text(encoding='utf-8')
        original_content = content

        # useChatStore 사용이 없으면 스킵
        if 'useChatStore' not in content:
            return False, []

        print(f"  Migrating: {file_path}")

        # 1. Import 업데이트
        content = update_imports(content)

        # 2. Zustand selector 변환
        content = migrate_zustand_selectors(content)

        # 3. getState() 호출 변환
        content = migrate_getstate_calls(content)

        # 4. Context hook 추가
        content = add_context_hook(content)

        # 5. 남은 useChatStore 체크
        remaining = content.count('useChatStore')
        if remaining > 0:
            warnings.append(f"{file_path}: {remaining} instances of useChatStore remain (manual review needed)")

        # 변경사항이 있으면 저장
        if content != original_content:
            file_path.write_text(content, encoding='utf-8')
            return True, warnings

        return False, warnings

    except Exception as e:
        warnings.append(f"{file_path}: Error - {e}")
        return False, warnings

def main():
    editor_dir = Path('sepilot-desktop-extension-editor-local/src')

    if not editor_dir.exists():
        print(f"❌ Directory not found: {editor_dir}")
        return 1

    print("🔄 Starting useChatStore → useExtensionAPIContext migration...")
    print()
    print(f"📁 Processing {editor_dir}...")
    print()

    migrated_count = 0
    all_warnings = []

    # .ts, .tsx 파일 찾기
    for file_path in editor_dir.rglob('*.ts*'):
        if file_path.suffix in ['.ts', '.tsx']:
            success, warnings = migrate_file(file_path)
            if success:
                migrated_count += 1
            all_warnings.extend(warnings)

    print()
    print("✅ Migration complete!")
    print(f"  Migrated files: {migrated_count}")

    if all_warnings:
        print()
        print("⚠️  Warnings:")
        for warning in all_warnings:
            print(f"  - {warning}")

    print()
    print("📝 Manual review needed for:")
    print("  - setOpenFiles() calls (may need adjustment)")
    print("  - setShowTerminalPanel() → toggleTerminal() (signature changed)")
    print("  - setEditorChatMessages() → chat API (check logic)")
    print("  - Complex state updates")

    return 0

if __name__ == '__main__':
    sys.exit(main())
