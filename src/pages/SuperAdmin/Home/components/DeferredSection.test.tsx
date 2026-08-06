import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { DeferredSection } from "./DeferredSection";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("DeferredSection", () => {
  it("renders children immediately when IntersectionObserver is unavailable", async () => {
    Reflect.deleteProperty(window, "IntersectionObserver");
    render(<DeferredSection placeholder={<span>loading</span>}><span>report</span></DeferredSection>);

    expect(await screen.findByText("report")).toBeTruthy();
    expect(screen.queryByText("loading")).toBeNull();
  });

  it("keeps the placeholder until the section intersects and disconnects the observer", async () => {
    let callback: IntersectionObserverCallback | undefined;
    const disconnect = vi.fn();
    class TestIntersectionObserver {
      constructor(next: IntersectionObserverCallback) { callback = next; }
      observe = vi.fn();
      disconnect = disconnect;
      unobserve = vi.fn();
      takeRecords = vi.fn(() => []);
      root = null;
      rootMargin = "0px";
      thresholds = [0];
    }
    vi.stubGlobal("IntersectionObserver", TestIntersectionObserver);

    render(<DeferredSection placeholder={<span>loading</span>}><span>report</span></DeferredSection>);
    expect(screen.getByText("loading")).toBeTruthy();

    callback?.([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);

    expect(await screen.findByText("report")).toBeTruthy();
    expect(disconnect).toHaveBeenCalled();
  });
});
