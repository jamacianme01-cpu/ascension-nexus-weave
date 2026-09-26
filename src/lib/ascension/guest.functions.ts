import { createServerFn } from "@tanstack/react-start";

import type { Json } from "@/integrations/supabase/types";
import type { ObjectiveRun } from "./objectives.functions";
import type { ObjectiveDelivery } from "./result-model";
import type { StageRow } from "./engine/delivery.server";

/**
 * Anonymous Book path. No sign-in and no service-role key: every call uses the
 * publishable key and SECURITY DEFINER RPCs that only accept a private guest
 * key held in an httpOnly cookie. The database stores only its SHA-256 hash,
 * so a guest can reach only their own objectives. Submission still only
 * queues the objective for the governed runtime; nothing executes here.
 */

const COOKIE = "ascension_guest";
const MAX_AGE = 60 * 60 * 24 * 180;

export interface GuestDeliveryState {
  created_at: string;
  status: string;
  response_payload: ObjectiveDelivery | null;
  error: string | null;
  engine_model: string | null;
  engine_label: string;
}

async function publicClient() {
  const { createClient } = await import("@supabase/supabase-js");
  const url = process.env["SUPABASE_URL"] ?? process.env["VITE_SUPABASE_URL"];
  const key =
    process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["VITE_SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) throw new Error("ASCENSION is not connected to its database.");
  return createClient(url, key, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`)
          h.delete("Authorization");
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
}

async function guestKey(create: boolean): Promise<string | null> {
  const { getCookie, setCookie } = await import("@tanstack/react-start/server");
  const existing = getCookie(COOKIE);
  if (existing && /^[A-Za-z0-9_-]{43,128}$/.test(existing)) return existing;
  if (!create) return null;
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const key = btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  setCookie(COOKIE, key, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env["NODE_ENV"] === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
  return key;
}

async function readRun(key: string, requestId: string) {
  const db = await publicClient();
  const { data, error } = await db.rpc("get_guest_objective" as never, {
    p_guest_key: key,
    p_request_id: requestId,
  } as never);
  if (error) throw new Error(error.message);
  return (data as unknown as ObjectiveRun | null) ?? null;
}

async function readDelivery(key: string, run: ObjectiveRun) {
  const db = await publicClient();
  const { data, error } = await db.rpc("get_guest_delivery_stages" as never, {
    p_guest_key: key,
    p_request_id: run.id,
  } as never);
  if (error) throw new Error(error.message);
  const stages = (Array.isArray(data) ? data : []) as Array<
    GuestDeliveryState & { ordinal: number; response_payload: Json | null }
  >;
  const strip = (s: (typeof stages)[number] | undefined) => {
    if (!s) return null;
    const { ordinal: _o, ...rest } = s;
    void _o;
    return rest;
  };
  const current = strip(stages.find((s) => s.ordinal === 100));
  const artifact = stages.find((s) => s.ordinal === 101) ?? null;
  const { projectDelivery } = await import("./engine/delivery.server");
  return projectDelivery(
    run,
    current as never,
    artifact,
  ) as unknown as GuestDeliveryState;
}

function validateRequestId(input: { requestId: string; retry?: boolean }) {
  if (!/^[a-f0-9-]{36}$/i.test(input.requestId)) throw new Error("A valid request id is required.");
  return { requestId: input.requestId, retry: input.retry === true };
}

export const submitGuestObjective = createServerFn({ method: "POST" })
  .inputValidator(
    (input: {
      objective: string;
      evidence?: string[];
      constraints?: string[];
      parentRequestId?: string;
      followUp?: "continue" | "refine" | "simulate" | "execute";
    }) => {
      const objective = input.objective?.trim();
      if (!objective) throw new Error("An objective statement is required.");
      const clean = (list: string[] | undefined, max: number) => {
        const items = (list ?? [])
          .map((item) => item.trim())
          .filter(Boolean)
          .slice(0, 32);
        return items.length ? items.map((item) => item.slice(0, max)) : null;
      };
      return {
        objective: objective.slice(0, 4000),
        evidence: clean(input.evidence, 2000),
        constraints: clean(input.constraints, 500),
        parentRequestId: input.parentRequestId ?? null,
        followUp: input.followUp ?? null,
      };
    },
  )
  .handler(async ({ data }) => {
    const key = (await guestKey(true))!;
    let evidence = data.evidence;

    if (data.parentRequestId) {
      if (
        !/^[a-f0-9-]{36}$/i.test(data.parentRequestId) ||
        !["continue", "refine", "simulate", "execute"].includes(data.followUp ?? "")
      )
        throw new Error("Invalid follow-up reference.");
      const parent = await readRun(key, data.parentRequestId);
      if (!parent) throw new Error("The earlier objective is unavailable.");
      const delivery = await readDelivery(key, parent);
      const contextText = JSON.stringify({
        parent_request_id: parent.id,
        requested_action: data.followUp,
        prior_objective: parent.objective,
        prior_result: delivery?.status === "completed" ? delivery.response_payload : null,
        verification: "Prior result supplied as continuation context only; not verified evidence.",
      });
      if (contextText.length > 60000)
        throw new Error("The earlier result is too large to include in one follow-up.");
      evidence = [...(evidence ?? []), contextText];
    }

    const db = await publicClient();
    const { data: row, error } = await db.rpc("submit_guest_objective" as never, {
      p_guest_key: key,
      p_objective: data.objective,
      p_evidence: evidence,
      p_constraints: data.constraints,
    } as never);
    if (error) throw new Error(error.message);
    return { accepted: true, executed_here: false, request: row as unknown as ObjectiveRun };
  });

export const getGuestObjectiveStatus = createServerFn({ method: "GET" })
  .inputValidator(validateRequestId)
  .handler(async ({ data }) => {
    const key = await guestKey(false);
    if (!key) return { request: null };
    return { request: await readRun(key, data.requestId) };
  });

async function guestDelivery(requestId: string) {
  const key = await guestKey(false);
  if (!key) return null;
  const run = await readRun(key, requestId);
  if (!run) return null;
  return readDelivery(key, run);
}

export const getGuestObjectiveDelivery = createServerFn({ method: "GET" })
  .inputValidator(validateRequestId)
  .handler(async ({ data }) => guestDelivery(data.requestId));

export const prepareGuestObjectiveDelivery = createServerFn({ method: "POST" })
  .inputValidator(validateRequestId)
  .handler(async ({ data }) => {
    const delivery = await guestDelivery(data.requestId);
    if (!delivery) throw new Error("This objective is unavailable.");
    return delivery as unknown as StageRow;
  });
