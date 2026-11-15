import { useCallback, useState } from "react";
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import * as Location from "expo-location";
import { api, ApiError } from "@/api";
import { ScreenShell } from "@/chrome";
import { Icon } from "@/icons";
import { captureFieldPhoto } from "@/photo";
import { loadSession, type Session } from "@/session";
import { SignaturePad } from "@/signature";
import { flushTaskUpdates, queueTaskUpdate } from "@/task-outbox";
import { colors, styles } from "@/theme";
import { proofLine, type FormField, type TaskDetail } from "@/taskDetail";

function needs(proofs: string[], id: string) {
  return proofs.includes(id);
}

function FormFields({
  fields,
  values,
  onChange,
}: {
  fields: FormField[];
  values: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
}) {
  return (
    <View>
      {fields.map((field) => (
        <View key={field.id} style={{ marginTop: 10 }}>
          <Text style={{ fontSize: 12, fontWeight: "600", color: colors.ink }}>
            {field.label}
            {field.required ? " *" : ""}
          </Text>
          {field.type === "yesno" ? (
            <View style={{ flexDirection: "row", gap: 8, marginTop: 6 }}>
              {["yes", "no"].map((opt) => (
                <Pressable
                  key={opt}
                  onPress={() => onChange({ ...values, [field.id]: opt })}
                  style={{
                    paddingVertical: 8,
                    paddingHorizontal: 14,
                    borderRadius: 999,
                    backgroundColor: values[field.id] === opt ? colors.ink : colors.cream,
                  }}
                >
                  <Text style={{ color: values[field.id] === opt ? colors.paper : colors.ink, fontWeight: "600", textTransform: "capitalize" }}>{opt}</Text>
                </Pressable>
              ))}
            </View>
          ) : field.type === "choice" ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
              {(field.options ?? []).map((opt) => (
                <Pressable
                  key={opt}
                  onPress={() => onChange({ ...values, [field.id]: opt })}
                  style={{
                    paddingVertical: 6,
                    paddingHorizontal: 10,
                    borderRadius: 999,
                    backgroundColor: values[field.id] === opt ? colors.ink : colors.cream,
                  }}
                >
                  <Text style={{ color: values[field.id] === opt ? colors.paper : colors.ink, fontSize: 12 }}>{opt}</Text>
                </Pressable>
              ))}
            </View>
          ) : (
            <TextInput
              style={[styles.input, { marginTop: 6, marginBottom: 0 }]}
              value={values[field.id] ?? ""}
              onChangeText={(text) => onChange({ ...values, [field.id]: text })}
              placeholder={field.type === "number" ? "0" : field.type === "date" ? "YYYY-MM-DD" : field.label}
              placeholderTextColor={colors.ink3}
              keyboardType={field.type === "number" ? "numeric" : "default"}
            />
          )}
        </View>
      ))}
    </View>
  );
}

