import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useRealtimeSubscription } from "@/hooks/useRealtimeSubscription";

const realtime = vi.hoisted(() => {
  const handlers: Array<() => void> = [];
  const channel = { on: vi.fn(), subscribe: vi.fn() };
  channel.on.mockImplementation((_event: string, _filter: unknown, handler: () => void) => {
    handlers.push(handler);
    return channel;
  });

  return {
    handlers,
    channel,
    createChannel: vi.fn(() => channel),
    removeChannel: vi.fn(),
  };
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    channel: realtime.createChannel,
    removeChannel: realtime.removeChannel,
  },
}));

describe("useRealtimeSubscription", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    realtime.handlers.length = 0;
    realtime.channel.on.mockClear();
    realtime.channel.subscribe.mockClear();
    realtime.createChannel.mockClear();
    realtime.removeChannel.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("uses the latest callback without recreating the channel or changing the debounce", () => {
    const firstCallback = vi.fn();
    const latestCallback = vi.fn();
    const { rerender, unmount } = renderHook(
      ({ onchange }) => useRealtimeSubscription({
        tables: ["agendamentos", "treatment_sessions"],
        onchange,
        debounceMs: 400,
      }),
      { initialProps: { onchange: firstCallback } },
    );

    rerender({ onchange: latestCallback });
    expect(realtime.createChannel).toHaveBeenCalledTimes(1);
    expect(realtime.channel.subscribe).toHaveBeenCalledTimes(1);

    act(() => realtime.handlers[0]());
    act(() => vi.advanceTimersByTime(399));
    expect(firstCallback).not.toHaveBeenCalled();
    expect(latestCallback).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(firstCallback).not.toHaveBeenCalled();
    expect(latestCallback).toHaveBeenCalledTimes(1);

    unmount();
    expect(realtime.removeChannel).toHaveBeenCalledTimes(1);
  });

  it("clears a pending debounce when the hook unmounts", () => {
    const onchange = vi.fn();
    const { unmount } = renderHook(() => useRealtimeSubscription({
      tables: ["agendamentos"],
      onchange,
      debounceMs: 400,
    }));

    act(() => realtime.handlers[0]());
    unmount();
    act(() => vi.advanceTimersByTime(400));

    expect(onchange).not.toHaveBeenCalled();
    expect(realtime.removeChannel).toHaveBeenCalledTimes(1);
  });
});
