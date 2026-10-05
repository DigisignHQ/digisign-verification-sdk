import React, { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  AppState,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  checkMultiple,
  PERMISSIONS,
  requestMultiple,
  RESULTS,
  openSettings,
  type Permission,
  type PermissionStatus,
} from "react-native-permissions";
import { WebView, type WebView as WebViewType } from "react-native-webview";
import {
  DEFAULT_DIGISIGN_API_BASE_URL,
  fetchSigningAccess,
  fetchSigningStatus,
  type SigningStatus,
} from "./digisignApi";

export const DIGISIGN_ALLOWED_ORIGINS = [
  "https://usedigisign.com",
  "https://usedigisign.dev",
] as const;
export type VerificationEventType =
  | "access-loading"
  | "access-loaded"
  | "access-error"
  | "loading"
  | "loaded"
  | "webview-error"
  | "invalid-origin"
  | "permission-denied"
  | "status-update"
  | "signed"
  | "completed"
  | "rejected"
  | "expired"
  | "voided"
  | "do-not-trust";
export type VerificationEvent = {
  type: VerificationEventType;
  error?: string;
  status?: SigningStatus;
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
  /** Use this for an already-created DigiSign verification link. */
  url?: string;
  /** When supplied, the SDK obtains the link and polls status internally. */
  requestPublicId?: string;
  recipientPublicId?: string;
  /** Short-lived session JWT. Never use a permanent API key in the app. */
  accessToken?: string;
  /** Workspace public identifier sent as x-ws-identifier. */
  workspaceId?: string;
  /** Defaults to the sandbox API; configure the production API URL in production. */
  apiBaseUrl?: string;
  pollIntervalMs?: number;
  allowedOrigins?: readonly string[];
  onCancel?: () => void;
  onEvent?: (event: VerificationEvent) => void;
  onSigningStatus?: (status: SigningStatus) => void;
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
      return (
        candidate.protocol === "https:" &&
        allowed.protocol === "https:" &&
        (candidate.hostname === allowed.hostname ||
          candidate.hostname.endsWith(`.${allowed.hostname}`))
      );
    });
  } catch {
    return false;
  }
}
function requiredPermissions(): Permission[] {
  return (
    Platform.select({
      ios: [PERMISSIONS.IOS.CAMERA, PERMISSIONS.IOS.MICROPHONE],
      android: [PERMISSIONS.ANDROID.CAMERA, PERMISSIONS.ANDROID.RECORD_AUDIO],
      default: [],
    }) ?? []
  );
}
function permissionsGranted(statuses: Record<string, PermissionStatus>) {
  return Object.values(statuses).every(
    (status) => status === RESULTS.GRANTED || status === RESULTS.LIMITED,
  );
}
function terminalStatus(status: SigningStatus) {
  return (
    status.expired ||
    ["completed", "rejected", "expired", "voided", "do_not_trust"].includes(
      status.request_status.toLowerCase(),
    )
  );
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
      <Text style={styles.statusMessage}>{error.error || "Please try again."}</Text>
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
function DefaultPermissionDenied({
  onRetry,
  onOpenSettings,
  canOpenSettings,
}: VerificationPermissionRenderProps) {
  return (
    <View style={styles.statusCard}>
      <Text style={styles.errorIcon}>!</Text>
      <Text style={styles.statusTitle}>Camera and microphone access required</Text>
      <Text style={styles.statusMessage}>
        {canOpenSettings
          ? "Camera or microphone access is blocked. Enable both permissions in Settings to continue."
          : "Allow camera and microphone access to continue with DigiSign verification."}
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={canOpenSettings ? onOpenSettings : onRetry}
        style={styles.retryButton}
      >
        <Text style={styles.retryText}>{canOpenSettings ? "Open Settings" : "Allow access"}</Text>
      </Pressable>
    </View>
  );
}

export function VerificationWebView({
  url,
  requestPublicId,
  recipientPublicId,
  accessToken,
  workspaceId,
  apiBaseUrl = DEFAULT_DIGISIGN_API_BASE_URL,
  pollIntervalMs = 4000,
  allowedOrigins = DIGISIGN_ALLOWED_ORIGINS,
  onCancel,
  onEvent,
  onSigningStatus,
  onNavigationStateChange,
  renderCancel,
  renderError,
  renderLoading,
  renderPermissionDenied,
}: VerificationWebViewProps) {
  const webViewRef = useRef<WebViewType>(null);
  const abortRef = useRef<AbortController | null>(null);
  const internalMode = Boolean(requestPublicId || recipientPublicId || accessToken || workspaceId);
  const configComplete = Boolean(
    requestPublicId && recipientPublicId && accessToken && workspaceId,
  );
  const [resolvedUrl, setResolvedUrl] = useState(url);
  const [isLoading, setIsLoading] = useState(!url);
  const [error, setError] = useState<VerificationEvent>();
  const [permissionStatuses, setPermissionStatuses] = useState<Record<string, PermissionStatus>>(
    {},
  );
  const [permissionChecking, setPermissionChecking] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [canOpenSettings, setCanOpenSettings] = useState(false);
  const emit = useCallback(
    (event: VerificationEvent) => {
      onEvent?.(event);
    },
    [onEvent],
  );
  const reportError = useCallback(
    (nextError: VerificationEvent) => {
      setIsLoading(false);
      setError(nextError);
      emit(nextError);
    },
    [emit],
  );
  const requestPermissions = useCallback(async () => {
    const permissions = requiredPermissions();
    setPermissionChecking(true);
    if (!permissions.length) {
      setPermissionDenied(false);
      setPermissionChecking(false);
      return true;
    }
    try {
      const current = await checkMultiple(permissions);
      const missing = permissions.filter(
        (permission) =>
          current[permission] !== RESULTS.GRANTED && current[permission] !== RESULTS.LIMITED,
      );
      const statuses = { ...current, ...(missing.length ? await requestMultiple(missing) : {}) };
      setPermissionStatuses(statuses);
      setCanOpenSettings(Object.values(statuses).some((status) => status === RESULTS.BLOCKED));
      const granted = permissionsGranted(statuses);
      setPermissionDenied(!granted);
      if (!granted)
        reportError({
          type: "permission-denied",
          error: "Camera and microphone permissions are required.",
        });
      else setError(undefined);
      return granted;
    } catch (permissionError) {
      reportError({
        type: "permission-denied",
        error:
          permissionError instanceof Error
            ? permissionError.message
            : "Unable to request camera and microphone permissions.",
      });
      setPermissionDenied(true);
      return false;
    } finally {
      setPermissionChecking(false);
    }
  }, [reportError]);
  const loadAccess = useCallback(async () => {
    if (!internalMode) {
      setResolvedUrl(url);
      return;
    }
    if (!configComplete) {
      reportError({
        type: "access-error",
        error: "requestPublicId, recipientPublicId, accessToken, and workspaceId are required.",
      });
      return;
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setError(undefined);
    setResolvedUrl(undefined);
    setIsLoading(true);
    emit({ type: "access-loading" });
    try {
      const access = await fetchSigningAccess({
        apiBaseUrl,
        requestPublicId: requestPublicId!,
        recipientPublicId: recipientPublicId!,
        accessToken: accessToken!,
        workspaceId: workspaceId!,
        signal: controller.signal,
      });
      if (!originAllowed(access.link, allowedOrigins))
        throw new Error("DigiSign returned a verification link outside the allowed origins.");
      setResolvedUrl(access.link);
      emit({ type: "access-loaded" });
    } catch (accessError) {
      if (!controller.signal.aborted)
        reportError({
          type: "access-error",
          error:
            accessError instanceof Error
              ? accessError.message
              : "Unable to fetch the verification link.",
        });
    }
  }, [
    accessToken,
    allowedOrigins,
    apiBaseUrl,
    configComplete,
    emit,
    internalMode,
    recipientPublicId,
    reportError,
    requestPublicId,
    url,
    workspaceId,
  ]);
  useEffect(() => {
    void loadAccess();
    return () => abortRef.current?.abort();
  }, [loadAccess]);
  useEffect(() => {
    if (!resolvedUrl) return;
    if (!originAllowed(resolvedUrl, allowedOrigins)) {
      reportError({
        type: "invalid-origin",
        error: `Verification URL must use a DigiSign origin: ${allowedOrigins.join(", ")}`,
      });
      return;
    }
    void requestPermissions();
  }, [allowedOrigins, requestPermissions, reportError, resolvedUrl]);
  useEffect(() => {
    if (!permissionDenied) return;
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") void requestPermissions();
    });
    return () => subscription.remove();
  }, [permissionDenied, requestPermissions]);
  useEffect(() => {
    if (!internalMode || !configComplete || !resolvedUrl) return;
    let cancelled = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      try {
        const status = await fetchSigningStatus({
          apiBaseUrl,
          requestPublicId: requestPublicId!,
          recipientPublicId: recipientPublicId!,
          accessToken: accessToken!,
          workspaceId: workspaceId!,
        });
        if (cancelled) return;
        onSigningStatus?.(status);
        emit({ type: "status-update", status });
        const normalized = status.request_status.toLowerCase();
        if (status.recipient_status.toLowerCase() === "signed") emit({ type: "signed", status });
        if (normalized === "completed") emit({ type: "completed", status });
        else if (normalized === "rejected") emit({ type: "rejected", status });
        else if (normalized === "expired" || status.expired) emit({ type: "expired", status });
        else if (normalized === "voided") emit({ type: "voided", status });
        else if (normalized === "do_not_trust") emit({ type: "do-not-trust", status });
        if (!terminalStatus(status))
          timeout = setTimeout(() => void poll(), Math.max(3000, pollIntervalMs));
      } catch (statusError) {
        if (!cancelled) {
          emit({
            type: "access-error",
            error:
              statusError instanceof Error
                ? statusError.message
                : "Unable to fetch signing status.",
          });
          timeout = setTimeout(() => void poll(), Math.max(3000, pollIntervalMs));
        }
      }
    };
    void poll();
    return () => {
      cancelled = true;
      if (timeout) clearTimeout(timeout);
    };
  }, [
    accessToken,
    apiBaseUrl,
    configComplete,
    emit,
    internalMode,
    onSigningStatus,
    pollIntervalMs,
    recipientPublicId,
    requestPublicId,
    resolvedUrl,
    workspaceId,
  ]);
  const retry = useCallback(() => {
    setError(undefined);
    setIsLoading(true);
    if (internalMode) void loadAccess();
    else webViewRef.current?.reload();
  }, [internalMode, loadAccess]);
  const retryPermissions = useCallback(() => {
    setError(undefined);
    void requestPermissions();
  }, [requestPermissions]);
  const openAppSettings = useCallback(async () => {
    try {
      await openSettings();
    } catch (settingsError) {
      reportError({
        type: "permission-denied",
        error:
          settingsError instanceof Error ? settingsError.message : "Unable to open app settings.",
      });
    }
  }, [reportError]);
  return (
    <View style={styles.container}>
      {resolvedUrl && !permissionChecking && !permissionDenied && !error ? (
        <WebView
          ref={webViewRef}
          style={styles.webView}
          source={{ uri: resolvedUrl }}
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          mediaCapturePermissionGrantType="grantIfSameHostElseDeny"
          onShouldStartLoadWithRequest={(request) => originAllowed(request.url, allowedOrigins)}
          onLoadStart={() => {
            setError(undefined);
            setIsLoading(true);
            emit({ type: "loading" });
          }}
          onLoadEnd={() => {
            setIsLoading(false);
            emit({ type: "loaded" });
          }}
          onError={(event) =>
            reportError({ type: "webview-error", error: event.nativeEvent.description })
          }
          onHttpError={(event) =>
            reportError({
              type: "webview-error",
              error: `DigiSign returned HTTP ${event.nativeEvent.statusCode}.`,
            })
          }
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
          {renderError ? (
            renderError({ error, onRetry: retry, canRetry: true })
          ) : (
            <DefaultError error={error} onRetry={retry} canRetry />
          )}
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
  cancelButton: {
    alignItems: "center",
    backgroundColor: "rgba(17, 24, 39, 0.85)",
    borderRadius: 20,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  cancelContainer: { position: "absolute", right: 16, top: 16 },
  cancelIcon: { color: "#fff", fontSize: 28, fontWeight: "300", lineHeight: 30 },
  container: { backgroundColor: "#fff", flex: 1 },
  errorIcon: {
    backgroundColor: "#dc2626",
    borderRadius: 20,
    color: "#fff",
    fontSize: 24,
    fontWeight: "700",
    height: 40,
    lineHeight: 40,
    marginBottom: 16,
    overflow: "hidden",
    textAlign: "center",
    width: 40,
  },
  overlay: {
    alignItems: "center",
    backgroundColor: "#fff",
    bottom: 0,
    justifyContent: "center",
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
  retryButton: {
    backgroundColor: "#1d4ed8",
    borderRadius: 8,
    marginTop: 20,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  retryText: { color: "#fff", fontWeight: "600" },
  statusCard: { alignItems: "center", maxWidth: 320, padding: 24 },
  statusMessage: { color: "#6b7280", fontSize: 15, lineHeight: 22, textAlign: "center" },
  statusTitle: {
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 8,
    marginTop: 16,
    textAlign: "center",
  },
  webView: { flex: 1 },
});
