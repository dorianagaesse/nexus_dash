"use client";

import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";

import { createTabLeaderCoordinator } from "@/lib/tab-leader-coordinator";

interface RealtimeTokenResponse {
  token: string;
  expiresAt: string;
  supabaseUrl: string;
  supabasePublishableKey: string;
}

let cachedToken: RealtimeTokenResponse | null = null;
let pendingToken: Promise<RealtimeTokenResponse> | null = null;
let sharedClient: Promise<SupabaseClient> | null = null;
const activeChannels = new Set<RealtimeChannel>();

export async function getRealtimeToken(): Promise<string> {
  if (
    cachedToken &&
    Date.parse(cachedToken.expiresAt) - Date.now() > 30_000
  ) {
    return cachedToken.token;
  }
  pendingToken ??= (async () => {
    const response = await fetch("/api/realtime/token", {
      method: "POST",
      cache: "no-store",
      credentials: "same-origin",
    });
    if (!response.ok) {
      cachedToken = null;
      throw new Error(`Realtime token request failed (${response.status})`);
    }
    const token = (await response.json()) as RealtimeTokenResponse;
    if (!token.token || !token.supabaseUrl || !token.supabasePublishableKey) {
      throw new Error("Realtime token response is incomplete");
    }
    cachedToken = token;
    return token;
  })().finally(() => {
    pendingToken = null;
  });
  return (await pendingToken).token;
}

async function getClient(): Promise<SupabaseClient> {
  sharedClient ??= (async () => {
    await getRealtimeToken();
    const { createClient } = await import("@supabase/supabase-js");
    const config = cachedToken;
    if (!config) {
      throw new Error("Realtime token is unavailable");
    }
    const client = createClient(config.supabaseUrl, config.supabasePublishableKey, {
      accessToken: getRealtimeToken,
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    });
    // Resolve the JWT before joining and keep the callback as the source for
    // later heartbeat refreshes.
    await client.realtime.setAuth();
    return client;
  })().catch((error) => {
    sharedClient = null;
    throw error;
  });
  return sharedClient;
}

function releaseChannel(client: SupabaseClient, channel: RealtimeChannel) {
  activeChannels.delete(channel);
  void client.removeChannel(channel);
  if (activeChannels.size === 0) {
    client.realtime.disconnect();
    sharedClient = null;
    cachedToken = null;
  }
}

export interface BroadcastSubscriptionOptions<TPayload> {
  scope: string;
  topic: string;
  event: string;
  onMessage: (payload: TPayload) => void;
  reconcile: () => Promise<TPayload>;
  onFailure: () => void;
}

// One coordinator per scope leaves only visible leaders connected. A tab that
// leads both scopes uses the same Supabase client and one multiplexed socket.
export function startBroadcastSubscription<TPayload>(
  options: BroadcastSubscriptionOptions<TPayload>
): () => void {
  let stopped = false;
  let generation = 0;
  let subscribed = false;
  let release: (() => void) | null = null;

  async function reconcile() {
    try {
      const payload = await options.reconcile();
      if (stopped) return;
      options.onMessage(payload);
      coordinator.publish(payload);
    } catch {
      if (!stopped) options.onFailure();
    }
  }

  async function join() {
    const currentGeneration = ++generation;
    try {
      const client = await getClient();
      if (stopped || currentGeneration !== generation) {
        return;
      }
      const channel = client.channel(options.topic, {
        config: { private: true },
      });
      activeChannels.add(channel);
      release = () => releaseChannel(client, channel);
      channel
        .on("broadcast", { event: options.event }, ({ payload }) => {
          if (stopped || currentGeneration !== generation) return;
          options.onMessage(payload as TPayload);
          coordinator.publish(payload as TPayload);
        })
        .subscribe((status) => {
          if (stopped || currentGeneration !== generation) return;
          if (status === "SUBSCRIBED") {
            subscribed = true;
            void reconcile();
          } else if (
            status === "CHANNEL_ERROR" ||
            status === "TIMED_OUT" ||
            status === "CLOSED"
          ) {
            options.onFailure();
          }
        });
    } catch {
      if (!stopped && currentGeneration === generation) {
        options.onFailure();
      }
    }
  }

  function leave() {
    generation += 1;
    subscribed = false;
    release?.();
    release = null;
  }

  const coordinator = createTabLeaderCoordinator<TPayload>({
    scope: options.scope,
    initialVisible: !document.hidden,
    onRoleChange(isLeader) {
      if (isLeader) void join();
      else leave();
    },
    onData: options.onMessage,
    onRefreshRequest() {
      if (subscribed && coordinator.getRole() === "leader") void reconcile();
    },
  });

  function handleVisibility() {
    coordinator.setVisible(!document.hidden);
  }
  coordinator.start();
  document.addEventListener("visibilitychange", handleVisibility);
  return () => {
    stopped = true;
    document.removeEventListener("visibilitychange", handleVisibility);
    coordinator.stop();
    leave();
  };
}
