import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

type RealtimeOptions = {
  /** Unique channel name for this subscription. */
  channel: string;
  /** public tables whose changes should trigger a refresh. */
  tables: string[];
};

type Options = {
  /** Fallback polling interval. Paused while the tab is hidden. */
  pollMs?: number;
  realtime?: RealtimeOptions;
  /** Window used to coalesce bursts of realtime events into one refresh. */
  debounceMs?: number;
  /**
   * Floor between two automatic refreshes. Online headsets heartbeat into
   * `headsets.last_seen_at` every few seconds, so without this a single active
   * device would refresh the dashboard continuously — and a fleet of twenty
   * would refresh it several times per second.
   */
  minIntervalMs?: number;
};

export type LiveData<T> = {
  data: T | null;
  /** True only until the very first result arrives — drives the full-page spinner. */
  initialLoading: boolean;
  /** True during background refreshes — must never blank the page. */
  refreshing: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
  /** Apply an optimistic local change without waiting for a round-trip. */
  mutate: (updater: (current: T | null) => T | null) => void;
};

/**
 * Keeps a snapshot of server state fresh without the UI thrash the pages used to
 * have: a single `loading` flag flipped on every poll tick made each page blank
 * itself every 15 seconds.
 *
 * Guarantees:
 *  - the spinner shows on first load only; later refreshes are silent,
 *  - polling stops while the tab is hidden and catches up on focus,
 *  - bursts of realtime events collapse into one refresh,
 *  - only the newest request may write state, and in-flight requests are aborted.
 */
export function useLiveData<T>(
  load: (signal: AbortSignal) => Promise<T>,
  options: Options = {},
): LiveData<T> {
  const { pollMs, realtime, debounceMs = 500, minIntervalMs = 8_000 } = options;

  const [data, setData] = useState<T | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Held in a ref so callers can pass an inline closure without resubscribing.
  const loadRef = useRef(load);
  loadRef.current = load;

  const mounted = useRef(true);
  const controllerRef = useRef<AbortController | null>(null);
  const requestId = useRef(0);
  const hasLoaded = useRef(false);
  const debounceTimer = useRef<number | null>(null);
  const lastRunAt = useRef(0);

  const run = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    const id = ++requestId.current;
    lastRunAt.current = Date.now();

    if (hasLoaded.current) setRefreshing(true);

    try {
      const result = await loadRef.current(controller.signal);
      if (!mounted.current || id !== requestId.current) return;
      setData(result);
      setError(null);
      hasLoaded.current = true;
    } catch (err) {
      if (controller.signal.aborted) return;
      if (!mounted.current || id !== requestId.current) return;
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      if (mounted.current && id === requestId.current) {
        setInitialLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  /**
   * Coalesces every automatic trigger (realtime burst or poll tick) into at most
   * one refresh per `minIntervalMs`. Manual `refresh()` bypasses this.
   */
  const scheduleRefresh = useCallback(() => {
    if (debounceTimer.current !== null) return;
    const sinceLastRun = Date.now() - lastRunAt.current;
    const wait = Math.max(debounceMs, minIntervalMs - sinceLastRun);
    debounceTimer.current = window.setTimeout(() => {
      debounceTimer.current = null;
      if (!document.hidden) void run();
    }, wait);
  }, [run, debounceMs, minIntervalMs]);

  const channelName = realtime?.channel;
  // Primitive dependency so an inline options object does not resubscribe.
  const tableKey = realtime?.tables.join(",") ?? "";

  useEffect(() => {
    mounted.current = true;
    void run();

    let interval: number | null = null;
    const startPolling = () => {
      if (pollMs && interval === null) {
        interval = window.setInterval(() => {
          if (!document.hidden) scheduleRefresh();
        }, pollMs);
      }
    };
    const stopPolling = () => {
      if (interval !== null) {
        window.clearInterval(interval);
        interval = null;
      }
    };

    const onVisibility = () => {
      if (document.hidden) {
        stopPolling();
      } else {
        scheduleRefresh();
        startPolling();
      }
    };

    if (!document.hidden) startPolling();
    document.addEventListener("visibilitychange", onVisibility);

    let channel: RealtimeChannel | null = null;
    if (channelName && tableKey) {
      let ch = supabase.channel(channelName);
      for (const table of tableKey.split(",")) {
        ch = ch.on(
          "postgres_changes",
          { event: "*", schema: "public", table },
          () => scheduleRefresh(),
        );
      }
      channel = ch.subscribe();
    }

    return () => {
      mounted.current = false;
      stopPolling();
      document.removeEventListener("visibilitychange", onVisibility);
      if (debounceTimer.current !== null) {
        window.clearTimeout(debounceTimer.current);
        debounceTimer.current = null;
      }
      controllerRef.current?.abort();
      if (channel) void supabase.removeChannel(channel);
    };
  }, [run, scheduleRefresh, pollMs, channelName, tableKey]);

  const mutate = useCallback((updater: (current: T | null) => T | null) => {
    setData((prev) => updater(prev));
  }, []);

  return { data, initialLoading, refreshing, error, refresh: run, mutate };
}
