#!/bin/bash

# E2E 테스트 실행 스크립트
# Xvfb가 있으면 사용하고, 없으면 경고를 표시합니다.

set -e

# Xvfb 확인
if command -v xvfb-run &> /dev/null; then
    echo "✓ Xvfb를 사용하여 E2E 테스트를 실행합니다..."
    xvfb-run --auto-servernum --server-args="-screen 0 1280x960x24" \
        playwright test --config=e2e_tests/playwright.config.ts "$@"
else
    echo "⚠️  경고: Xvfb가 설치되지 않았습니다."
    echo "   headless 환경에서 E2E 테스트를 실행하려면 xvfb가 필요합니다."
    echo ""
    echo "   설치 방법:"
    echo "   - Ubuntu/Debian: sudo apt-get install xvfb"
    echo "   - Fedora/RHEL: sudo dnf install xorg-x11-server-Xvfb"
    echo "   - macOS: Xvfb가 필요하지 않습니다 (GUI 환경)"
    echo ""
    echo "   디스플레이 환경이 있는 경우 계속 진행합니다..."

    # DISPLAY 환경 변수가 설정되어 있으면 계속 진행
    if [ -n "$DISPLAY" ]; then
        echo "✓ DISPLAY 환경 변수가 설정되어 있습니다: $DISPLAY"
        playwright test --config=e2e_tests/playwright.config.ts "$@"
    else
        echo "❌ DISPLAY 환경 변수가 설정되지 않았습니다."
        echo "   GUI 환경에서 실행하거나 xvfb를 설치하세요."
        exit 1
    fi
fi
