import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Content-Type": "application/json",
};

const ADMIN_USER_ID = "00000000-0000-0000-0000-000000000001";

async function getValidToken(supabaseAdmin: any): Promise<string> {
  const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID")!;
  const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET")!;

  const { data, error } = await supabaseAdmin
    .from("google_calendar_tokens")
    .select("*")
    .eq("user_id", ADMIN_USER_ID)
    .single();

  if (error || !data) throw new Error("Google Calendar not connected");

  const expiresAt = new Date(data.expires_at);
  if (expiresAt > new Date(Date.now() + 5 * 60 * 1000)) {
    return data.access_token;
  }

  // Token expired, refresh it
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: data.refresh_token,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Token refresh failed: ${err}`);
  }

  const tokens = await res.json();
  const newExpiry = new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString();

  await supabaseAdmin
    .from("google_calendar_tokens")
    .update({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token ?? data.refresh_token,
      expires_at: newExpiry,
    })
    .eq("user_id", ADMIN_USER_ID);

  return tokens.access_token;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return new Response(JSON.stringify({ error: "Supabase environment variables not configured" }), {
        status: 500,
        headers: corsHeaders,
      });
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { action, event, eventId } = await req.json();
    const CALENDAR_API = "https://www.googleapis.com/calendar/v3";

    const accessToken = await getValidToken(supabaseAdmin);

    if (action === "create_event") {
      const res = await fetch(`${CALENDAR_API}/calendars/primary/events?sendUpdates=all`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(event),
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Create event failed [${res.status}]: ${err}`);
      }

      const created = await res.json();
      return new Response(JSON.stringify({ success: true, eventId: created.id }), {
        status: 200,
        headers: corsHeaders,
      });
    }

    if (action === "update_event") {
      const res = await fetch(`${CALENDAR_API}/calendars/primary/events/${eventId}?sendUpdates=all`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(event),
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Update event failed [${res.status}]: ${err}`);
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: corsHeaders,
      });
    }

    if (action === "delete_event") {
      const res = await fetch(`${CALENDAR_API}/calendars/primary/events/${eventId}?sendUpdates=all`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!res.ok && res.status !== 410) {
        const err = await res.text();
        throw new Error(`Delete event failed [${res.status}]: ${err}`);
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: corsHeaders,
      });
    }

    if (action === "list_events") {
      const now = new Date().toISOString();
      const maxDate = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();

      const res = await fetch(
        `${CALENDAR_API}/calendars/primary/events?timeMin=${encodeURIComponent(now)}&timeMax=${encodeURIComponent(maxDate)}&singleEvents=true&orderBy=startTime&maxResults=250`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`List events failed [${res.status}]: ${err}`);
      }

      const data = await res.json();
      return new Response(JSON.stringify({ success: true, events: data.items || [] }), {
        status: 200,
        headers: corsHeaders,
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400,
      headers: corsHeaders,
    });
  } catch (err) {
    console.error("Calendar sync error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: corsHeaders },
    );
  }
});