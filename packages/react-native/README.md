# @usedigisign/react-native-verification-sdk

DigiSign identity-verification WebView SDK for React Native and Expo.

## Install

```bash
npm install @usedigisign/react-native-verification-sdk react-native-webview react-native-permissions
```

The package requires React Native 0.86.3 or newer and React 19.2.3 or newer.
Configure `react-native-permissions` for camera and microphone access in the
consumer app's iOS `Info.plist` and Android manifest. The host app is
responsible for native permission configuration.

## Usage

```tsx
import { VerificationWebView } from "@usedigisign/react-native-verification-sdk";

<VerificationWebView
  requestPublicId={requestPublicId}
  recipientPublicId={recipientPublicId}
  accessToken={shortLivedSessionToken}
  workspaceId={workspacePublicId}
  organisationId={organisationPublicId}
  onCancel={closeVerification}
/>;
```

The SDK fetches request details internally, opens the backend-generated
`recipients[].signing_access.link` short link, and derives signing status from
the same response while polling. The `accessToken` must be a short-lived
DigiSign session JWT; never ship a permanent API key in a mobile application.
This internal flow requires the backend request-details response to include
`recipients[].signing_access`.

For an already-resolved verification URL, pass `url` instead of the internal
access-flow credentials:

```tsx
<VerificationWebView url={verificationUrl} onCancel={closeVerification} />
```

## Flow preview

These screenshots show the SDK-managed loading state and the DigiSign Web
verification flow in the Expo example:

| Loading verification                                                    | Review and sign                                               |
| ----------------------------------------------------------------------- | ------------------------------------------------------------- |
| ![Loading verification](assets/screenshots/01-loading-verification.png) | ![Review and sign](assets/screenshots/02-review-and-sign.png) |

| Biometric verification loading                                                 | Face positioning                                                |
| ------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| ![Biometric verification loading](assets/screenshots/03-biometric-loading.png) | ![Face positioning](assets/screenshots/04-face-positioning.png) |

## Custom UI and events

Use `renderLoading`, `renderError`, `renderPermissionDenied`, and `renderCancel`
to replace the default SDK surfaces. Use `onEvent` to observe access loading,
WebView loading, permission, API error, status, and terminal events.

The SDK exports `VerificationWebView`, `DigiSignApiError`,
`DIGISIGN_ALLOWED_ORIGINS`, `DEFAULT_DIGISIGN_API_BASE_URL`, and the associated
TypeScript types.

See the [repository README](https://github.com/DigisignHQ/digisign-verification-sdk#readme)
for the complete public API reference and Expo example.

## License

MIT
