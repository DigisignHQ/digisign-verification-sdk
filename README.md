# DigiSign Verification SDK

React Native and Expo integration for DigiSign identity verification flows.

## Workspace

- `packages/react-native` — reusable `@digisign/react-native-verification-sdk` package.
- `examples/expo-example` — Expo SDK 57 development-build example app.
- `docs/` — integration notes and platform requirements.

## Requirements

- Node.js `>=22.13.0`
- pnpm `9.4.0`
- Expo SDK `57`
- Android 7+ / API 24+
- iOS 16.4+
- Android SDK 36 and Xcode 26.4+

## Install and run

```sh
pnpm install
pnpm example:start
```

The SDK proactively requests camera and microphone permissions before mounting
the WebView. It does not require `expo-camera`; it uses
`react-native-permissions`, while the DigiSign page still calls `getUserMedia()`
inside the WebView. The host app must declare the native permissions in its
Expo config:

```json
{
  "expo": {
    "ios": {
      "infoPlist": {
        "NSCameraUsageDescription": "Camera access is required for verification.",
        "NSMicrophoneUsageDescription": "Microphone access is required for video verification."
      }
    },
    "android": {
      "permissions": ["CAMERA", "RECORD_AUDIO"]
    },
    "plugins": [["react-native-permissions", { "iosPermissions": ["Camera", "Microphone"] }]]
  }
}
```

Use a development build for native WebView permission behavior:

```sh
pnpm example:ios
pnpm example:android
```

Expo Go is not sufficient for this integration because the verification flow
depends on native WebView permission callbacks.

## Usage

```tsx
import { VerificationWebView } from "@digisign/react-native-verification-sdk";

<VerificationWebView
  requestPublicId={requestPublicId}
  recipientPublicId={recipientPublicId}
  accessToken={shortLivedSessionToken}
  workspaceId={workspacePublicId}
  apiBaseUrl="https://sandbox.usedigisign.dev"
  onCancel={() => navigation.goBack()}
  onSigningStatus={(status) => console.log(status.request_status, status.recipient_status)}
/>;
```

The SDK calls `POST /v1/requests/{requestPublicId}/recipients/{recipientPublicId}/signing-access`
internally, reads the returned verification `link`, and polls
`GET .../signing-status` every four seconds. The access token must be a
short-lived DigiSign session JWT and `workspaceId` is sent as
`x-ws-identifier`. Do not ship a permanent API key in the mobile app; obtain
the session token through your backend or another protected session flow.

`apiBaseUrl` defaults to `https://sandbox.usedigisign.dev`. Configure the
production API base URL for production deployments. The direct `url` prop is
also supported for integrations that already fetch the signing link.

The component includes loading, error, retry, and cancel UI when `onCancel` is
provided. Consumers can replace these surfaces with render props:

```tsx
<VerificationWebView
  requestPublicId={requestPublicId}
  recipientPublicId={recipientPublicId}
  accessToken={shortLivedSessionToken}
  workspaceId={workspacePublicId}
  onCancel={closeVerification}
  renderLoading={() => <YourLoadingView />}
  renderError={({ error, onRetry }) => <YourErrorView message={error.error} onRetry={onRetry} />}
  renderPermissionDenied={({ onRetry, onOpenSettings, canOpenSettings }) => (
    <YourPermissionView
      onRetry={onRetry}
      onOpenSettings={onOpenSettings}
      canOpenSettings={canOpenSettings}
    />
  )}
  renderCancel={({ onCancel }) => <YourCancelButton onPress={onCancel} />}
/>
```

When a user has permanently blocked a permission, the default permission view
offers an **Open Settings** action. Custom permission views receive
`canOpenSettings` and `onOpenSettings`; the SDK re-checks permissions when the
app returns from Settings.

The host app remains responsible for obtaining the DigiSign verification URL
from the DigiSign service and deciding what to do after the verification flow
completes. By default, the SDK allows `usedigisign.com`, `usedigisign.dev`, and
their HTTPS subdomains. Consumers can override this with `allowedOrigins` when
using a controlled DigiSign environment.
