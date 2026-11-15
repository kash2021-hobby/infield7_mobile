export type FormField = {
  id: string;
  type: "text" | "number" | "yesno" | "choice" | "date";
  label: string;
  required?: boolean;
  options?: string[];
};

export type Step = {
  id: string;
  title: string;
  status: string;
  kind?: string | null;
  evidence?: string | null;
  proofs?: string[];
  formId?: string | null;
  branch?: { ifTitle: string | null; elseTitle: string | null; ifLabel?: string; elseLabel?: string } | null;
  n: number;
  assigneeUserId?: string | null;
  assignee?: string | null;
  lastAt?: string | null;
};

export type TaskUpdate = { id: string; note: string | null; hasPhoto: boolean; createdAt: string; person: string };

export type ChartRow = {
  taskId: string;
  title: string;
  person: string;
  note: string | null;
  form: Record<string, string>;
  at: string;
};

export type TaskDetail = {
  id: string;
  title: string;
  status: string;
  dueOn: string | null;
  assignee: string | null;
  site: string | null;
  hasPhoto: boolean;
  workflowName: string | null;
  kind?: string | null;
  proofs?: string[];
  formId?: string | null;
  branch?: { ifTitle: string | null; elseTitle: string | null; ifLabel?: string; elseLabel?: string } | null;
  form?: { id: string; name: string; fields: FormField[] } | null;
  chart?: ChartRow[];
  claimable?: boolean;
  sendBackNote?: string | null;
  updates: TaskUpdate[];
  steps: Step[];
  alertGoesTo?: { name: string; role: string } | null;
  nextId?: string | null;
  nextPerson?: string | null;
  nextTitle?: string | null;
};

export function proofLine(proofs: string[] | undefined, evidence?: string | null) {
  const list = proofs?.length
    ? proofs
    : evidence === "geofence"
      ? ["geofence"]
      : evidence === "signature"
        ? ["signature"]
        : evidence === "form"
          ? ["form"]
          : evidence === "photo"
            ? ["photo"]
            : [];
  if (!list.length) return "Mark done when finished";
  const labels: Record<string, string> = {
    selfie: "Selfie",
    photo: "Photo of the work",
    geofence: "At the site",
    signature: "Signature",
    form: "Form",
  };
  return list.map((id) => labels[id] ?? id).join(" · ");
}
