#!/usr/bin/env bash
# Builds the Alloy iPhone app (Release, no Metro needed) and installs it.
# Usage: fork/build-ios.sh <device-udid>      (list devices: xcrun devicectl list devices)
#
# Signs with the Mastery Beverage team. Uses T3's reduced-capability mode
# (no widget, share extension, push or Sign in with Apple): Apple refused the
# App Group these need, and T3's push and sign-in run on T3's accounts anyway.
set -euo pipefail
device="${1:?Pass the iPhone UDID}"
team=8BPBB42ZJH
cd "$(dirname "$0")/../apps/mobile"
export PATH="$PWD/../../node_modules/.bin:$PATH"
export APP_VARIANT=production EXPO_NO_GIT_STATUS=1
export T3CODE_IOS_PERSONAL_TEAM=1 T3CODE_IOS_PERSONAL_TEAM_BUNDLE_ID=com.masteryprotein.alloy

npx expo prebuild --clean --platform ios
cd ios
xcodebuild -workspace Alloy.xcworkspace -scheme Alloy -configuration Release \
  -destination "id=$device" -derivedDataPath build/alloy-dd \
  -allowProvisioningUpdates -allowProvisioningDeviceRegistration \
  DEVELOPMENT_TEAM="$team" CODE_SIGN_STYLE=Automatic build
xcrun devicectl device install app --device "$device" \
  build/alloy-dd/Build/Products/Release-iphoneos/Alloy.app
