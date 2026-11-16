import * as SecureStore from "../lib/storage";
import {
  createClient,
  normalizeServerURL,
  isPagedCatalog,
  readCatalog,
} from "@hikmah/api-client";
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
const sessionListeners = new Set<() => void>();
export function onSessionEnded(listener: () => void) {
  sessionListeners.add(listener);
  return () => {
    sessionListeners.delete(listener);
  };
}
export const api: ReturnType<typeof createClient> = async (path, options) => {
  const url = await serverURL();
  const token = await SecureStore.getItemAsync("hikmah-session");
  const request = createClient(
    url,
    async () => token,
    () => {
      if (token)
        void (async () => {
          if (
            (await SecureStore.getItemAsync("hikmah-session")) === token &&
            (await serverURL()) === url
          ) {
            for (const listener of sessionListeners) listener();
          }
        })();
    },
  );
  if (isPagedCatalog(path) && (!options?.method || options.method === "GET"))
    return readCatalog(request, path, options) as any;
  return request(path, options);
};
