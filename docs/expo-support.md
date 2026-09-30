# Expo support baseline

The workspace is pinned to the latest stable Expo release verified on 2026-09-28:

| Item | Baseline |
| --- | --- |
| Expo SDK | 57 |
| React Native | 0.86.3 |
| React | 19.2.3 |
| Node.js | 22.13.x or newer |
| Android | 7+ (API 24+) |
| Android compile/target SDK | 36 |
| iOS | 16.4+ |
| Xcode | 26.4+ |

SDK 57 is the stable release. SDK 58 was only available as a beta when this
baseline was checked, so it is intentionally not used here.

The example app must use an Expo development build. Expo Go cannot load the
custom native behavior needed to grant or deny camera and microphone requests
from a WebView.
