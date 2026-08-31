import { beforeEach, describe, expect, it, vi } from "vitest";
import axios from "axios";
import { fetchWithAuth, isRequestCanceled } from "./client";

function unexpiredToken(): string {
  const payload = btoa(
    JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 60 * 60 })
  );
  return `header.${payload}.signature`;
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.unstubAllGlobals();
});

describe("isRequestCanceled", () => {
  it("recognizes native and Axios cancellation errors", () => {
    expect(isRequestCanceled(new DOMException("aborted", "AbortError"))).toBe(true);
    expect(isRequestCanceled(new axios.CanceledError("canceled"))).toBe(true);
    expect(isRequestCanceled(Object.assign(new Error("aborted"), { name: "CanceledError" }))).toBe(true);
  });

  it("does not hide normal request failures", () => {
    expect(isRequestCanceled(new Error("server failed"))).toBe(false);
    expect(isRequestCanceled(null)).toBe(false);
  });
});

describe("fetchWithAuth", () => {
  it("attaches an access token stored in sessionStorage", async () => {
    const token = unexpiredToken();
    sessionStorage.setItem("access_token", token);
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await fetchWithAuth("/api/v1/admin/dashboard/user/summary");

    expect(fetchMock).toHaveBeenCalledOnce();
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(new Headers(init.headers).get("Authorization")).toBe(`Bearer ${token}`);
    expect(init.credentials).toBe("include");
  });
});
