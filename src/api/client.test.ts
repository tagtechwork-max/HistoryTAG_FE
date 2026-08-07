import { describe, expect, it } from "vitest";
import axios from "axios";
import { isRequestCanceled } from "./client";

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
