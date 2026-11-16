import { ApiError } from "@hikmah/api-client";
import { Platform } from "react-native";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import * as DocumentPicker from "expo-document-picker";
import * as SecureStore from "./storage";
import { serverURL } from "../components/connection";
export async function shareFile(
  path: string,
  name: string,
  mime = "application/pdf",
) {
  const token = await SecureStore.getItemAsync("hikmah-session");
  const response = await fetch((await serverURL()) + path, {
    headers: { Authorization: `Bearer ${token}` },
    credentials: "omit",
  });
  if (!response.ok)
    throw new ApiError(
      response.status,
      "File download failed. Check your access and try again.",
    );
  const bytes = await response.arrayBuffer();
  if (Platform.OS === "web") {
    const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return;
  }
  const file = new File(
    Paths.cache,
    `${Date.now()}-${name.replace(/[^a-zA-Z0-9._-]/g, "_")}`,
  );
  try {
    file.write(new Uint8Array(bytes));
    if (!(await Sharing.isAvailableAsync()))
      throw Error("File sharing is unavailable on this device");
    await Sharing.shareAsync(file.uri, { mimeType: mime });
  } finally {
    if (file.exists) file.delete();
  }
}
export async function pickCSV() {
  const result = await DocumentPicker.getDocumentAsync({
    type: [
      "text/csv",
      "text/plain",
      "application/vnd.ms-excel",
      "text/comma-separated-values",
    ],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled) return null;
  const asset = result.assets[0];
  if (Platform.OS === "web") {
    if (asset.size && asset.size > 500000)
      throw Error("Choose a CSV file smaller than 500 KB.");
    const response = await fetch(asset.uri);
    return response.text();
  }
  const file = new File(asset.uri);
  try {
    if (asset.size && asset.size > 500000)
      throw Error("Choose a CSV file smaller than 500 KB.");
    return await file.text();
  } finally {
    if (file.exists) file.delete();
  }
}
