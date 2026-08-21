import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const channelMock = {
  on: vi.fn(),
  subscribe: vi.fn(),
};
// `on` is chainable and `subscribe` returns the channel.
channelMock.on.mockReturnValue(channelMock);
channelMock.subscribe.mockReturnValue(channelMock);

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    channel: () => channelMock,
    removeChannel: vi.fn(),
  },
}));

const { useLiveData } = await import("@/hooks/useLiveData");

// Testing Library's waitFor drives real timers, so it deadlocks against
// vi.useFakeTimers(); these helpers drain microtasks explicitly instead.
async function flush() {
  await act(async () => {
    for (let i = 0; i < 8; i++) await Promise.resolve();
  });
}

async function advance(ms: number) {
  await act(async () => {
    vi.advanceTimersByTime(ms);
    for (let i = 0; i < 8; i++) await Promise.resolve();
  });
}

describe("useLiveData", () => {
  let hidden = false;

  beforeEach(() => {
    vi.useFakeTimers();
    hidden = false;
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => hidden,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("shows the initial spinner once and never again on refresh", async () => {
    let value = 1;
    const load = vi.fn(async () => value);
    const { result } = renderHook(() =>
      useLiveData(load, { pollMs: 10_000, minIntervalMs: 0 }),
    );

    expect(result.current.initialLoading).toBe(true);
    await flush();
    expect(result.current.initialLoading).toBe(false);
    expect(result.current.data).toBe(1);

    // A background poll must not put the page back into its loading state,
    // which is what used to blank the dashboard every 15 seconds.
    // pollMs plus the coalescing window.
    value = 2;
    await advance(11_000);
    expect(result.current.data).toBe(2);
    expect(result.current.initialLoading).toBe(false);
  });

  it("keeps the previous data when a refresh fails, and exposes the error", async () => {
    let shouldFail = false;
    const load = vi.fn(async () => {
      if (shouldFail) throw new Error("réseau indisponible");
      return "ok";
    });
    const { result } = renderHook(() =>
      useLiveData(load, { pollMs: 5_000, minIntervalMs: 0 }),
    );

    await flush();
    expect(result.current.data).toBe("ok");

    shouldFail = true;
    await advance(6_000);
    expect(result.current.error?.message).toBe("réseau indisponible");
    expect(result.current.data).toBe("ok");
  });

  it("rate-limits automatic refreshes to one per minIntervalMs", async () => {
    const load = vi.fn(async () => "x");
    renderHook(() => useLiveData(load, { pollMs: 1_000, minIntervalMs: 8_000 }));

    await flush();
    expect(load).toHaveBeenCalledTimes(1);

    // Eight poll ticks inside one window must collapse into a single refresh.
    await advance(7_000);
    expect(load).toHaveBeenCalledTimes(1);

    await advance(2_000);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("stops polling while the tab is hidden and catches up when it returns", async () => {
    const load = vi.fn(async () => "x");
    renderHook(() => useLiveData(load, { pollMs: 1_000, minIntervalMs: 0 }));

    await flush();
    expect(load).toHaveBeenCalledTimes(1);

    hidden = true;
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await advance(10_000);
    expect(load).toHaveBeenCalledTimes(1);

    hidden = false;
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await advance(1_000);
    expect(load.mock.calls.length).toBeGreaterThan(1);
  });

  it("applies optimistic updates through mutate", async () => {
    const load = vi.fn(async () => ["a"]);
    const { result } = renderHook(() => useLiveData(load, { minIntervalMs: 0 }));

    await flush();
    expect(result.current.data).toEqual(["a"]);

    act(() => {
      result.current.mutate((current) => [...(current ?? []), "b"]);
    });
    expect(result.current.data).toEqual(["a", "b"]);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("subscribes to the requested realtime tables", async () => {
    const load = vi.fn(async () => "x");
    renderHook(() =>
      useLiveData(load, {
        realtime: { channel: "test-channel", tables: ["headsets", "sync_reports"] },
      }),
    );
    await flush();

    const tables = channelMock.on.mock.calls.map((call) => call[1].table);
    expect(tables).toEqual(["headsets", "sync_reports"]);
    expect(channelMock.subscribe).toHaveBeenCalled();
  });
});
