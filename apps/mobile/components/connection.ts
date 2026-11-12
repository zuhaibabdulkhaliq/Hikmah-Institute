import * as SecureStore from "expo-secure-store";
import { createClient, normalizeServerURL } from "@hikmah/api-client";
const serverKey = "hikmah-server";
export const initialServer = process.env.EXPO_PUBLIC_API_URL ?? "";
export async function serverURL() {
  return normalizeServerURL(
    (await SecureStore.getItemAsync(serverKey)) ?? initialServer,
    __DEV__,
  );
}
export async function configureServer(value: string) {
  const url = normalizeServerURL(value, __DEV__);
  const previous = (await SecureStore.getItemAsync(serverKey)) ?? initialServer;
  // A session is scoped to one institute server. Never forward it to a new host.
  if (previous !== url) await SecureStore.deleteItemAsync("hikmah-session");
  await SecureStore.setItemAsync(serverKey, url);
}
export const api: ReturnType<typeof createClient> = async (path, options) => {
  const url = await serverURL();
  return createClient(url, () => SecureStore.getItemAsync("hikmah-session"))(
    path,
    options,
  );
};
