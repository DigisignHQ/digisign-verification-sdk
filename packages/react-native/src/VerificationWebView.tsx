import React, { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  AppState,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  checkMultiple,
  PERMISSIONS,
  requestMultiple,
  RESULTS,
  openSettings,
  type Permission,
  type PermissionStatus,
} from 'react-native-permissions';
import { WebView, type WebView as WebViewType } from 'react-native-webview';

export const DIGISIGN_ALLOWED_ORIGINS = [
  'https://usedigisign.com',
  'https://usedigisign.dev',
] as const;

export type VerificationEventType =
  | 'loading'
  | 'loaded'
  | 'webview-error'
  | 'invalid-origin'
  | 'permission-denied';

export type VerificationEvent = {
  type: VerificationEventType;
  error?: string;
};

export type VerificationCancelRenderProps = { onCancel: () => void };
export type VerificationErrorRenderProps = {
  error: VerificationEvent;
  onRetry: () => void;
  canRetry: boolean;
};
export type VerificationPermissionRenderProps = {
  permissions: Record<string, PermissionStatus>;
  onRetry: () => void;
  onOpenSettings: () => Promise<void>;
  canOpenSettings: boolean;
};

export type VerificationWebViewProps = {
  url: string;
  allowedOrigins?: readonly string[];
  onCancel?: () => void;
  onEvent?: (event: VerificationEvent) => void;
  onNavigationStateChange?: (url: string) => void;
  renderCancel?: (props: VerificationCancelRenderProps) => ReactNode;
  renderError?: (props: VerificationErrorRenderProps) => ReactNode;
  renderLoading?: () => ReactNode;
  renderPermissionDenied?: (props: VerificationPermissionRenderProps) => ReactNode;
};

function originAllowed(url: string, allowedOrigins: readonly string[]) {
  try {
    const candidate = new URL(url);
    return allowedOrigins.some((allowedOrigin) => {
      const allowed = new URL(allowedOrigin);
      if (candidate.protocol !== 'https:' || allowed.protocol !== 'https:') return false;
      return candidate.hostname === allowed.hostname || candidate.hostname.endsWith(`.${allowed.hostname}`);
    });
  } catch {
    return false;
  }
}

function DefaultLoading() {
  return (
    <View style={styles.statusCard}>
      <ActivityIndicator size="large" color="#1d4ed8" />
      <Text style={styles.statusTitle}>Loading verification</Text>
      <Text style={styles.statusMessage}>Please wait while we open DigiSign.</Text>
    </View>
  );
}

