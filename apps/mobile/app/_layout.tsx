import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { LanguageProvider } from "../components/language";
export default function Layout() {
  return (
    <SafeAreaProvider>
      <LanguageProvider>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false }} />
      </LanguageProvider>
    </SafeAreaProvider>
  );
}
