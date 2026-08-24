export type BusinessAuditUser = {
  id?: number;
  label?: string;
  subLabel?: string;
};

export function normalizeBusinessAuditUser(raw: unknown): BusinessAuditUser | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  const id = value["id"];
  const label = value["label"] ?? value["fullname"] ?? value["name"];
  const subLabel = value["subLabel"] ?? value["sub_label"] ?? value["email"];
  return {
    id: id != null ? Number(id) : undefined,
    label: label != null ? String(label) : undefined,
    subLabel: subLabel != null ? String(subLabel) : undefined,
  };
}

export function getBusinessAuditUserDisplay(user?: BusinessAuditUser | null): {
  primary: string;
  secondary: string | null;
} {
  const fullname = user?.label?.trim();
  const email = user?.subLabel?.trim();
  return {
    primary: fullname || email || "—",
    secondary: fullname && email ? email : null,
  };
}
