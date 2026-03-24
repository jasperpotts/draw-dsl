#!/bin/bash
# Quick clean build + run for the JetBrains draw-dsl plugin.
# Kills any stale sandbox IDE, clears JCEF cache, then launches.
#
# Usage:
#   ./run-dev.sh          — clean build + launch sandbox IDE
#   ./run-dev.sh test     — start local HTTP server for test-editor.html (no IDE needed)
set -e
cd "$(dirname "$0")"

DRAWIO_DIR="src/main/resources/drawio"
TEST_PORT=8095

if [ "$1" = "test" ]; then
    echo "==> Serving drawio resources at http://localhost:${TEST_PORT}/"
    echo "    Open http://localhost:${TEST_PORT}/test-editor.html in your browser"
    echo "    Press Ctrl+C to stop"
    cd "$DRAWIO_DIR"
    python3 -m http.server "$TEST_PORT"
    exit 0
fi

echo "==> Stopping stale sandbox IDE (if any)..."
pkill -f "idea-sandbox" 2>/dev/null || true
sleep 1

echo "==> Clearing JCEF cache..."
rm -rf build/idea-sandbox/*/system/jcef_cache

echo "==> Clean build + runIde..."
./gradlew clean runIde
