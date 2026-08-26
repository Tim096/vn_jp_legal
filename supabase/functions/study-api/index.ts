import { createClient } from "npm:@supabase/supabase-js@2.112.4";

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const adminEmail = (Deno.env.get("ADMIN_EMAIL") || "").trim().toLowerCase();
const defaultSiteUrl = (Deno.env.get("SITE_URL") || "").replace(/\/$/, "");
const allowedOrigins = (Deno.env.get("ALLOWED_ORIGINS") || "*")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

const service = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

type JsonRecord = Record<string, unknown>;

function corsHeaders(request: Request) {
  const origin = request.headers.get("origin") || "";
  const allowOrigin = allowedOrigins.includes("*") || allowedOrigins.includes(origin) ? (origin || "*") : allowedOrigins[0];
  return {
    "Access-Control-Allow-Origin": allowOrigin || "*",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
    "Vary": "Origin"
  };
}

function respond(request: Request, body: JsonRecord, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders(request) });
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function cleanString(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : null;
}

function normalizeAccount(value: unknown) {
  return cleanString(value, 40)?.toLowerCase() || null;
}

async function learnerForToken(token: unknown) {
  if (typeof token !== "string" || !/^[a-f0-9]{64}$/i.test(token)) return null;
  const tokenHash = await sha256(token.toLowerCase());
  const { data, error } = await service.from("learners").select("*").eq("token_hash", tokenHash).maybeSingle();
  if (error) throw error;
  return data;
}

async function learnerForAccount(account: unknown) {
  const normalized = normalizeAccount(account);
  if (!normalized) return null;
  const { data, error } = await service.from("learners").select("*").eq("account", normalized).maybeSingle();
  if (error) throw error;
  return data;
}

async function requireAdmin(request: Request) {
  const authorization = request.headers.get("authorization") || "";
  const accessToken = authorization.replace(/^Bearer\s+/i, "");
  if (!accessToken) return null;
  const { data, error } = await service.auth.getUser(accessToken);
  if (error || !data.user?.email || data.user.email.toLowerCase() !== adminEmail) return null;
  await service.from("admin_users").upsert({ user_id: data.user.id }, { onConflict: "user_id" });
  return data.user;
}

