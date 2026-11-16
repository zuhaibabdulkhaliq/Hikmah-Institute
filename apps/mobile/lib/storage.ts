import * as NativeSecureStore from "expo-secure-store";
import { Platform } from "react-native";
// Native tokens use the OS keychain. Browser preview tokens live only in memory.
const memory = new Map<string, string>();
export const getItemAsync = async (key: string): Promise<string | null> =>
  Platform.OS === "web"
    ? (memory.get(key) ?? null)
    : NativeSecureStore.getItemAsync(key);
export const setItemAsync = async (key: string, value: string) => {
  if (Platform.OS === "web") memory.set(key, value);
  else await NativeSecureStore.setItemAsync(key, value);
};
export const deleteItemAsync = async (key: string) => {
  if (Platform.OS === "web") memory.delete(key);
  else await NativeSecureStore.deleteItemAsync(key);
};
