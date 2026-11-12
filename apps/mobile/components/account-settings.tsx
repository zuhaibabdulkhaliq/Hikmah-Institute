import { useState } from "react";
import { View, Pressable, StyleSheet } from "react-native";
import { Text, TextInput, useI18n } from "./language";
import { colors } from "@hikmah/ui-tokens";
import type { createClient } from "@hikmah/api-client";
export function AccountSettings({
  request,
  onChanged,
}: {
  request: ReturnType<typeof createClient>;
  onChanged: () => Promise<void>;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false),
    [currentPassword, setCurrent] = useState(""),
    [password, setPassword] = useState(""),
    [confirm, setConfirm] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <View style={styles.card}>
      <Pressable
        accessibilityRole="button"
        style={styles.button}
        onPress={() => setOpen(!open)}
      >
        <Text>{t("Change my password")}</Text>
      </Pressable>
      {open && (
        <>
          <Text>
            {t(
              "Use 12–128 characters. Changing your password signs you out on every device.",
            )}
          </Text>
          <TextInput
            style={styles.input}
            accessibilityLabel={t("Current password")}
            placeholder={t("Current password")}
            secureTextEntry
            autoComplete="current-password"
            value={currentPassword}
            onChangeText={setCurrent}
            maxLength={128}
            editable={!busy}
          />
          <TextInput
            style={styles.input}
            accessibilityLabel={t("New password")}
            placeholder={t("New password")}
            secureTextEntry
            autoComplete="new-password"
            value={password}
            onChangeText={setPassword}
            maxLength={128}
            editable={!busy}
          />
          <TextInput
            style={styles.input}
            accessibilityLabel={t("Confirm new password")}
            placeholder={t("Confirm new password")}
            secureTextEntry
            value={confirm}
            onChangeText={setConfirm}
            maxLength={128}
            editable={!busy}
          />
          {!!error && <Text accessibilityRole="alert">{t(error)}</Text>}
          <Pressable
            accessibilityRole="button"
            style={styles.button}
            disabled={busy}
            onPress={async () => {
              if (password !== confirm) {
                setError("Passwords do not match.");
                return;
              }
              if (password.length < 12) {
                setError("Password must contain at least 12 characters.");
                return;
              }
              setBusy(true);
              setError("");
              try {
                await request("/v1/me/password", {
                  method: "PUT",
                  body: JSON.stringify({ currentPassword, password }),
                });
                setCurrent("");
                setPassword("");
                setConfirm("");
                await onChanged();
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <Text>{t(busy ? "Saving password…" : "Change password")}</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  card: {
    padding: 16,
    borderRadius: 24,
    backgroundColor: colors.surface,
    marginVertical: 12,
  },
  input: {
    minHeight: 48,
    borderColor: colors.line,
    borderWidth: 1,
    padding: 12,
    borderRadius: 16,
    marginVertical: 8,
  },
  button: {
    minHeight: 48,
    justifyContent: "center",
    padding: 12,
    borderRadius: 16,
    backgroundColor: colors.secondary,
  },
});
