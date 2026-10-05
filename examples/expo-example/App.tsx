import { useState } from "react";
import { Button, Pressable, SafeAreaView, StyleSheet, Text, TextInput, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import {
  VerificationWebView,
  type VerificationEvent,
  type VerificationPermissionRenderProps,
} from "@digisign/react-native-verification-sdk";

const defaultUrl = "https://usedigisign.dev/";

export default function App() {
  const [url, setUrl] = useState(defaultUrl);
  const [activeUrl, setActiveUrl] = useState<string>();
  const [lastEvent, setLastEvent] = useState<VerificationEvent>();

  if (activeUrl) {
    return (
      <SafeAreaView style={styles.container}>
        <VerificationWebView
          url={activeUrl}
          onCancel={() => setActiveUrl(undefined)}
          onEvent={setLastEvent}
          renderPermissionDenied={(props) => <PermissionDeniedView {...props} />}
        />
        <Text style={styles.event}>
          {lastEvent ? `Status: ${lastEvent.type}` : "Starting verification…"}
        </Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>DigiSign Verification</Text>
        <Text style={styles.label}>Verification URL from DigiSign</Text>
        <TextInput value={url} onChangeText={setUrl} autoCapitalize="none" style={styles.input} />
        <Button title="Open verification" onPress={() => setActiveUrl(url)} />
      </View>
      <StatusBar style="auto" />
    </SafeAreaView>
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
  content: { flex: 1, justifyContent: "center", gap: 16, padding: 24 },
  title: { fontSize: 28, fontWeight: "700", marginBottom: 12 },
  input: { borderColor: "#c7c7cc", borderRadius: 8, borderWidth: 1, padding: 12 },
  label: { fontSize: 14, color: "#555" },
  event: { padding: 12, fontSize: 12 },
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
});