export default function StepUpdate() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [session, setSession] = useState<Session | null>(null);
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [note, setNote] = useState("");
  const [photo, setPhoto] = useState("");
  const [selfie, setSelfie] = useState("");
  const [signature, setSignature] = useState<string | null>(null);
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [atSite, setAtSite] = useState<{ lat: number; lng: number; accuracyM: number } | null>(null);
  const [reviewNote, setReviewNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [openedAt] = useState(() => Date.now());

  useFocusEffect(
    useCallback(() => {
      (async () => {
        const current = await loadSession();
        if (!current || !id) return;
        setSession(current);
        setTask(await api<TaskDetail>(`/tasks/${id}`, {}, current.token));
        await flushTaskUpdates(current);
      })().catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load"));
    }, [id]),
  );

  const steps = task?.steps.length ? task.steps : task ? [{ id: task.id, title: task.title, status: task.status, n: 1 }] : [];
  const current = steps.find((step) => step.id === id) ?? steps.find((step) => step.status !== "done");
  const proofs = task?.proofs?.length ? task.proofs : current?.proofs ?? (current?.evidence ? [current.evidence] : []);
  const reviewKind = current?.kind === "handoff" || current?.kind === "approval" || current?.kind === "end" || (current ? /\breview\b/i.test(current.title) : false);
  const notStarted = (current?.status ?? task?.status) === "new";
  const employee = session?.user.role === "employee";
  const manager = session?.user.role === "manager" || session?.user.role === "admin";

  async function take(kind: "photo" | "selfie") {
    setError("");
    try {
      const shot = await captureFieldPhoto(kind === "selfie" ? "Camera permission is required for the selfie." : "Camera permission is required.", kind === "selfie" ? "front" : "back");
      if (!shot) return;
      if (kind === "selfie") setSelfie(shot);
      else setPhoto(shot);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not take the photo");
    }
  }

  async function confirmSite() {
    setError("");
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) throw new Error("Location permission is required to prove you are at the site.");
      const fix = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setAtSite({ lat: fix.coords.latitude, lng: fix.coords.longitude, accuracyM: fix.coords.accuracy ?? 0 });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read location");
    }
  }

  function bodyForDone() {
    return {
      status: "done" as const,
      note: note || undefined,
      photoBase64: photo || undefined,
      selfieBase64: selfie || undefined,
      signatureBase64: signature || undefined,
      form: Object.keys(formValues).length ? formValues : undefined,
      formId: task?.formId ?? undefined,
      lat: atSite?.lat,
      lng: atSite?.lng,
      accuracyM: atSite?.accuracyM,
    };
  }

  async function submit() {
    if (!session || !id) return;
    if (employee && reviewKind) {
      setError("This is a review step. Your manager closes it.");
      return;
    }
    const required = proofs.length
      ? proofs
      : current?.evidence === "geofence"
        ? ["geofence"]
        : current?.evidence === "signature"
          ? ["signature"]
          : current?.evidence === "form"
            ? ["form"]
            : ["photo"];
    if (needs(required, "selfie") && !selfie && !photo) {
      setError("Take a selfie.");
      return;
    }
    if (needs(required, "photo") && !photo) {
      setError("Take a photo of the work.");
      return;
    }
    if (needs(required, "signature") && !signature) {
      setError("Draw a signature.");
      return;
    }
    if (needs(required, "geofence") && !atSite) {
      setError("Confirm you are at the site.");
      return;
    }
    if (needs(required, "form")) {
      const missing = (task?.form?.fields ?? []).find((f) => f.required && !(formValues[f.id] ?? "").trim());
      if (missing) {
        setError(`Fill ${missing.label}.`);
        return;
      }
    }
    if (!required.length && !photo && current?.evidence !== "geofence") {
      setError("Take a photo of the finished work.");
      return;
    }
    setBusy(true);
    setError("");
    const payload = bodyForDone();
    try {
      if (notStarted) {
        await api(`/tasks/${id}`, { method: "POST", body: JSON.stringify({ status: "in_progress" }) }, session.token);
      }
      await api(`/tasks/${id}`, { method: "POST", body: JSON.stringify(payload) }, session.token, 20_000);
      router.replace(`/task/${id}/next`);
    } catch (err) {
      if (err instanceof ApiError && err.offline) {
        await queueTaskUpdate({ taskId: id, title: current?.title ?? task?.title ?? "Task", body: payload, capturedAt: new Date().toISOString() });
        setWaiting(true);
        setError("Saved on this phone. It will upload when the network returns.");
      } else {
        setError(err instanceof Error ? err.message : "Could not submit");
      }
    } finally {
      setBusy(false);
    }
  }

  async function review(decision: "approve" | "send_back") {
    if (!session || !id) return;
    if (decision === "send_back" && !reviewNote.trim()) {
      setError("Add a note when you send work back.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api(`/tasks/${id}/review`, { method: "POST", body: JSON.stringify({ decision, note: reviewNote }) }, session.token);
      router.replace(`/task/${id}/next`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not review");
    } finally {
      setBusy(false);
    }
  }

  const total = steps.length || 1;
  const n = current?.n ?? 1;
  const elapsed = Math.max(0, Math.round((Date.now() - openedAt) / 1000));
  const elapsedLabel = elapsed < 60 ? `${elapsed}s` : `${Math.floor(elapsed / 60)}m ${elapsed % 60}s`;
  const notify = task?.alertGoesTo;
  const showPhoto = needs(proofs, "photo") || (!proofs.length && current?.evidence !== "geofence" && current?.evidence !== "signature" && current?.evidence !== "form");
  const showSelfie = needs(proofs, "selfie");
  const showFence = needs(proofs, "geofence") || current?.evidence === "geofence";
  const showSign = needs(proofs, "signature") || current?.evidence === "signature";
  const showForm = needs(proofs, "form") || Boolean(task?.form?.fields?.length);

  return (
    <ScreenShell>
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: "rgba(28,36,48,0.55)", justifyContent: "flex-end" }} behavior="padding" keyboardVerticalOffset={Platform.OS === "ios" ? 12 : 0}>
        <Pressable style={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 10 }} onPress={() => router.back()}>
          <Text style={{ fontSize: 18, fontWeight: "700", color: colors.paper }}>{task?.title ?? "Task"}</Text>
          <Text style={{ fontSize: 12, color: colors.paper, opacity: 0.8 }}>{task?.site ?? ""}</Text>
        </Pressable>
        <View style={{ backgroundColor: colors.paper, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "88%" }}>
          <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 10, paddingBottom: 22 }}>
            <View style={{ width: 40, height: 4, borderRadius: 4, backgroundColor: colors.cream2, alignSelf: "center", marginBottom: 14 }} />
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: colors.ink, alignItems: "center", justifyContent: "center" }}>
                <Text style={{ color: colors.paper, fontSize: 12, fontWeight: "700" }}>{n}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontWeight: "700", color: colors.ink }}>{current?.title ?? task?.title ?? "Step"}</Text>
                <Text style={{ fontSize: 11, color: colors.ink3 }}>
                  Step {n} of {total} · {proofLine(proofs, current?.evidence)}
                </Text>
              </View>
            </View>

            {task?.sendBackNote ? (
              <View style={{ marginTop: 12, padding: 10, borderRadius: 10, backgroundColor: colors.amberSoft }}>
                <Text style={{ fontSize: 12, color: colors.ink }}>{task.sendBackNote}</Text>
              </View>
            ) : null}
            {task?.chart?.length ? (
              <View style={{ marginTop: 12, padding: 12, borderRadius: 12, backgroundColor: colors.cream }}>
                <Text style={{ fontSize: 11, fontWeight: "700", letterSpacing: 0.6, color: colors.ink3, textTransform: "uppercase" }}>Patient chart</Text>
                {task.chart.map((row, index) => (
                  <View key={`${row.taskId}-${index}`} style={{ marginTop: 10 }}>
                    <Text style={{ fontSize: 13, fontWeight: "700", color: colors.ink }}>{row.title}</Text>
                    <Text style={{ fontSize: 11, color: colors.ink3, marginTop: 2 }}>
                      {row.person}
                      {row.note ? ` · ${row.note}` : ""}
                    </Text>
                    {Object.entries(row.form).map(([key, value]) => (
                      <Text key={key} style={{ fontSize: 12, color: colors.ink2, marginTop: 2 }}>
                        {key}: {value}
                      </Text>
                    ))}
                  </View>
                ))}
              </View>
            ) : null}
            {task?.claimable ? (
              <Pressable
                onPress={() => {
                  void (async () => {
                    if (!session || !id) return;
                    setBusy(true);
                    setError("");
                    try {
                      await api(`/tasks/${id}/claim`, { method: "POST", body: "{}" }, session.token);
                      router.replace(`/task/${id}/next`);
                    } catch (err) {
                      setError(err instanceof Error ? err.message : "Could not accept");
                    } finally {
                      setBusy(false);
                    }
                  })();
                }}
                disabled={busy}
                style={{ marginTop: 14, paddingVertical: 14, borderRadius: 12, backgroundColor: colors.ink, alignItems: "center" }}
              >
                <Text style={{ color: colors.paper, fontWeight: "700" }}>{busy ? "Accepting…" : "Accept this patient"}</Text>
              </Pressable>
            ) : null}
            {waiting ? (
              <View style={{ marginTop: 12, padding: 10, borderRadius: 10, backgroundColor: colors.greenTint }}>
                <Text style={{ fontSize: 12, color: colors.greenDeep, fontWeight: "600" }}>Waiting to upload</Text>
              </View>
            ) : null}
            {error ? <Text style={[styles.error, { marginTop: 12 }]}>{error}</Text> : null}

            {showSelfie ? (
              <>
                <Text style={{ marginTop: 16, fontSize: 11, fontWeight: "700", letterSpacing: 0.6, color: colors.ink3, textTransform: "uppercase" }}>Selfie</Text>
                <Pressable onPress={() => void take("selfie")} style={{ marginTop: 8, height: 100, borderRadius: 14, borderWidth: 1, borderStyle: "dashed", borderColor: colors.ink4, backgroundColor: colors.cream, padding: 12, flexDirection: "row", alignItems: "center", gap: 12 }}>
                  {selfie ? <Image source={{ uri: selfie }} style={{ width: 76, height: 76, borderRadius: 10 }} /> : <View style={{ width: 76, height: 76, borderRadius: 10, backgroundColor: colors.cream2, alignItems: "center", justifyContent: "center" }}><Icon name="camera" size={22} color={colors.ink3} /></View>}
                  <Text style={{ flex: 1, fontSize: 12, fontWeight: "600" }}>{selfie ? "Selfie added · tap to retake" : "Front camera · tap to capture"}</Text>
                </Pressable>
              </>
            ) : null}

            {showPhoto ? (
              <>
                <Text style={{ marginTop: 16, fontSize: 11, fontWeight: "700", letterSpacing: 0.6, color: colors.ink3, textTransform: "uppercase" }}>Evidence · photo</Text>
                <Pressable onPress={() => void take("photo")} style={{ marginTop: 8, height: 120, borderRadius: 14, borderWidth: 1, borderStyle: "dashed", borderColor: colors.ink4, backgroundColor: colors.cream, padding: 12, flexDirection: "row", alignItems: "center", gap: 12 }}>
                  {photo ? (
                    <Image source={{ uri: photo.startsWith("data:") ? photo : `data:image/jpeg;base64,${photo}` }} style={{ width: 96, height: 96, borderRadius: 10 }} />
                  ) : (
                    <View style={{ width: 96, height: 96, borderRadius: 10, backgroundColor: colors.cream2, alignItems: "center", justifyContent: "center" }}>
                      <Icon name="camera" size={24} color={colors.ink3} />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 12, fontWeight: "600", color: colors.ink }}>{photo ? "Photo added · tap to retake" : "Tap to capture"}</Text>
                    <Text style={{ fontSize: 10, color: colors.ink3, marginTop: 4, lineHeight: 14 }}>Photo of the finished work.</Text>
                  </View>
                </Pressable>
              </>
            ) : null}

            {showFence ? (
              <>
                <Text style={{ marginTop: 16, fontSize: 11, fontWeight: "700", letterSpacing: 0.6, color: colors.ink3, textTransform: "uppercase" }}>At the site</Text>
                <Pressable onPress={() => void confirmSite()} style={{ marginTop: 8, padding: 12, borderRadius: 12, backgroundColor: atSite ? colors.greenTint : colors.cream }}>
                  <Text style={{ fontWeight: "600", color: colors.ink }}>{atSite ? "You are at the site" : "Confirm I am at the site"}</Text>
                  <Text style={{ fontSize: 11, color: colors.ink3, marginTop: 4 }}>Uses this phone’s location against the site fence.</Text>
                </Pressable>
              </>
            ) : null}

            {showSign ? (
              <>
                <Text style={{ marginTop: 16, fontSize: 11, fontWeight: "700", letterSpacing: 0.6, color: colors.ink3, textTransform: "uppercase" }}>Signature</Text>
                <View style={{ marginTop: 8 }}>
                  <SignaturePad onChange={setSignature} />
                </View>
              </>
            ) : null}

            {showForm && task?.form?.fields?.length ? (
              <>
                <Text style={{ marginTop: 16, fontSize: 11, fontWeight: "700", letterSpacing: 0.6, color: colors.ink3, textTransform: "uppercase" }}>{task.form.name}</Text>
                <FormFields fields={task.form.fields} values={formValues} onChange={setFormValues} />
              </>
            ) : null}

            <Text style={{ marginTop: 14, fontSize: 11, fontWeight: "700", letterSpacing: 0.6, color: colors.ink3, textTransform: "uppercase" }}>Note</Text>
            <TextInput
              style={[styles.input, { marginTop: 8, minHeight: 46, marginBottom: 0 }]}
              value={note}
              onChangeText={setNote}
              placeholder="What did you finish?"
              placeholderTextColor={colors.ink3}
              multiline
            />

            {manager && reviewKind && !task?.claimable ? (
              <View style={{ marginTop: 14 }}>
                <Text style={{ fontSize: 11, fontWeight: "700", letterSpacing: 0.6, color: colors.ink3, textTransform: "uppercase" }}>Review</Text>
                <TextInput
                  style={[styles.input, { marginTop: 8, minHeight: 46, marginBottom: 0 }]}
                  value={reviewNote}
                  onChangeText={setReviewNote}
                  placeholder="Note if you send it back"
                  placeholderTextColor={colors.ink3}
                  multiline
                />
                <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
                  <Pressable onPress={() => void review("send_back")} disabled={busy} style={{ flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: colors.cream2, alignItems: "center" }}>
                    <Text style={{ fontWeight: "600" }}>Send back</Text>
                  </Pressable>
                  <Pressable onPress={() => void review("approve")} disabled={busy} style={{ flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: colors.green, alignItems: "center" }}>
                    <Text style={{ fontWeight: "600", color: colors.paper }}>{busy ? "Saving…" : "Approve"}</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}

            <View style={{ marginTop: 12, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, backgroundColor: colors.greenTint, flexDirection: "row", alignItems: "center", gap: 10 }}>
              <Icon name="clock" size={14} color={colors.greenDeep} />
              <Text style={{ fontSize: 11, color: colors.ink2, flex: 1 }}>
                Time on step <Text style={{ fontWeight: "700" }}>{elapsedLabel}</Text>
              </Text>
            </View>

            <Text style={{ marginTop: 10, fontSize: 10, color: colors.ink3, fontFamily: "monospace", lineHeight: 15 }}>
              {notify
                ? `On submit: ${notify.name} will be notified.${task?.nextPerson ? ` Dependent task will be drafted for ${task.nextPerson}.` : ""}`
                : "On submit your manager can see the proof on this step."}
            </Text>

            {!(manager && reviewKind) && !task?.claimable ? (
              <View style={{ flexDirection: "row", gap: 8, marginTop: 14 }}>
                <Pressable
                  onPress={() => router.back()}
                  style={{ paddingVertical: 12, paddingHorizontal: 14, borderRadius: 12, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.cream2 }}
                >
                  <Text style={{ color: colors.ink, fontSize: 13, fontWeight: "600" }}>Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={submit}
                  disabled={busy || (employee && reviewKind) || waiting}
                  style={{
                    flex: 1,
                    paddingVertical: 12,
                    borderRadius: 12,
                    backgroundColor: colors.green,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                    opacity: busy || (employee && reviewKind) || waiting ? 0.5 : 1,
                  }}
                >
                  <Icon name="check" size={16} color={colors.paper} />
                  <Text style={{ color: colors.paper, fontSize: 14, fontWeight: "600" }}>{busy ? "Saving…" : waiting ? "Waiting to upload" : "Submit step"}</Text>
                </Pressable>
              </View>
            ) : null}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </ScreenShell>
  );
}
