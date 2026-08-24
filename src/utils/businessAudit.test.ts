import { describe, expect, it } from "vitest";
import { getBusinessAuditUserDisplay, normalizeBusinessAuditUser } from "./businessAudit";

describe("business audit helpers", () => {
  it("normalizes the EntitySelectDTO returned by the backend", () => {
    expect(normalizeBusinessAuditUser({
      id: 12,
      label: "Nguyễn Văn A",
      subLabel: "a@example.com",
    })).toEqual({
      id: 12,
      label: "Nguyễn Văn A",
      subLabel: "a@example.com",
    });
  });

  it("supports legacy user keys and snake_case", () => {
    expect(normalizeBusinessAuditUser({
      id: "15",
      fullname: "Trần Thị B",
      sub_label: "b@example.com",
    })).toEqual({
      id: 15,
      label: "Trần Thị B",
      subLabel: "b@example.com",
    });
  });

  it("uses fullname, then email, then a dash as display fallback", () => {
    expect(getBusinessAuditUserDisplay({ label: "Nguyễn Văn A", subLabel: "a@example.com" }))
      .toEqual({ primary: "Nguyễn Văn A", secondary: "a@example.com" });
    expect(getBusinessAuditUserDisplay({ subLabel: "legacy@example.com" }))
      .toEqual({ primary: "legacy@example.com", secondary: null });
    expect(getBusinessAuditUserDisplay(null))
      .toEqual({ primary: "—", secondary: null });
  });

  it("returns null for missing audit data", () => {
    expect(normalizeBusinessAuditUser(null)).toBeNull();
    expect(normalizeBusinessAuditUser(undefined)).toBeNull();
  });
});