function DefaultError({ error, onRetry, canRetry }: VerificationErrorRenderProps) {
  return (
    <View style={styles.statusCard}>
      <Text style={styles.errorIcon}>!</Text>
      <Text style={styles.statusTitle}>Verification could not be loaded</Text>
      <Text style={styles.statusMessage}>{error.error || 'Please check the URL and try again.'}</Text>
      {canRetry ? (
        <Pressable accessibilityRole="button" onPress={onRetry} style={styles.retryButton}>
          <Text style={styles.retryText}>Try again</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function DefaultCancel({ onCancel }: VerificationCancelRenderProps) {
  return (
    <Pressable
      accessibilityLabel="Cancel verification"
      accessibilityRole="button"
      hitSlop={10}
      onPress={onCancel}
      style={styles.cancelButton}
    >
      <Text style={styles.cancelIcon}>×</Text>
    </Pressable>
  );
}

function DefaultPermissionDenied({ onRetry, onOpenSettings, canOpenSettings }: VerificationPermissionRenderProps) {
  return (
    <View style={styles.statusCard}>
      <Text style={styles.errorIcon}>!</Text>
      <Text style={styles.statusTitle}>Camera and microphone access required</Text>
      <Text style={styles.statusMessage}>
        {canOpenSettings
          ? 'Camera or microphone access is blocked. Enable both permissions in Settings to continue.'
          : 'Allow camera and microphone access to continue with DigiSign verification.'}
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={canOpenSettings ? onOpenSettings : onRetry}
        style={styles.retryButton}
      >
        <Text style={styles.retryText}>{canOpenSettings ? 'Open Settings' : 'Allow access'}</Text>
      </Pressable>
    </View>
  );
}

function requiredPermissions(): Permission[] {
  return Platform.select({
    ios: [PERMISSIONS.IOS.CAMERA, PERMISSIONS.IOS.MICROPHONE],
    android: [PERMISSIONS.ANDROID.CAMERA, PERMISSIONS.ANDROID.RECORD_AUDIO],
    default: [],
  }) ?? [];
}

function permissionsGranted(statuses: Record<string, PermissionStatus>) {
  return Object.values(statuses).every(
    (status) => status === RESULTS.GRANTED || status === RESULTS.LIMITED,
  );
}

export function VerificationWebView({
  url,
  allowedOrigins = DIGISIGN_ALLOWED_ORIGINS,
  onCancel,
  onEvent,
  onNavigationStateChange,
  renderCancel,
  renderError,
  renderLoading,
  renderPermissionDenied,
}: VerificationWebViewProps) {
  const webViewRef = useRef<WebViewType>(null);
  const initialUrlAllowed = originAllowed(url, allowedOrigins);
  const [isLoading, setIsLoading] = useState(initialUrlAllowed);
  const [error, setError] = useState<VerificationEvent>();
  const [permissionStatuses, setPermissionStatuses] = useState<Record<string, PermissionStatus>>({});
  const [permissionChecking, setPermissionChecking] = useState(initialUrlAllowed);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [canOpenSettings, setCanOpenSettings] = useState(false);

  const requestPermissions = useCallback(async () => {
    const permissions = requiredPermissions();
    setPermissionChecking(true);
    if (permissions.length === 0) {
      setPermissionDenied(false);
      setPermissionChecking(false);
      return true;
    }

    try {
      const current = await checkMultiple(permissions);
      const missing = permissions.filter((permission) => {
        const status = current[permission];
        return status !== RESULTS.GRANTED && status !== RESULTS.LIMITED;
      });
      const next = missing.length > 0 ? await requestMultiple(missing) : current;
      const statuses = { ...current, ...next };

      setPermissionStatuses(statuses);
      setCanOpenSettings(
        Object.values(statuses).some(
          (status) => status === RESULTS.BLOCKED || status === RESULTS.RESTRICTED,
        ),
      );
      const granted = permissionsGranted(statuses);
      setPermissionDenied(!granted);
      if (!granted) {
        const event = { type: 'permission-denied' as const, error: 'Camera and microphone permissions are required.' };
        setError(event);
        onEvent?.(event);
      } else {
        setError(undefined);
      }
      return granted;
    } catch (permissionError) {
      const event = {
        type: 'permission-denied' as const,
        error: permissionError instanceof Error ? permissionError.message : 'Unable to request camera and microphone permissions.',
      };
      setError(event);
      setPermissionDenied(true);
      setCanOpenSettings(false);
      onEvent?.(event);
      return false;
    } finally {
      setPermissionChecking(false);
    }
  }, [onEvent]);

  const reportError = useCallback((nextError: VerificationEvent) => {
    setIsLoading(false);
    setError(nextError);
    onEvent?.(nextError);
  }, [onEvent]);

  useEffect(() => {
    if (initialUrlAllowed) return;
    reportError({
      type: 'invalid-origin',
      error: `Verification URL must use a DigiSign origin: ${allowedOrigins.join(', ')}`,
    });
  }, [allowedOrigins, initialUrlAllowed, reportError]);

  useEffect(() => {
    if (!initialUrlAllowed) return;
    void requestPermissions();
  }, [initialUrlAllowed, requestPermissions]);

  useEffect(() => {
    if (!permissionDenied) return;

    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        void requestPermissions();
      }
    });

    return () => subscription.remove();
  }, [permissionDenied, requestPermissions]);

  const retry = useCallback(() => {
    setError(undefined);
    setIsLoading(true);
    webViewRef.current?.reload();
  }, []);

  const retryPermissions = useCallback(() => {
    setError(undefined);
    void requestPermissions();
  }, [requestPermissions]);

  const openAppSettings = useCallback(async () => {
    try {
      await openSettings();
    } catch (settingsError) {
      const event = {
        type: 'permission-denied' as const,
        error: settingsError instanceof Error ? settingsError.message : 'Unable to open app settings.',
      };
      setError(event);
      onEvent?.(event);
    }
  }, [onEvent]);

  return (
    <View style={styles.container}>
      {initialUrlAllowed && !permissionChecking && !permissionDenied ? (
        <WebView
          ref={webViewRef}
          style={styles.webView}
          source={{ uri: url }}
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          mediaCapturePermissionGrantType="grantIfSameHostElseDeny"
          onShouldStartLoadWithRequest={(request) => originAllowed(request.url, allowedOrigins)}
          onLoadStart={() => {
            setError(undefined);
            setIsLoading(true);
            onEvent?.({ type: 'loading' });
          }}
          onLoadEnd={() => {
            setIsLoading(false);
            onEvent?.({ type: 'loaded' });
          }}
          onError={(event) => reportError({ type: 'webview-error', error: event.nativeEvent.description })}
          onHttpError={(event) => reportError({ type: 'webview-error', error: `DigiSign returned HTTP ${event.nativeEvent.statusCode}.` })}
          onNavigationStateChange={(state) => onNavigationStateChange?.(state.url)}
        />
      ) : null}

      {permissionDenied ? (
        <View style={styles.overlay}>
          {renderPermissionDenied ? (
            renderPermissionDenied({
              permissions: permissionStatuses,
              onRetry: retryPermissions,
              onOpenSettings: openAppSettings,
              canOpenSettings,
            })
          ) : (
            <DefaultPermissionDenied
              permissions={permissionStatuses}
              onRetry={retryPermissions}
              onOpenSettings={openAppSettings}
              canOpenSettings={canOpenSettings}
            />
          )}
        </View>
      ) : null}

      {isLoading && !error && !permissionDenied ? (
        <View pointerEvents="none" style={styles.overlay}>
          {renderLoading ? renderLoading() : <DefaultLoading />}
        </View>
      ) : null}

      {error && !permissionDenied ? (
        <View style={styles.overlay}>
          {renderError ? renderError({ error, onRetry: retry, canRetry: initialUrlAllowed }) : <DefaultError error={error} onRetry={retry} canRetry={initialUrlAllowed} />}
        </View>
      ) : null}

      {onCancel ? (
        <View style={styles.cancelContainer}>
          {renderCancel ? renderCancel({ onCancel }) : <DefaultCancel onCancel={onCancel} />}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  cancelButton: { alignItems: 'center', backgroundColor: 'rgba(17, 24, 39, 0.85)', borderRadius: 20, height: 40, justifyContent: 'center', width: 40 },
  cancelContainer: { position: 'absolute', right: 16, top: 16 },
  cancelIcon: { color: '#fff', fontSize: 28, fontWeight: '300', lineHeight: 30 },
  container: { backgroundColor: '#fff', flex: 1 },
  errorIcon: { backgroundColor: '#dc2626', borderRadius: 20, color: '#fff', fontSize: 24, fontWeight: '700', height: 40, lineHeight: 40, marginBottom: 16, overflow: 'hidden', textAlign: 'center', width: 40 },
  overlay: { alignItems: 'center', backgroundColor: '#fff', bottom: 0, justifyContent: 'center', left: 0, position: 'absolute', right: 0, top: 0 },
  retryButton: { backgroundColor: '#1d4ed8', borderRadius: 8, marginTop: 20, paddingHorizontal: 20, paddingVertical: 12 },
  retryText: { color: '#fff', fontWeight: '600' },
  statusCard: { alignItems: 'center', maxWidth: 320, padding: 24 },
  statusMessage: { color: '#6b7280', fontSize: 15, lineHeight: 22, textAlign: 'center' },
  statusTitle: { fontSize: 20, fontWeight: '700', marginBottom: 8, marginTop: 16, textAlign: 'center' },
  webView: { flex: 1 },
});
