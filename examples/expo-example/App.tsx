import { useState } from "react";
import { Button, Pressable, SafeAreaView, StyleSheet, Text, TextInput, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import {
  VerificationWebView,
  type VerificationEvent,
  type VerificationPermissionRenderProps,
  type SigningStatus,
} from "@digisign/react-native-verification-sdk";

const defaultApiBaseUrl = "https://sandbox.usedigisign.dev";

export default function App() {
  const [requestPublicId, setRequestPublicId] = useState("");
  const [recipientPublicId, setRecipientPublicId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [workspaceId, setWorkspaceId] = useState("");
  const [apiBaseUrl, setApiBaseUrl] = useState(defaultApiBaseUrl);
  const [directUrl, setDirectUrl] = useState("");
  const [mode, setMode] = useState<"internal" | "url">("internal");
  const [active, setActive] = useState(false);
  const [lastEvent, setLastEvent] = useState<VerificationEvent>();
  const [lastStatus, setLastStatus] = useState<SigningStatus>();

  const internalConfigComplete = Boolean(
    requestPublicId && recipientPublicId && accessToken && workspaceId,
  );
  const canStart = mode === "internal" ? internalConfigComplete : Boolean(directUrl);

  if (active) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.webViewContainer}>
          {mode === "internal" ? (
            <VerificationWebView
              requestPublicId={requestPublicId}
              recipientPublicId={recipientPublicId}
              accessToken={accessToken}
              workspaceId={workspaceId}
              apiBaseUrl={apiBaseUrl}
              onCancel={() => setActive(false)}
              onEvent={setLastEvent}
              onSigningStatus={setLastStatus}
              onTerminal={setLastStatus}
              renderPermissionDenied={(props) => <PermissionDeniedView {...props} />}
            />
          ) : (
            <VerificationWebView
              url={directUrl}
              onCancel={() => setActive(false)}
              onEvent={setLastEvent}
              renderPermissionDenied={(props) => <PermissionDeniedView {...props} />}
            />
          )}
        </View>
        <View style={styles.eventBar}>
          <Text style={styles.event}>
            {lastEvent ? `Event: ${lastEvent.type}` : "Starting verification…"}
          </Text>
          {lastStatus ? (
            <Text style={styles.event}>
              Request: {lastStatus.request_status} · Recipient: {lastStatus.recipient_status}
            </Text>
          ) : null}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>DigiSign Verification</Text>
        <Text style={styles.subtitle}>Internal signing-link retrieval demo</Text>
        <View style={styles.modeSwitch}>
          <ModeButton
            label="Service API"
            active={mode === "internal"}
            onPress={() => setMode("internal")}
          />
          <ModeButton label="Direct URL" active={mode === "url"} onPress={() => setMode("url")} />
        </View>

        {mode === "internal" ? (
          <>
            <Field
              label="Request public ID"
              value={requestPublicId}
              onChangeText={setRequestPublicId}
            />
            <Field
              label="Recipient public ID"
              value={recipientPublicId}
              onChangeText={setRecipientPublicId}
            />
            <Field
              label="Short-lived session token"
              value={accessToken}
              onChangeText={setAccessToken}
              secureTextEntry
            />
            <Field label="Workspace public ID" value={workspaceId} onChangeText={setWorkspaceId} />
            <Field label="API base URL" value={apiBaseUrl} onChangeText={setApiBaseUrl} />
            <Text style={styles.helpText}>
              Use a short-lived session token. Never put a permanent API key in the app.
            </Text>
          </>
        ) : (
          <>
            <Text style={styles.label}>Existing DigiSign verification URL</Text>
            <TextInput
              value={directUrl}
              onChangeText={setDirectUrl}
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.input}
              placeholder="https://usedigisign.dev/..."
            />
          </>
        )}
        <Button title="Open verification" disabled={!canStart} onPress={() => setActive(true)} />
      </View>
      <StatusBar style="auto" />
    </SafeAreaView>
  );
}

function Field({
  label,
  value,
  onChangeText,
  secureTextEntry = false,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  secureTextEntry?: boolean;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry={secureTextEntry}
        style={styles.input}
      />
    </View>
  );
}

function ModeButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.modeButton, active && styles.modeButtonActive]}
    >
      <Text style={[styles.modeButtonText, active && styles.modeButtonTextActive]}>{label}</Text>
    </Pressable>
  );
}

function PermissionDeniedView({
  permissions,
  onRetry,
  onOpenSettings,
  canOpenSettings,
}: VerificationPermissionRenderProps) {
  return (
    <View style={styles.permissionCard}>
      <Text style={styles.permissionTitle}>Permissions needed</Text>
      <Text style={styles.permissionMessage}>
        DigiSign needs camera and microphone access to continue verification.
      </Text>
      <View style={styles.permissionList}>
        {Object.entries(permissions).map(([permission, status]) => (
          <Text key={permission} style={styles.permissionStatus}>
            {permission}: {status}
          </Text>
        ))}
      </View>
      <Pressable
        accessibilityRole="button"
        onPress={canOpenSettings ? onOpenSettings : onRetry}
        style={styles.permissionButton}
      >
        <Text style={styles.permissionButtonText}>
          {canOpenSettings ? "Open Settings" : "Allow permissions"}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  content: { flex: 1, justifyContent: "center", gap: 12, padding: 24 },
  event: { color: "#4b5563", fontSize: 12, paddingHorizontal: 12, paddingTop: 4 },
  eventBar: { backgroundColor: "#f3f4f6", paddingBottom: 10, paddingTop: 6 },
  field: { gap: 4 },
  helpText: { color: "#6b7280", fontSize: 12, lineHeight: 18 },
  input: { borderColor: "#c7c7cc", borderRadius: 8, borderWidth: 1, padding: 12 },
  label: { color: "#374151", fontSize: 14 },
  modeButton: {
    alignItems: "center",
    borderColor: "#d1d5db",
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    padding: 10,
  },
  modeButtonActive: { backgroundColor: "#1d4ed8", borderColor: "#1d4ed8" },
  modeButtonText: { color: "#374151", fontWeight: "600" },
  modeButtonTextActive: { color: "#fff" },
  modeSwitch: { flexDirection: "row", gap: 8, marginBottom: 4 },
  permissionButton: {
    backgroundColor: "#1d4ed8",
    borderRadius: 8,
    marginTop: 20,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  permissionButtonText: { color: "#fff", fontWeight: "600" },
  permissionCard: { alignItems: "center", maxWidth: 340, padding: 24 },
  permissionList: { alignSelf: "stretch", marginTop: 16 },
  permissionMessage: { color: "#6b7280", fontSize: 15, lineHeight: 22, textAlign: "center" },
  permissionStatus: { color: "#4b5563", fontSize: 12, marginTop: 4 },
  permissionTitle: { fontSize: 22, fontWeight: "700", marginBottom: 8 },
  subtitle: { color: "#6b7280", marginBottom: 8 },
  title: { fontSize: 28, fontWeight: "700", marginBottom: 4 },
  webViewContainer: { flex: 1 },
});
