#!/bin/bash
# 把网页版改动同步进安卓工程（改完 boji-plan/index.html 后跑一次，再重新构建）
set -e
cd "$(dirname "$0")"
cp boji-plan/index.html android/app/src/main/assets/www/index.html
echo "✅ 已同步 boji-plan/index.html → android/app/src/main/assets/www/index.html"
echo "   重新构建: cd android && ./gradlew assembleDebug"
