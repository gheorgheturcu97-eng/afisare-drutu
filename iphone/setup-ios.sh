#!/bin/bash
# Creează proiectul Xcode pentru iPhone. Rulează pe Mac, în folderul „iphone”:   bash setup-ios.sh
set -e
cd "$(dirname "$0")"
command -v node >/dev/null || { echo "Instalează Node.js de pe https://nodejs.org"; exit 1; }
xcode-select -p >/dev/null 2>&1 || { echo "Instalează Xcode din App Store, deschide-l o dată, apoi rulează din nou."; exit 1; }

npm install
[ -d ios ] || npx cap add ios --packagemanager SPM
npx cap sync ios

PLIST=ios/App/App/Info.plist
PB=/usr/libexec/PlistBuddy
# permite conectarea la PC-ul panoului pe http în rețeaua locală
$PB -c "Delete :NSAppTransportSecurity" "$PLIST" 2>/dev/null || true
$PB -c "Add :NSAppTransportSecurity dict" "$PLIST"
$PB -c "Add :NSAppTransportSecurity:NSAllowsArbitraryLoadsInWebContent bool true" "$PLIST"
$PB -c "Add :NSAppTransportSecurity:NSAllowsLocalNetworking bool true" "$PLIST"
$PB -c "Delete :NSLocalNetworkUsageDescription" "$PLIST" 2>/dev/null || true
$PB -c "Add :NSLocalNetworkUsageDescription string Aplicația se conectează la PC-ul care controlează panoul LED." "$PLIST"
$PB -c "Delete :NSPhotoLibraryUsageDescription" "$PLIST" 2>/dev/null || true
$PB -c "Add :NSPhotoLibraryUsageDescription string Alegi poze și video pe care să le pui pe panou." "$PLIST"
$PB -c "Delete :NSCameraUsageDescription" "$PLIST" 2>/dev/null || true
$PB -c "Add :NSCameraUsageDescription string Poți face o poză direct pentru panou." "$PLIST"

# iconița aplicației
ICON_DIR=ios/App/App/Assets.xcassets/AppIcon.appiconset
cp icon-1024.png "$ICON_DIR/AppIcon-512@2x.png"

echo ""
echo "Gata. Se deschide Xcode: alege iPhone-ul tău sus și apasă ▶."
npx cap open ios