async function snapshotForLearner(learnerId: string) {
  const { data, error } = await service
    .from("study_snapshots")
    .select("payload, client_updated_at, updated_at")
    .eq("learner_id", learnerId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request) });
  if (request.method !== "POST") return respond(request, { error: "Method not allowed" }, 405);

  try {
    const body = await request.json() as JsonRecord;
    const action = cleanString(body.action, 40);

    if (action === "admin-bootstrap") {
      const user = await requireAdmin(request);
      if (!user) return respond(request, { error: "Forbidden" }, 403);
      return respond(request, { ok: true, email: user.email || "" });
    }

    if (action === "create-account") {
      const user = await requireAdmin(request);
      if (!user) return respond(request, { error: "Forbidden" }, 403);
      const displayName = cleanString(body.account, 40);
      const account = normalizeAccount(body.account);
      if (!displayName || !account) return respond(request, { error: "Account is required" }, 400);
      if (await learnerForAccount(account)) return respond(request, { error: "Account already exists" }, 409);
      const tokenHash = await sha256(randomToken());
      const { data, error } = await service
        .from("learners")
        .insert({ account, display_name: displayName, token_hash: tokenHash })
        .select("id, account, display_name")
        .single();
      if (error) throw error;
      return respond(request, { ok: true, learner: data });
    }

    if (action === "update-account") {
      const user = await requireAdmin(request);
      if (!user) return respond(request, { error: "Forbidden" }, 403);
      const learnerId = cleanString(body.learnerId, 80);
      const displayName = cleanString(body.account, 40);
      const account = normalizeAccount(body.account);
      if (!learnerId || !/^[a-f0-9-]{36}$/i.test(learnerId)) return respond(request, { error: "Invalid learner ID" }, 400);
      if (!displayName || !account) return respond(request, { error: "Account is required" }, 400);
      const existing = await learnerForAccount(account);
      if (existing && existing.id !== learnerId) return respond(request, { error: "Account already exists" }, 409);
      const { data, error } = await service
        .from("learners")
        .update({ account, display_name: displayName })
        .eq("id", learnerId)
        .select("id, account, display_name")
        .maybeSingle();
      if (error) throw error;
      if (!data) return respond(request, { error: "Learner not found" }, 404);
      return respond(request, { ok: true, learner: data });
    }

    if (action === "login-account") {
      const learner = await learnerForAccount(body.account);
      if (!learner) return respond(request, { error: "Account not found" }, 401);
      const token = randomToken();
      const now = new Date().toISOString();
      const { data, error } = await service
        .from("learners")
        .update({ token_hash: await sha256(token), token_rotated_at: now, paired_at: now, last_seen: now })
        .eq("id", learner.id)
        .select("id, account, display_name")
        .single();
      if (error) throw error;
      return respond(request, { ok: true, token, learner: data, snapshot: await snapshotForLearner(learner.id) });
    }

    if (action === "create-invite") {
      const user = await requireAdmin(request);
      if (!user) return respond(request, { error: "Forbidden" }, 403);
      const token = randomToken();
      const tokenHash = await sha256(token);
      const learnerId = cleanString(body.learnerId, 80);
      let learner;

      if (learnerId) {
        const { data, error } = await service
          .from("learners")
          .update({ token_hash: tokenHash, token_rotated_at: new Date().toISOString() })
          .eq("id", learnerId)
          .select("id, display_name")
          .single();
        if (error) throw error;
        learner = data;
      } else {
        const { data, error } = await service
          .from("learners")
          .insert({ token_hash: tokenHash })
          .select("id, display_name")
          .single();
        if (error) throw error;
        learner = data;
      }

      const requestedSiteUrl = cleanString(body.siteUrl, 500)?.replace(/\/$/, "");
      const siteUrl = requestedSiteUrl || defaultSiteUrl;
      if (!siteUrl) return respond(request, { error: "SITE_URL is not configured" }, 500);
      return respond(request, { ok: true, learner, inviteUrl: `${siteUrl}/#pair=${token}` });
    }

    if (action === "delete-learner") {
      const user = await requireAdmin(request);
      if (!user) return respond(request, { error: "Forbidden" }, 403);
      const learnerId = cleanString(body.learnerId, 80);
      if (!learnerId || !/^[a-f0-9-]{36}$/i.test(learnerId)) {
        return respond(request, { error: "Invalid learner ID" }, 400);
      }
      const { data, error } = await service
        .from("learners")
        .delete()
        .eq("id", learnerId)
        .select("id, display_name")
        .maybeSingle();
      if (error) throw error;
      if (!data) return respond(request, { error: "Learner not found" }, 404);
      return respond(request, { ok: true, learner: data });
    }

    if (action === "pair") {
      const learner = await learnerForToken(body.token);
      if (!learner) return respond(request, { error: "Invalid pairing link" }, 401);
      const displayName = cleanString(body.displayName, 40);
      if (!displayName) return respond(request, { error: "Name is required" }, 400);
      const now = new Date().toISOString();
      const { data, error } = await service
        .from("learners")
        .update({ display_name: displayName, paired_at: now, last_seen: now })
        .eq("id", learner.id)
        .select("id, display_name")
        .single();
      if (error) throw error;
      return respond(request, { ok: true, learner: data, snapshot: await snapshotForLearner(learner.id) });
    }

    if (action === "pull") {
      const learner = await learnerForToken(body.token);
      if (!learner) return respond(request, { error: "Invalid pairing token" }, 401);
      return respond(request, {
        ok: true,
        learner: { id: learner.id, display_name: learner.display_name },
        snapshot: await snapshotForLearner(learner.id)
      });
    }

    if (action === "heartbeat") {
      const learner = await learnerForToken(body.token);
      if (!learner) return respond(request, { error: "Invalid pairing token" }, 401);
      const now = new Date();
      const minute = new Date(now);
      minute.setSeconds(0, 0);
      const mode = cleanString(body.mode, 40);
      const questionId = cleanString(body.questionId, 100);
      const { error: learnerError } = await service.from("learners").update({
        last_seen: now.toISOString(),
        current_mode: mode,
        current_question_id: questionId
      }).eq("id", learner.id);
      if (learnerError) throw learnerError;
      const { error: activityError } = await service.from("activity_minutes").upsert({
        learner_id: learner.id,
        minute_at: minute.toISOString()
      }, { onConflict: "learner_id,minute_at", ignoreDuplicates: true });
      if (activityError) throw activityError;
      return respond(request, { ok: true, serverTime: now.toISOString() });
    }

    if (action === "sync") {
      const learner = await learnerForToken(body.token);
      if (!learner) return respond(request, { error: "Invalid pairing token" }, 401);
      const snapshot = body.snapshot as JsonRecord | undefined;
      if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
        return respond(request, { error: "Invalid snapshot" }, 400);
      }
      if (JSON.stringify(snapshot).length > 1_500_000) return respond(request, { error: "Snapshot too large" }, 413);
      const clientUpdatedAt = Number(snapshot.updatedAt);
      if (!Number.isFinite(clientUpdatedAt)) return respond(request, { error: "Invalid update time" }, 400);

      const { error: snapshotError } = await service.from("study_snapshots").upsert({
        learner_id: learner.id,
        payload: snapshot,
        client_updated_at: clientUpdatedAt,
        updated_at: new Date().toISOString()
      }, { onConflict: "learner_id" });
      if (snapshotError) throw snapshotError;

      const rawEvents = Array.isArray(body.events) ? body.events.slice(0, 20) : [];
      if (rawEvents.length) {
        const events = rawEvents.map((raw) => {
          const event = raw as JsonRecord;
          return {
            client_event_id: cleanString(event.clientEventId, 40),
            learner_id: learner.id,
            event_type: cleanString(event.eventType, 60) || "activity",
            question_id: cleanString(event.questionId, 100),
            chapter: cleanString(event.chapter, 40),
            mode: cleanString(event.mode, 40),
            correct: typeof event.correct === "boolean" ? event.correct : null,
            score: Number.isInteger(event.score) ? event.score : null,
            metadata: typeof event.metadata === "object" && event.metadata && !Array.isArray(event.metadata) ? event.metadata : {},
            occurred_at: typeof event.occurredAt === "string" ? event.occurredAt : new Date().toISOString()
          };
        });
        if (events.some((event) => !event.client_event_id || !/^[a-f0-9-]{36}$/i.test(event.client_event_id))) {
          return respond(request, { error: "Invalid event ID" }, 400);
        }
        const { error: eventError } = await service
          .from("study_events")
          .upsert(events, { onConflict: "client_event_id", ignoreDuplicates: true });
        if (eventError) throw eventError;
      }

      await service.from("learners").update({ last_seen: new Date().toISOString() }).eq("id", learner.id);
      return respond(request, { ok: true, clientUpdatedAt });
    }

    return respond(request, { error: "Unknown action" }, 400);
  } catch (error) {
    console.error(error);
    return respond(request, { error: "Request failed" }, 500);
  }
});
