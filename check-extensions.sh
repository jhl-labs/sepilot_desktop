#!/bin/bash
echo "=== Extension Structure Check ==="
echo ""
echo "Editor Extension:"
ls -1 extensions/editor/
echo ""
echo "Browser Extension:"
ls -1 extensions/browser/
echo ""
echo "Presentation Extension:"
ls -1 extensions/presentation/
echo ""
echo "=== File Counts ==="
echo "Editor files: $(find extensions/editor -type f | wc -l)"
echo "Browser files: $(find extensions/browser -type f | wc -l)"
echo "Presentation files: $(find extensions/presentation -type f | wc -l)"
