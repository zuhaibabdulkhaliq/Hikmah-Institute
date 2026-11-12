import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import {
  View,
  Text as NativeText,
  TextInput as NativeTextInput,
  Pressable,
  StyleSheet,
  type TextProps,
  type TextInputProps,
} from "react-native";
import * as SecureStore from "expo-secure-store";
import {
  languageKey,
  languageOf,
  translate,
  type Language,
} from "@hikmah/ui-tokens/i18n";
import { colors } from "@hikmah/ui-tokens";
type Context = {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (text: string | number | null | undefined) => string;
};
const LanguageContext = createContext<Context>({
  language: "en",
  setLanguage: () => {},
  t: (text) => translate("en", text),
});
export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, update] = useState<Language>("en");
  useEffect(() => {
    void SecureStore.getItemAsync(languageKey)
      .then((value) => update(languageOf(value)))
      .catch(() => {});
  }, []);
  const setLanguage = useCallback((value: Language) => {
    update(value);
    void SecureStore.setItemAsync(languageKey, value).catch(() => {});
  }, []);
  const t = useCallback(
    (text: string | number | null | undefined) => translate(language, text),
    [language],
  );
  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}
export const useI18n = () => useContext(LanguageContext);
export function Text({ style, ...props }: TextProps) {
  const { language } = useI18n();
  return (
    <NativeText
      {...props}
      style={[
        style,
        language === "ur" && {
          writingDirection: "rtl",
          textAlign: "right",
          letterSpacing: 0,
          lineHeight: 28,
        },
      ]}
    />
  );
}
export function TextInput({ style, ...props }: TextInputProps) {
  const { language } = useI18n();
  const ltr =
    props.secureTextEntry ||
    props.keyboardType === "email-address" || props.keyboardType === "url" ||
    props.keyboardType === "numeric" ||
    props.keyboardType === "decimal-pad";
  return (
    <NativeTextInput
      {...props}
      style={[
        style,
        {
          writingDirection: ltr ? "ltr" : language === "ur" ? "rtl" : "ltr",
          textAlign: ltr ? "left" : language === "ur" ? "right" : "left",
        },
      ]}
    />
  );
}
export function LocalizedLabel({ children, ...props }: TextProps) {
  const { t } = useI18n();
  return (
    <Text {...props}>
      {typeof children === "string" ? t(children) : children}
    </Text>
  );
}
export function LanguageSwitch() {
  const { language, setLanguage } = useI18n();
  return (
    <View style={styles.row} accessibilityLabel="Language / زبان">
      {(["en", "ur"] as const).map((value) => (
        <Pressable
          key={value}
          onPress={() => setLanguage(value)}
          accessibilityRole="button"
          accessibilityState={{ selected: language === value }}
          style={[styles.button, language === value && styles.active]}
        >
          <NativeText
            style={{ color: language === value ? "white" : colors.primary }}
          >
            {value === "en" ? "English" : "اردو"}
          </NativeText>
        </Pressable>
      ))}
    </View>
  );
}
const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: 8,
    justifyContent: "flex-end",
    marginBottom: 18,
  },
  button: {
    padding: 12,
    minHeight: 48,
    borderRadius: 16,
    backgroundColor: colors.secondary,
    justifyContent: "center",
  },
  active: { backgroundColor: colors.primary },
});
