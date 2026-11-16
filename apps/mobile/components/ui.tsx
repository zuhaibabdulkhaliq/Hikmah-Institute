import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
  type RefObject,
  type ComponentRef,
} from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  FlatList,
  StyleSheet,
  Switch,
  View,
  type ViewStyle,
} from "react-native";
import { BlurView } from "expo-blur";
import { normalizeNumericInput } from "@hikmah/api-client";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@hikmah/ui-tokens";
import { Text, TextInput, useI18n } from "./language";
export const GlassTargetContext = createContext<
  RefObject<ComponentRef<typeof View> | null> | undefined
>(undefined);
export const ui = StyleSheet.create({
  card: {
    padding: 20,
    borderRadius: 26,
    backgroundColor: "rgba(255,255,255,0.88)",
    borderColor: "rgba(255,255,255,0.98)",
    borderWidth: 1,
    marginBottom: 16,
    boxShadow: "0 8px 28px rgba(24,78,118,0.05)",
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.ink,
    marginBottom: 8,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.ink,
    marginBottom: 7,
  },
  muted: { color: colors.muted, fontSize: 13, lineHeight: 21 },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    alignItems: "center",
  },
  input: {
    minHeight: 50,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 16,
    padding: 14,
    color: colors.ink,
    backgroundColor: "rgba(255,255,255,0.9)",
    fontSize: 15,
  },
  divider: {
    height: 1,
    backgroundColor: colors.line,
    opacity: 0.5,
    marginVertical: 15,
  },
});
export function Glass({
  children,
  style,
}: {
  children: ReactNode;
  style?: ViewStyle;
}) {
  const [reduced, setReduced] = useState(false);
  const target = useContext(GlassTargetContext);
  useEffect(() => {
    void AccessibilityInfo.isReduceTransparencyEnabled?.().then(setReduced);
    const sub = AccessibilityInfo.addEventListener(
      "reduceTransparencyChanged",
      setReduced,
    );
    return () => sub.remove();
  }, []);
  return (
    <View style={[{ overflow: "hidden", borderRadius: 26 }, style]}>
      {!reduced && (Platform.OS !== "android" || !!target) && (
        <BlurView
          pointerEvents="none"
          intensity={65}
          blurTarget={target}
          blurMethod="dimezisBlurViewSdk31Plus"
          tint="light"
          style={StyleSheet.absoluteFill}
        />
      )}
      <View
        style={{
          flex: style?.flex ? 1 : undefined,
          backgroundColor:
            reduced ||
            (Platform.OS === "android" && Number(Platform.Version) < 31)
              ? "#f9fcff"
              : "rgba(255,255,255,0.76)",
        }}
      >
        {children}
      </View>
    </View>
  );
}
export function Card({
  title,
  description,
  children,
  id,
}: {
  title?: string;
  id?: string;
  description?: string;
  children?: ReactNode;
}) {
  const { t } = useI18n();
  return (
    <View testID={id ?? (title ? `card-${title}` : undefined)} style={ui.card}>
      {!!title && (
        <Text accessibilityRole="header" style={ui.title}>
          {t(title)}
        </Text>
      )}
      {!!description && (
        <Text style={[ui.muted, { marginBottom: 16 }]}>{t(description)}</Text>
      )}
      {children}
    </View>
  );
}
export function Button({
  title,
  onPress,
  secondary = false,
  danger = false,
  disabled = false,
  loading = false,
  icon,
}: {
  title: string;
  onPress: () => void;
  secondary?: boolean;
  danger?: boolean;
  disabled?: boolean;
  loading?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  const { t } = useI18n();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t(title)}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 50,
        paddingVertical: 13,
        paddingHorizontal: 17,
        borderRadius: 17,
        backgroundColor: danger
          ? colors.danger
          : secondary
            ? colors.secondary
            : colors.primary,
        opacity: disabled || pressed ? 0.55 : 1,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 9,
        marginVertical: 5,
      })}
    >
      {loading ? (
        <ActivityIndicator color={secondary ? colors.primary : "white"} />
      ) : (
        icon && (
          <Ionicons
            name={icon}
            color={secondary ? colors.primary : "white"}
            size={19}
          />
        )
      )}
      <Text
        style={{
          color: secondary && !danger ? colors.primary : "white",
          fontSize: 14,
          fontWeight: "600",
          flexShrink: 1,
          textAlign: "center",
        }}
      >
        {t(title)}
      </Text>
    </Pressable>
  );
}
export function Field({
  label,
  value,
  onChange,
  type = "text",
  hint,
  disabled = false,
  required = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?:
    | "text"
    | "number"
    | "date"
    | "password"
    | "multiline"
    | "email"
    | "url";
  hint?: string;
  disabled?: boolean;
  required?: boolean;
}) {
  const { t } = useI18n();
  const [focused, setFocused] = useState(false),
    [buffer, setBuffer] = useState(value);
  useEffect(() => {
    if (!focused) setBuffer(value);
  }, [value, focused]);
  return (
    <View style={{ marginBottom: 15 }}>
      <Text style={ui.label}>
        {t(label)}
        {required ? " *" : ""}
      </Text>
      <TextInput
        accessibilityLabel={t(label)}
        value={type === "number" && focused ? buffer : value}
        onFocus={() => {
          setBuffer(value);
          setFocused(true);
        }}
        onBlur={() => setFocused(false)}
        onChangeText={(v) => {
          const input = ["number", "date"].includes(type)
            ? normalizeNumericInput(v)
            : v;
          setBuffer(input);
          onChange(input);
        }}
        editable={!disabled}
        secureTextEntry={type === "password"}
        autoCapitalize={
          ["email", "url", "password", "number", "date"].includes(type)
            ? "none"
            : "sentences"
        }
        autoCorrect={
          !["email", "url", "password", "date", "number"].includes(type)
        }
        keyboardType={
          type === "date"
            ? "numbers-and-punctuation"
            : type === "number"
              ? "decimal-pad"
              : type === "email"
                ? "email-address"
                : type === "url"
                  ? "url"
                  : "default"
        }
        multiline={type === "multiline"}
        placeholder={type === "date" ? "YYYY-MM-DD" : undefined}
        placeholderTextColor={colors.muted}
        style={[
          ui.input,
          type === "multiline" && { minHeight: 120, textAlignVertical: "top" },
          disabled && { opacity: 0.6 },
        ]}
      />
      {!!hint && <Text style={[ui.muted, { marginTop: 5 }]}>{t(hint)}</Text>}
    </View>
  );
}
export type Option = { value: string; label: string; raw?: boolean };
export function Choice({
  label,
  value,
  onChange,
  options,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Option[];
  disabled?: boolean;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false),
    [search, setSearch] = useState("");
  const selected = options.find((o) => o.value === value);
  return (
    <View style={{ marginBottom: 15 }}>
      <Text style={ui.label}>{t(label)}</Text>
      <Pressable
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={t(label)}
        accessibilityValue={{
          text: selected
            ? selected.raw
              ? selected.label
              : t(selected.label)
            : t("Choose"),
        }}
        onPress={() => {
          setSearch("");
          setOpen(true);
        }}
        style={[
          ui.input,
          {
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            opacity: disabled ? 0.5 : 1,
          },
        ]}
      >
        <Text style={{ color: colors.ink, flex: 1 }}>
          {selected?.raw ? selected.label : t(selected?.label || "Choose")}
        </Text>
        <Ionicons name="chevron-down" color={colors.primary} size={18} />
      </Pressable>
      <Modal
        visible={open}
        transparent
        animationType="slide"
        onRequestClose={() => setOpen(false)}
      >
        <View
          style={{
            flex: 1,
            justifyContent: "flex-end",
            backgroundColor: "rgba(15,40,65,0.32)",
          }}
        >
          <Pressable
            style={{ flex: 1 }}
            accessibilityLabel={t("Close")}
            onPress={() => setOpen(false)}
          />
          <View
            accessibilityViewIsModal
            style={{
              maxHeight: "80%",
              backgroundColor: "#f4f9fe",
              borderTopLeftRadius: 30,
              borderTopRightRadius: 30,
              padding: 24,
              paddingBottom: 36,
            }}
          >
            <Text style={ui.title}>{t(label)}</Text>
            <Field label="Search" value={search} onChange={setSearch} />
            <FlatList
              keyboardShouldPersistTaps="handled"
              style={{ flexShrink: 1, flexGrow: 0, minHeight: 0 }}
              data={options.filter((o) =>
                (o.raw ? o.label : t(o.label))
                  .toLocaleLowerCase()
                  .includes(search.toLocaleLowerCase()),
              )}
              keyExtractor={(o) => o.value}
              initialNumToRender={20}
              maxToRenderPerBatch={20}
              windowSize={5}
              extraData={value}
              renderItem={({ item: o }) => (
                <Pressable
                  key={o.value}
                  accessibilityRole="radio"
                  accessibilityLabel={o.raw ? o.label : t(o.label)}
                  accessibilityState={{ checked: value === o.value }}
                  onPress={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                  style={{
                    padding: 16,
                    borderRadius: 16,
                    marginBottom: 6,
                    backgroundColor:
                      value === o.value ? colors.secondary : "white",
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                  }}
                >
                  <Text style={{ flex: 1, color: colors.ink }}>
                    {o.raw ? o.label : t(o.label)}
                  </Text>
                  {value === o.value && (
                    <Ionicons
                      name="checkmark-circle"
                      color={colors.primary}
                      size={22}
                    />
                  )}
                </Pressable>
              )}
            />
            <Button title="Close" secondary onPress={() => setOpen(false)} />
          </View>
        </View>
      </Modal>
    </View>
  );
}
export function Toggle({
  label,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  return (
    <View
      style={[ui.row, { justifyContent: "space-between", marginVertical: 10 }]}
    >
      <Text style={{ flex: 1, color: colors.ink }}>{t(label)}</Text>
      <Switch
        accessibilityLabel={t(label)}
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        trackColor={{ true: colors.primary, false: colors.line }}
      />
    </View>
  );
}
export function Notice({
  text,
  error = false,
}: {
  text: string;
  error?: boolean;
}) {
  const { t } = useI18n();
  return (
    <View
      accessibilityRole={error ? "alert" : undefined}
      style={{
        padding: 15,
        borderRadius: 18,
        backgroundColor: error ? colors.dangerSurface : colors.secondary,
        marginVertical: 10,
      }}
    >
      <Text
        style={{
          color: error ? colors.danger : colors.primary,
          lineHeight: 22,
        }}
      >
        {t(text)}
      </Text>
    </View>
  );
}
export function Disclosure({
  title,
  children,
  initial = false,
}: {
  title: string;
  children: ReactNode;
  initial?: boolean;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(initial);
  return (
    <Card id={`section-${title}`}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t(title)}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(!open)}
        style={[ui.row, { justifyContent: "space-between", minHeight: 44 }]}
      >
        <Text style={[ui.title, { flex: 1, marginBottom: 0 }]}>{t(title)}</Text>
        <Ionicons
          name={open ? "chevron-up" : "chevron-down"}
          size={20}
          color={colors.primary}
        />
      </Pressable>
      {open && <View style={{ marginTop: 20 }}>{children}</View>}
    </Card>
  );
}
export function Empty({ text = "No records yet." }: { text?: string }) {
  const { t } = useI18n();
  return (
    <View
      style={{
        padding: 24,
        backgroundColor: colors.paper,
        borderRadius: 18,
        marginVertical: 8,
      }}
    >
      <Ionicons name="file-tray-outline" color={colors.muted} size={26} />
      <Text style={[ui.muted, { marginTop: 10 }]}>{t(text)}</Text>
    </View>
  );
}
