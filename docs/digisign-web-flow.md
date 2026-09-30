# DigiSign WebView requirements

The existing DigiSign web signing flow performs active liveness in the web
application. The page uses browser media APIs (`navigator.mediaDevices.getUserMedia()`)
to access the camera, captures liveness frames with canvas, and uses media
recording/camera cleanup in the browser. The native SDK therefore embeds the
flow in a WebView; it does not reimplement camera capture with `expo-camera`.

## URL shape

The existing public web routes include:

- `/tracking/v8n/t/{signature}` — signed document access using a signature token.
- `/tracking/doc/{publicId}/access` — document access using a public ID and
  optional access query parameters.

The caller should pass the complete URL returned or constructed by the DigiSign
service into `VerificationWebView`. The SDK should not create access tokens or
call the signing service itself.

## Native permissions

The consuming Expo app owns the generated native app configuration:

- Android: `CAMERA` and `RECORD_AUDIO` manifest permissions.
- iOS: `NSCameraUsageDescription` and `NSMicrophoneUsageDescription` in
  `Info.plist`.

`react-native-webview` receives the page's camera/microphone request and asks
the operating system for those permissions. `expo-camera` is not required.

## Host origins

The current development web configuration uses `sandbox.usedigisign.dev` and
related DigiSign service hosts. Production uses DigiSign HTTPS hosts under
`usedigisign.com`. The SDK defaults to DigiSign HTTPS origins and permits their
subdomains; consumers can provide a narrower `allowedOrigins` list when the
exact service host is known.
