import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Content-Type": "application/json",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID");
    const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");

    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      return new Response(JSON.stringify({ error: "Google credentials not configured" }), {
        status: 500,
        headers: corsHeaders,
      });
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_ANON_KEY) {
      return new Response(JSON.stringify({ error: "Supabase environment variables not configured correctly" }), {
        status: 500,
        headers: corsHeaders,
      });
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: corsHeaders,
      });
    }

    const supabaseUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: userError,
    } = await supabaseUser.auth.getUser();

    if (userError || !user) {
      console.error("Invalid token / user error:", userError);
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: corsHeaders,
      });
    }

    const body = await req.json();
    const { action, code, redirect_uri } = body;

    if (!action) {
      return new Response(JSON.stringify({ error: "Action is required" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    if (action === "get_auth_url") {
      if (!redirect_uri) {
        return new Response(JSON.stringify({ error: "redirect_uri is required" }), {
          status: 400,
          headers: corsHeaders,
        });
      }

      const scopes = [
        "https://www.googleapis.com/auth/calendar",
        "https://www.googleapis.com/auth/calendar.events",
      ].join(" ");

      const params = new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        redirect_uri,
        response_type: "code",
        scope: scopes,
        access_type: "offline",
        prompt: "consent",
        state: user.id,
      });

      const url = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

      return new Response(JSON.stringify({ url }), {
        status: 200,
        headers: corsHeaders,
      });
    }

    if (action === "exchange_code") {
      if (!code || !redirect_uri) {
        return new Response(JSON.stringify({ error: "code and redirect_uri are required" }), {
          status: 400,
          headers: corsHeaders,
        });
      }

      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri,
          client_id: GOOGLE_CLIENT_ID,
          client_secret: GOOGLE_CLIENT_SECRET,
        }),
      });

      if (!tokenRes.ok) {
        const errText = await tokenRes.text();
        console.error("Token exchange failed:", errText);

        return new Response(
          JSON.stringify({
            error: "Token exchange failed",
            details: errText,
          }),
          {
            status: 400,
            headers: corsHeaders,
          },
        );
      }

      const tokens = await tokenRes.json();
      const expiresAt = new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString();

      const payload: {
        user_id: string;
        access_token: string;
        refresh_token?: string;
        expires_at: string;
      } = {
        user_id: user.id,
        access_token: tokens.access_token,
        expires_at: expiresAt,
      };

      if (tokens.refresh_token) {
        payload.refresh_token = tokens.refresh_token;
      }

      const { data: existingToken } = await supabaseAdmin
        .from("google_calendar_tokens")
        .select("refresh_token")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!payload.refresh_token && existingToken?.refresh_token) {
        payload.refresh_token = existingToken.refresh_token;
      }

      const { error: dbError } = await supabaseAdmin
        .from("google_calendar_tokens")
        .upsert(payload, { onConflict: "user_id" });

      if (dbError) {
        console.error("DB error while storing Google tokens:", dbError);
        return new Response(JSON.stringify({ error: "Failed to store tokens" }), {
          status: 500,
          headers: corsHeaders,
        });
      }

      return new Response(JSON.stringify({ success: true, connected: true }), {
        status: 200,
        headers: corsHeaders,
      });
    }

    if (action === "check_status") {
      const { data, error } = await supabaseAdmin
        .from("google_calendar_tokens")
        .select("user_id, expires_at")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) {
        console.error("Check status DB error:", error);
        return new Response(JSON.stringify({ error: "Failed to check status" }), {
          status: 500,
          headers: corsHeaders,
        });
      }

      return new Response(JSON.stringify({ connected: !!data }), {
        status: 200,
        headers: corsHeaders,
      });
    }

    if (action === "disconnect") {
      const { error } = await supabaseAdmin.from("google_calendar_tokens").delete().eq("user_id", user.id);

      if (error) {
        console.error("Disconnect DB error:", error);
        return new Response(JSON.stringify({ error: "Failed to disconnect" }), {
          status: 500,
          headers: corsHeaders,
        });
      }

      return new Response(JSON.stringify({ success: true, connected: false }), {
        status: 200,
        headers: corsHeaders,
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400,
      headers: corsHeaders,
    });
  } catch (err) {
    console.error("Unhandled error in google-calendar-auth:", err);

    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : "Unknown error",
      }),
      {
        status: 500,
        headers: corsHeaders,
      },
    );
  }
});
