#!/bin/bash

# Extension 파일들에서 window.electronAPI를 safeElectronAPI로 마이그레이션하는 스크립트

set -e

EDITOR_DIR="sepilot-desktop-extension-editor-local/src"
BROWSER_DIR="sepilot-desktop-extension-browser-local/src"

echo "🔄 Starting Electron API migration..."
echo ""

# 마이그레이션 대상 파일 찾기
echo "📁 Finding files to migrate..."
FILES=$(find "$EDITOR_DIR" "$BROWSER_DIR" -type f \( -name "*.ts" -o -name "*.tsx" \) -exec grep -l "window\.electronAPI" {} \;)

if [ -z "$FILES" ]; then
  echo "✅ No files to migrate!"
  exit 0
fi

echo "Found $(echo "$FILES" | wc -l) files to migrate:"
echo "$FILES" | sed 's/^/  - /'
echo ""

# 백업 생성
echo "💾 Creating backup..."
BACKUP_DIR=".migration-backup-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"

for file in $FILES; do
  backup_file="$BACKUP_DIR/$file"
  mkdir -p "$(dirname "$backup_file")"
  cp "$file" "$backup_file"
done

echo "✅ Backup created in: $BACKUP_DIR"
echo ""

# 마이그레이션 수행
echo "🔧 Migrating files..."
MIGRATED=0

for file in $FILES; do
  echo "  Processing: $file"

  # 1. import 문 추가 (파일 맨 위에)
  if ! grep -q "safeElectronAPI" "$file"; then
    # 기존 @sepilot/extension-sdk import가 있으면 수정, 없으면 추가
    if grep -q "from '@sepilot/extension-sdk'" "$file"; then
      # 기존 import에 safeElectronAPI 추가
      sed -i "s/from '@sepilot\/extension-sdk'/&;\nimport { safeElectronAPI } from '@sepilot\/extension-sdk'/" "$file"
    else
      # 새로운 import 추가 (첫 import 문 위에)
      sed -i "1i import { safeElectronAPI } from '@sepilot/extension-sdk';" "$file"
    fi
  fi

  # 2. window.electronAPI 패턴들을 safeElectronAPI로 치환

  # window.electronAPI.fs.* → await safeElectronAPI.fs.*
  sed -i 's/window\.electronAPI\.fs\./await safeElectronAPI.fs./g' "$file"

  # window.electronAPI.browserView.* → await safeElectronAPI.browserView.*
  sed -i 's/window\.electronAPI\.browserView\./await safeElectronAPI.browserView./g' "$file"

  # window.electronAPI.langgraph.* → await safeElectronAPI.langgraph.*
  sed -i 's/window\.electronAPI\.langgraph\./await safeElectronAPI.langgraph./g' "$file"

  # window.electronAPI.shell.* → await safeElectronAPI.shell.*
  sed -i 's/window\.electronAPI\.shell\./await safeElectronAPI.shell./g' "$file"

  # window.electronAPI.llm.* → await safeElectronAPI.llm.*
  sed -i 's/window\.electronAPI\.llm\./await safeElectronAPI.llm./g' "$file"

  # window.electronAPI.file.* → await safeElectronAPI.file.*
  sed -i 's/window\.electronAPI\.file\./await safeElectronAPI.file./g' "$file"

  # window.electronAPI.on → safeElectronAPI.on
  sed -i 's/window\.electronAPI\.on/safeElectronAPI.on/g' "$file"

  # window.electronAPI.removeListener → safeElectronAPI.removeListener
  sed -i 's/window\.electronAPI\.removeListener/safeElectronAPI.removeListener/g' "$file"

  # 3. 불필요한 체크 제거
  # if (window.electronAPI) 또는 if (!window.electronAPI) 패턴 제거
  sed -i '/if.*window\.electronAPI.*{/d' "$file"
  sed -i '/&&.*window\.electronAPI/d' "$file"

  # 4. 이중 await 제거 (await await → await)
  sed -i 's/await await /await /g' "$file"

  MIGRATED=$((MIGRATED + 1))
done

echo ""
echo "✅ Migration complete!"
echo "  - Migrated files: $MIGRATED"
echo "  - Backup location: $BACKUP_DIR"
echo ""
echo "⚠️  Please review the changes and run:"
echo "  - pnpm type-check"
echo "  - pnpm lint"
echo ""
echo "To rollback, run: cp -r $BACKUP_DIR/* ."
