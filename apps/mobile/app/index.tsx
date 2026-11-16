import { useEffect, useRef, useState, type ComponentRef } from "react";
import {
  ActivityIndicator,
  AppState,
  BackHandler,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BlurTargetView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import {
  ApiError,
  sectionLabel,
  workspaceAccess,
  workspaceViews,
  type Identity,
  type Section,
} from "@hikmah/api-client";
import { colors } from "@hikmah/ui-tokens";
import * as SecureStore from "../lib/storage";
import {
  api,
  configureServer,
  initialServer,
  serverURL,
  onSessionEnded,
} from "../components/connection";
import { Text, LanguageSwitch, useI18n } from "../components/language";
import {
  Button,
  Card,
  Choice,
  Field,
  Glass,
  GlassTargetContext,
  ui,
} from "../components/ui";
import {
  RecordList,
  WorkspaceProvider,
  useWorkspace,
  type Workspace,
} from "../components/workspace";
import { AcademicSetup } from "../screens/setup";
import { AcademicCalendar } from "../screens/calendar";
import { Attendance } from "../screens/attendance";
import { Exams } from "../screens/exams";
import { Marks } from "../screens/marks";
import { Policies } from "../screens/policies";
import { Results } from "../screens/results";
import { Activity, Audit, Corrections, People } from "../screens/people";
import { AccountSettings } from "../components/account-settings";
const icons: Record<string, keyof typeof Ionicons.glyphMap> = {
  Overview: "grid-outline",
  "Academic setup": "school-outline",
  "Academic calendar": "calendar-outline",
  Attendance: "checkmark-circle-outline",
  "Exams & schemes": "reader-outline",
  "Marks entry": "create-outline",
  Policies: "shield-checkmark-outline",
  "Results & reports": "bar-chart-outline",
  "People & access": "people-outline",
  "Correction requests": "chatbox-ellipses-outline",
  "Audit history": "time-outline",
  "My account": "person-circle-outline",
  "My activity": "receipt-outline",
  More: "apps-outline",
};
function Logo() {
  return (
    <View
      style={{
        width: 45,
        height: 50,
        borderRadius: 16,
        backgroundColor: "#e3f4fd",
        padding: 5,
      }}
    >
      <Image
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        source={require("../assets-hikmah-logo.png")}
        resizeMode="contain"
        style={{ width: "100%", height: "100%" }}
        accessibilityLabel="Hikmah Institute"
      />
    </View>
  );
}
export default function Home() {
  const { t, language } = useI18n();
  const insets = useSafeAreaInsets(),
    { width } = useWindowDimensions();
  const blurTarget = useRef<ComponentRef<typeof View>>(null);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const generation = useRef(0),
    pending = useRef(0),
    access = useRef("");
  const [me, setMe] = useState<Identity | null>(null),
    [ready, setReady] = useState(false),
    [canRestore, setCanRestore] = useState(false),
    [sections, setSections] = useState<Section[]>([]),
    [section, setSection] = useState(""),
    [cycles, setCycles] = useState<any[]>([]),
    [cycle, setCycle] = useState(""),
    [view, setView] = useState("Overview"),
    [drawer, setDrawer] = useState(false),
    [menuSearch, setMenuSearch] = useState(""),
    [busy, setBusy] = useState(false),
    [epoch, setEpoch] = useState(0),
    [notice, setNotice] = useState<{ text: string; error: boolean } | null>(
      null,
    ),
    [keyboard, setKeyboard] = useState(false);
  const [server, setServer] = useState(initialServer),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [activation, setActivation] = useState(false),
    [link, setLink] = useState(""),
    [confirm, setConfirm] = useState("");
  const [dirty, setDirty] = useState(false),
    [next, setNext] = useState<(() => void) | null>(null);
  const tablet = width >= 900;
  const clear = async () => {
    generation.current++;
    await SecureStore.deleteItemAsync("hikmah-session");
    setMe(null);
    setCanRestore(false);
    setSections([]);
    setSection("");
    setCycles([]);
    setCycle("");
    setView("Overview");
    setDrawer(false);
    setPassword("");
    setDirty(false);
    setNext(null);
    setNotice(null);
    access.current = "";
  };
  async function reload() {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const version = ++generation.current;
      const identity = await api<Identity>("/v1/me", {
        signal: controller.signal,
      });
      const [s, c] = await Promise.all([
        api<Section[]>("/v1/sections", { signal: controller.signal }),
        identity.roles.includes("ADMIN") ||
        identity.managedSections.length ||
        identity.teachingSections.length
          ? api<any[]>("/v1/exam-cycles", { signal: controller.signal })
          : Promise.resolve([]),
      ]);
      if (version !== generation.current) return;
      if (access.current && access.current !== identity.accessVersion) {
        setView("Overview");
        setEpoch((n) => n + 1);
        setDirty(false);
      }
      access.current = identity.accessVersion;
      setMe(identity);
      setSections(s);
      setSection((v) => (s.some((x) => x.id === v) ? v : (s[0]?.id ?? "")));
      setCycles(c);
      setCycle((v) =>
        c.some((x) => x.id === v)
          ? v
          : (c.find((x) => x.code === "SHASH_MAHI")?.id ?? c[0]?.id ?? ""),
      );
    } catch (error) {
      if (controller.signal.aborted)
        throw new Error(
          "The server is taking too long. Check its address and try again.",
        );
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
  async function run(fn: () => Promise<void>, message?: string) {
    if (pending.current > 0) return false;
    pending.current++;
    setBusy(true);
    setNotice(null);
    try {
      await fn();
      if (message) {
        setNotice({ text: message, error: false });
        setDirty(false);
      }
      return true;
    } catch (e) {
      if (
        e instanceof ApiError &&
        (e.status === 401 ||
          (e.status === 403 && e.message === "Account disabled or not invited"))
      )
        await clear();
      setNotice({ text: (e as Error).message, error: true });
      return false;
    } finally {
      pending.current--;
      setBusy(pending.current > 0);
    }
  }
  const guarded = (fn: () => void) => {
    if (dirty) {
      setDrawer(false);
      setNext(() => fn);
    } else fn();
  };
  const navigate = (value: string) =>
    guarded(() => {
      if (
        !me ||
        (!workspaceAccess(me, value) &&
          !["My account", "My activity"].includes(value))
      )
        return;
      setView(value);
      setDrawer(false);
      scroll.current?.scrollTo({ y: 0, animated: false });
    });
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const saved = await SecureStore.getItemAsync("hikmah-server");
        if (saved)
          await serverURL().then((v) => {
            if (alive) setServer(v);
          });
        if (await SecureStore.getItemAsync("hikmah-session")) {
          setCanRestore(true);
          await run(reload);
        }
      } catch (error) {
        if (alive) setNotice({ text: (error as Error).message, error: true });
      } finally {
        if (alive) setReady(true);
      }
    })();
    const unsubscribe = onSessionEnded(() => {
      void clear().then(() =>
        setNotice({ text: "Your session ended. Sign in again.", error: true }),
      );
    });
    const app = AppState.addEventListener("change", (s) => {
      if (s === "active")
        void SecureStore.getItemAsync("hikmah-session").then((token) => {
          if (token) void run(reload);
        });
    });
    const show = Keyboard.addListener("keyboardDidShow", () =>
        setKeyboard(true),
      ),
      hide = Keyboard.addListener("keyboardDidHide", () => setKeyboard(false));
    return () => {
      alive = false;
      unsubscribe();
      app.remove();
      show.remove();
      hide.remove();
      generation.current++;
    };
  }, []);
  useEffect(() => {
    if (!notice || notice.error) return;
    const timer = setTimeout(() => setNotice(null), 8000);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    if (Platform.OS !== "android") return;
    const listener = BackHandler.addEventListener("hardwareBackPress", () => {
      if (drawer) {
        setDrawer(false);
        return true;
      }
      if (me && view !== "Overview") {
        navigate("Overview");
        return true;
      }
      return false;
    });
    return () => listener.remove();
  }, [drawer, me, view, dirty]);
  const allowed = me
    ? workspaceViews.filter((v) => workspaceAccess(me, v))
    : [];
  const scoped = sections.filter(
    (s) =>
      !me ||
      me.roles.includes("ADMIN") ||
      view === "Overview" ||
      ([
        "Marks entry",
        "Exams & schemes",
        "Results & reports",
        "Academic calendar",
      ].includes(view)
        ? view === "Marks entry"
          ? me.managedSections.includes(s.id) ||
            me.teachingSections.includes(s.id)
          : me.managedSections.includes(s.id)
        : me.attendanceSections.includes(s.id)),
  );
  useEffect(() => {
    if (
      me &&
      ![
        "Academic setup",
        "People & access",
        "Policies",
        "Audit history",
        "Correction requests",
        "My account",
        "My activity",
      ].includes(view) &&
      !scoped.some((s) => s.id === section)
    )
      setSection(scoped[0]?.id ?? "");
  }, [view, section, sections, me]);
  const visibleCycles = cycles.filter(
    (c) =>
      !section ||
      c.academic_year_id ===
        sections.find((s) => s.id === section)?.academic_year_id,
  );
  useEffect(() => {
    if (!visibleCycles.some((c) => c.id === cycle))
      setCycle(
        visibleCycles.find((c) => c.code === "SHASH_MAHI")?.id ??
          visibleCycles[0]?.id ??
          "",
      );
  }, [section, cycles, cycle]);
  const tabs = me
    ? [
        "Overview",
        ...(allowed.includes("Attendance") ? ["Attendance"] : []),
        ...(allowed.includes("Marks entry")
          ? ["Marks entry"]
          : allowed.includes("Results & reports")
            ? ["Results & reports"]
            : []),
        "More",
      ]
    : [];
  const signout = () =>
    guarded(
      () =>
        void run(async () => {
          try {
            await api("/api/auth/sign-out", { method: "POST", body: "{}" });
          } finally {
            await clear();
          }
        }),
    );
  const account = (
    <>
      <Card title="My account">
        <Text style={ui.title}>{me?.name}</Text>
        <Text style={ui.muted}>
          {t(
            me?.roles.includes("ADMIN")
              ? "Administrator"
              : me?.managedSections.length
                ? "Mushrif"
                : me?.teachingSections.length
                  ? "Subject teacher"
                  : me?.attendanceSections.length
                    ? "Class Ameer"
                    : "Assigned staff",
          )}
        </Text>
        <Text style={[ui.muted, { marginTop: 12 }]}>{server}</Text>
        <AccountSettings
          request={api}
          onChanged={async () => {
            await clear();
            setNotice({
              text: "Password changed. Sign in again with your new password.",
              error: false,
            });
          }}
        />
        <Button
          title="My activity"
          secondary
          icon="receipt-outline"
          onPress={() => navigate("My activity")}
        />
        <Button
          title="Sign out"
          secondary
          icon="log-out-outline"
          disabled={busy}
          onPress={signout}
        />
      </Card>
    </>
  );
  const screen = () => {
    switch (view) {
      case "Academic setup":
        return <AcademicSetup />;
      case "Academic calendar":
        return <AcademicCalendar />;
      case "Attendance":
        return <Attendance />;
      case "Exams & schemes":
        return <Exams />;
      case "Marks entry":
        return <Marks />;
      case "Policies":
        return <Policies />;
      case "Results & reports":
        return <Results />;
      case "People & access":
        return <People />;
      case "Correction requests":
        return <Corrections />;
      case "Audit history":
        return <Audit />;
      case "My account":
        return account;
      case "My activity":
        return <Activity />;
      default:
        return <Overview />;
    }
  };
  const context: Workspace = {
    me: me!,
    sections,
    section,
    setSection: (v) => guarded(() => setSection(v)),
    cycles: visibleCycles,
    cycle,
    setCycle: (v) => guarded(() => setCycle(v)),
    busy,
    run,
    reload,
    navigate,
    epoch,
    setDirty,
    guard: guarded,
  };
  const openMenu = () => {
    setMenuSearch("");
    setDrawer(true);
  };
  const nav = (value: string, compact = false) => (
    <Pressable
      key={value}
      accessibilityRole="button"
      accessibilityLabel={t(value)}
      accessibilityState={{
        selected: value === "More" ? drawer : view === value,
      }}
      onPress={() => (value === "More" ? openMenu() : navigate(value))}
      style={({ pressed }) => ({
        flex: compact ? 1 : undefined,
        minHeight: compact ? 66 : 52,
        flexDirection: compact ? "column" : "row",
        alignItems: "center",
        justifyContent: compact ? "center" : "flex-start",
        gap: compact ? 5 : 13,
        padding: compact ? 6 : 14,
        borderRadius: 19,
        backgroundColor:
          view === value ? "rgba(8,125,168,0.12)" : "transparent",
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <Ionicons
        name={icons[value] ?? "ellipse-outline"}
        size={compact ? 23 : 21}
        color={view === value ? colors.primary : colors.muted}
      />
      <Text
        style={{
          fontSize: compact ? 11 : 14,
          fontWeight: view === value ? "700" : "500",
          color: view === value ? colors.primary : colors.ink,
          flexShrink: 1,
          textAlign: compact ? "center" : undefined,
        }}
      >
        {t(value)}
      </Text>
    </Pressable>
  );
  return (
    <GlassTargetContext.Provider value={blurTarget}>
      <LinearGradient
        colors={["#e4f3ff", "#f2f8fe", "#dff3fa"]}
        style={{
          flex: 1,
          overflow: "hidden",
          direction: language === "ur" ? "rtl" : "ltr",
        }}
      >
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            width: 300,
            height: 300,
            borderRadius: 150,
            backgroundColor: "rgba(114,204,248,0.14)",
            top: 90,
            right: -120,
          }}
        />
        {!ready ? (
          <View
            style={{
              flex: 1,
              alignItems: "center",
              justifyContent: "center",
              gap: 20,
            }}
          >
            <Logo />
            <ActivityIndicator color={colors.primary} />
            <Text style={ui.muted}>{t("Opening your workspace…")}</Text>
          </View>
        ) : !me ? (
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === "ios" ? "padding" : undefined}
          >
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{
                padding: 24,
                paddingTop: insets.top + 28,
                paddingBottom: insets.bottom + 40,
                maxWidth: 520,
                width: "100%",
                alignSelf: "center",
              }}
            >
              <LanguageSwitch />
              <View style={{ marginTop: 35, marginBottom: 25 }}>
                <Logo />
                <Text
                  style={{
                    color: colors.primary,
                    fontSize: 11,
                    letterSpacing: 2,
                    marginTop: 24,
                    fontWeight: "700",
                  }}
                >
                  {t("HIKMAH INSTITUTE")}
                </Text>
                <Text
                  style={{
                    fontSize: 38,
                    fontWeight: "700",
                    color: colors.ink,
                    marginTop: 13,
                    letterSpacing: -1,
                  }}
                >
                  {t(activation ? "Make it yours." : "Welcome back")}
                </Text>
                <Text style={[ui.muted, { marginTop: 12, fontSize: 15 }]}>
                  {t(
                    activation
                      ? "Set a private password using your invitation or recovery link."
                      : "Your institute. Your people. One clear workspace.",
                  )}
                </Text>
              </View>
              <Card>
                <Field
                  label="Server address"
                  type="url"
                  value={server}
                  onChange={setServer}
                  hint="Use your institute’s HTTPS address or the printed phone server address during local testing."
                />
                {activation ? (
                  <>
                    <Field
                      label="Private invitation or recovery link"
                      value={link}
                      onChange={setLink}
                    />
                    <Field
                      label="New password"
                      type="password"
                      value={password}
                      onChange={setPassword}
                    />
                    <Field
                      label="Confirm new password"
                      type="password"
                      value={confirm}
                      onChange={setConfirm}
                    />
                    <Button
                      title="Set password"
                      loading={busy}
                      onPress={() =>
                        void run(async () => {
                          if (password !== confirm)
                            throw Error("Passwords do not match.");
                          if (password.length < 12 || password.length > 128)
                            throw Error(
                              "Password must contain at least 12 characters.",
                            );
                          const token = link.includes("#")
                            ? link.slice(link.lastIndexOf("#") + 1)
                            : link.trim();
                          if (!/^[0-9a-f]{64}$/.test(token))
                            throw Error(
                              "Enter the complete private invitation or recovery link.",
                            );
                          await configureServer(server);
                          await api("/v1/invitations/accept", {
                            method: "POST",
                            body: JSON.stringify({ token, password }),
                          });
                          setActivation(false);
                          setPassword("");
                          setConfirm("");
                          setLink("");
                        }, "Password saved. You can now sign in.")
                      }
                    />
                  </>
                ) : (
                  <>
                    <Field
                      label="Email address"
                      type="email"
                      value={email}
                      onChange={setEmail}
                    />
                    <Field
                      label="Password"
                      type="password"
                      value={password}
                      onChange={setPassword}
                    />
                    <Button
                      title="Sign in"
                      icon="arrow-forward-outline"
                      loading={busy}
                      onPress={() =>
                        void run(async () => {
                          await configureServer(server);
                          setServer(await serverURL());
                          const r = await api<{ token: string }>(
                            "/api/auth/sign-in/email",
                            {
                              method: "POST",
                              body: JSON.stringify({
                                email: email.trim(),
                                password,
                              }),
                            },
                          );
                          await SecureStore.setItemAsync(
                            "hikmah-session",
                            r.token,
                          );
                          setCanRestore(true);
                          setPassword("");
                          await reload();
                        })
                      }
                    />
                  </>
                )}
                {!activation && canRestore && (
                  <Button
                    title="Retry saved session"
                    secondary
                    disabled={busy}
                    onPress={() =>
                      void run(async () => {
                        await configureServer(server);
                        await reload();
                      })
                    }
                  />
                )}
                <Button
                  title={
                    activation
                      ? "Back to sign in"
                      : "Activate account / recover password"
                  }
                  secondary
                  onPress={() => {
                    setActivation(!activation);
                    setPassword("");
                    setConfirm("");
                    setNotice(null);
                  }}
                />
              </Card>
            </ScrollView>
          </KeyboardAvoidingView>
        ) : (
          <WorkspaceProvider value={context}>
            <View
              style={{ flex: 1, flexDirection: "row", paddingTop: insets.top }}
            >
              {tablet && (
                <View style={{ width: 260, padding: 18, paddingTop: 30 }}>
                  <Glass style={{ flex: 1 }}>
                    <ScrollView contentContainerStyle={{ padding: 18 }}>
                      <View style={[ui.row, { marginBottom: 25 }]}>
                        <Logo />
                        <Text style={[ui.title, { fontSize: 17, flex: 1 }]}>
                          {t("Hikmah Institute")}
                        </Text>
                      </View>
                      {allowed.map((v) => nav(v))}
                      {nav("My account")}
                      <LanguageSwitch />
                    </ScrollView>
                  </Glass>
                </View>
              )}
              <View style={{ flex: 1 }}>
                <View
                  style={{
                    paddingHorizontal: 22,
                    paddingTop: 14,
                    paddingBottom: 12,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t("Open workspace menu")}
                    onPress={openMenu}
                    style={ui.row}
                  >
                    {!tablet && <Logo />}
                    <View>
                      <Text
                        style={{
                          fontSize: 17,
                          fontWeight: "700",
                          color: colors.ink,
                        }}
                      >
                        {t("Hikmah Institute")}
                      </Text>
                      <Text
                        style={{
                          fontSize: 11,
                          color: colors.muted,
                          marginTop: 3,
                        }}
                      >
                        {t("Academic office")}
                      </Text>
                    </View>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t("My account")}
                    onPress={() => navigate("My account")}
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 16,
                      backgroundColor: "rgba(255,255,255,0.8)",
                      alignItems: "center",
                      justifyContent: "center",
                      borderColor: "white",
                      borderWidth: 1,
                    }}
                  >
                    <Ionicons
                      name="person-outline"
                      size={21}
                      color={colors.primary}
                    />
                  </Pressable>
                </View>
                <BlurTargetView ref={blurTarget} style={{ flex: 1 }}>
                  <KeyboardAvoidingView
                    style={{ flex: 1 }}
                    behavior={Platform.OS === "ios" ? "padding" : undefined}
                  >
                    <ScrollView
                      ref={scroll}
                      keyboardShouldPersistTaps="handled"
                      keyboardDismissMode="on-drag"
                      refreshControl={
                        <RefreshControl
                          refreshing={busy}
                          onRefresh={() =>
                            guarded(
                              () =>
                                void run(async () => {
                                  await reload();
                                  setEpoch((n) => n + 1);
                                }),
                            )
                          }
                          tintColor={colors.primary}
                        />
                      }
                      contentContainerStyle={{
                        paddingHorizontal: 20,
                        paddingTop: 12,
                        paddingBottom: tablet ? 35 : insets.bottom + 110,
                        maxWidth: 1000,
                        width: "100%",
                        alignSelf: "center",
                      }}
                    >
                      {__DEV__ &&
                        !!initialServer &&
                        server !== initialServer && (
                          <Card title="Different server address">
                            <Text style={ui.muted}>
                              {t("Current server")}: {server}
                            </Text>
                            <Text style={ui.muted}>
                              {t("Suggested server")}: {initialServer}
                            </Text>
                            <Button
                              title="Use printed server address"
                              secondary
                              onPress={() =>
                                guarded(
                                  () =>
                                    void run(async () => {
                                      await clear();
                                      await configureServer(initialServer);
                                      setServer(await serverURL());
                                    }, "Server changed. Sign in with an account from that installation."),
                                )
                              }
                            />
                          </Card>
                        )}
                      <Text
                        accessibilityRole="header"
                        style={{
                          fontSize: 30,
                          fontWeight: "700",
                          letterSpacing: -0.8,
                          color: colors.ink,
                          marginBottom: 20,
                        }}
                      >
                        {t(view)}
                      </Text>
                      {[
                        "Attendance",
                        "Exams & schemes",
                        "Marks entry",
                        "Results & reports",
                      ].includes(view) && (
                        <Card>
                          <Choice
                            label="Section"
                            value={section}
                            options={scoped.map((s) => ({
                              value: s.id,
                              label: sectionLabel(s),
                            }))}
                            onChange={(v) => guarded(() => setSection(v))}
                          />
                          {view !== "Attendance" && (
                            <Choice
                              label="Exam session"
                              value={cycle}
                              options={visibleCycles.map((c) => ({
                                value: c.id,
                                label: c.title,
                              }))}
                              onChange={(v) => guarded(() => setCycle(v))}
                            />
                          )}
                        </Card>
                      )}
                      <View
                        key={`${me.accessVersion}:${epoch}:${view}:${["Attendance", "Exams & schemes", "Results & reports"].includes(view) ? section + cycle : ""}`}
                      >
                        {screen()}
                      </View>
                    </ScrollView>
                  </KeyboardAvoidingView>
                </BlurTargetView>
                {!tablet && !keyboard && (
                  <Glass
                    style={{
                      position: "absolute",
                      bottom: Math.max(insets.bottom, 14),
                      left: 16,
                      right: 16,
                      borderWidth: 1,
                      borderColor: "white",
                      boxShadow: "0 10px 35px rgba(25,75,120,0.13)",
                    }}
                  >
                    <View style={{ flexDirection: "row", padding: 6 }}>
                      {tabs.map((v) => nav(v, true))}
                    </View>
                  </Glass>
                )}
              </View>
            </View>
            <Modal
              visible={drawer || !!next}
              transparent
              animationType="fade"
              onRequestClose={() => {
                setDrawer(false);
                setNext(null);
              }}
            >
              {next ? (
                <View
                  style={{
                    flex: 1,
                    justifyContent: "center",
                    padding: 26,
                    backgroundColor: "rgba(15,40,65,0.35)",
                  }}
                >
                  <Card
                    title="Unsaved changes"
                    description="You have edits that have not been saved. Keep editing or discard these changes to continue."
                  >
                    <Button
                      title="Keep editing"
                      onPress={() => setNext(null)}
                    />
                    <Button
                      title="Discard changes and continue"
                      danger
                      onPress={() => {
                        setDirty(false);
                        const fn = next;
                        setNext(null);
                        fn?.();
                      }}
                    />
                  </Card>
                </View>
              ) : (
                <View
                  style={{
                    flex: 1,
                    justifyContent: "flex-end",
                    backgroundColor: "rgba(15,40,65,0.3)",
                  }}
                >
                  <Pressable
                    style={{ flex: 1 }}
                    accessibilityLabel={t("Close")}
                    onPress={() => setDrawer(false)}
                  />
                  <View
                    accessibilityViewIsModal
                    style={{
                      maxHeight: "88%",
                      backgroundColor: "#f1f8fe",
                      borderTopLeftRadius: 32,
                      borderTopRightRadius: 32,
                      padding: 22,
                      paddingBottom: insets.bottom + 20,
                    }}
                  >
                    <View
                      style={[
                        ui.row,
                        { justifyContent: "space-between", marginBottom: 15 },
                      ]}
                    >
                      <Text style={ui.title}>{t("Your workspace")}</Text>
                      <Button
                        title="Close"
                        secondary
                        onPress={() => setDrawer(false)}
                      />
                    </View>
                    <Field
                      label="Find a feature"
                      value={menuSearch}
                      onChange={setMenuSearch}
                    />
                    <ScrollView keyboardShouldPersistTaps="handled">
                      {[...allowed, "My account", "My activity"]
                        .filter((v) =>
                          t(v)
                            .toLocaleLowerCase()
                            .includes(menuSearch.toLocaleLowerCase()),
                        )
                        .map((v) => nav(v))}
                      <View style={{ marginTop: 20 }}>
                        <LanguageSwitch />
                      </View>
                    </ScrollView>
                  </View>
                </View>
              )}
            </Modal>
          </WorkspaceProvider>
        )}
        {notice && (
          <View
            accessibilityRole={notice.error ? "alert" : undefined}
            accessibilityLiveRegion="polite"
            style={{
              position: "absolute",
              top: insets.top + 78,
              left: 16,
              right: 16,
              maxWidth: 650,
              alignSelf: "center",
              padding: 15,
              borderRadius: 20,
              backgroundColor: notice.error ? "#fff0f0" : "#e5f7f1",
              borderWidth: 1,
              borderColor: "white",
              boxShadow: "0 8px 30px rgba(25,75,120,0.15)",
              flexDirection: "row",
              gap: 10,
              alignItems: "center",
              zIndex: 100,
            }}
          >
            <Ionicons
              name={
                notice.error
                  ? "alert-circle-outline"
                  : "checkmark-circle-outline"
              }
              size={23}
              color={notice.error ? colors.danger : colors.primary}
            />
            <Text
              style={{
                flex: 1,
                color: notice.error ? colors.danger : colors.ink,
                lineHeight: 21,
              }}
            >
              {t(notice.text)}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("Dismiss message")}
              onPress={() => setNotice(null)}
              style={{ padding: 10 }}
            >
              <Ionicons name="close" size={20} color={colors.muted} />
            </Pressable>
          </View>
        )}
      </LinearGradient>
    </GlassTargetContext.Provider>
  );
}
function Overview() {
  const { me, sections, navigate, setSection } = useWorkspace();
  const { t } = useI18n();
  const [q, setQ] = useState(""),
    [past, setPast] = useState(false);
  const active = sections.filter(
    (s) => !["CLOSED", "ARCHIVED"].includes(s.year_state ?? ""),
  );
  const filtered = (past ? sections : active).filter((s) =>
    sectionLabel(s).toLocaleLowerCase().includes(q.toLocaleLowerCase()),
  );
  const shortcuts = workspaceViews.filter(
    (v) => v !== "Overview" && workspaceAccess(me, v),
  );
  return (
    <>
      <LinearGradient
        colors={["#0c81ae", "#0a6f9b"]}
        style={{ padding: 25, borderRadius: 28, marginBottom: 20 }}
      >
        <View
          style={{
            width: 46,
            height: 46,
            borderRadius: 16,
            backgroundColor: "rgba(255,255,255,0.16)",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 18,
          }}
        >
          <Ionicons name="sparkles-outline" color="white" size={23} />
        </View>
        <Text style={{ color: "#bcecff", fontSize: 12, fontWeight: "600" }}>
          {t("A little clarity, every day")}
        </Text>
        <Text
          style={{
            fontSize: 28,
            color: "white",
            fontWeight: "700",
            marginTop: 10,
            lineHeight: 35,
          }}
        >
          {t("Welcome back")}, {me.name.split(" ")[0]}
        </Text>
        <Text style={{ color: "#d4edfa", lineHeight: 22, marginTop: 10 }}>
          {t("Your classes, your people, your next steps. All in one place.")}
        </Text>
        <View style={{ marginTop: 22, flexDirection: "row", gap: 25 }}>
          <View>
            <Text style={{ fontSize: 26, color: "white", fontWeight: "700" }}>
              {active.length}
            </Text>
            <Text style={{ color: "#d4edfa", fontSize: 12 }}>
              {t("Active classes")}
            </Text>
          </View>
          <View>
            <Text style={{ fontSize: 26, color: "white", fontWeight: "700" }}>
              {me.today.slice(8)}
            </Text>
            <Text style={{ color: "#d4edfa", fontSize: 12 }}>
              {new Date(me.today + "T12:00:00").toLocaleDateString(undefined, {
                month: "short",
                year: "numeric",
              })}
            </Text>
          </View>
        </View>
      </LinearGradient>
      <Card title="Quick actions">
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
          {shortcuts.slice(0, 4).map((v) => (
            <Pressable
              key={v}
              accessibilityRole="button"
              accessibilityLabel={t(v)}
              onPress={() => navigate(v)}
              style={{
                width: "47%",
                padding: 16,
                borderRadius: 20,
                backgroundColor: "#eaf5fd",
                minHeight: 110,
              }}
            >
              <Ionicons name={icons[v]} color={colors.primary} size={25} />
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: "600",
                  color: colors.ink,
                  marginTop: 12,
                }}
              >
                {t(v)}
              </Text>
            </Pressable>
          ))}
        </View>
      </Card>
      <Card title="Your sections">
        <Field label="Find a class" value={q} onChange={setQ} />
        <Button
          title={past ? "Hide previous years" : "Include previous years"}
          secondary
          onPress={() => setPast(!past)}
        />
        <RecordList
          search={false}
          rows={filtered}
          render={(s) => (
            <View
              key={s.id}
              style={{
                paddingVertical: 16,
                borderBottomWidth: 1,
                borderColor: colors.line,
              }}
            >
              <Text style={ui.label}>
                {s.name} · {s.code}
              </Text>
              <Text style={ui.muted}>
                {[s.year_label, s.program_name, s.level_name]
                  .filter(Boolean)
                  .join(" · ")}
              </Text>
              <Button
                title="Open class"
                secondary
                onPress={() => {
                  setSection(s.id);
                  navigate(
                    workspaceAccess(me, "Attendance")
                      ? "Attendance"
                      : "Marks entry",
                  );
                }}
              />
            </View>
          )}
        />
        {!sections.length && me.roles.includes("ADMIN") && (
          <Button
            title="Open academic setup"
            onPress={() => navigate("Academic setup")}
          />
        )}
      </Card>
    </>
  );
}
