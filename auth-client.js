import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.110.2/+esm";

let supabaseClientPromise = null;

export async function getSupabaseClient() {
  if (!supabaseClientPromise) {
    supabaseClientPromise = loadSupabaseClient();
  }

  return supabaseClientPromise;
}

async function loadSupabaseClient() {
  let response;

  try {
    response = await fetch("/api/public-config", {
      method: "GET",
      headers: { "Accept": "application/json" },
      cache: "no-store"
    });
  } catch (error) {
    throw new Error("Account setup is temporarily unavailable. Please try again in a few minutes.");
  }

  let config = null;
  try {
    config = await response.json();
  } catch (error) {
    throw new Error("Account setup is temporarily unavailable. Please try again in a few minutes.");
  }

  if (!response.ok) {
    throw new Error(config && config.error ? config.error : "Supabase public configuration could not be loaded.");
  }

  if (!config.supabaseUrl || !config.supabasePublishableKey) {
    throw new Error("Supabase public configuration is incomplete.");
  }

  try {
    return createClient(config.supabaseUrl, config.supabasePublishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: "pkce"
      }
    });
  } catch (error) {
    throw new Error("Account setup could not start. Please try again later.");
  }
}

export async function getCurrentSession() {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session || null;
}

export function authMessage(error, fallback) {
  if (!error) return fallback;

  const text = String(error.message || "").toLowerCase();
  if (text.includes("invalid login credentials")) {
    return "The email or password is not correct.";
  }
  if (text.includes("email not confirmed")) {
    return "Please confirm your email address before logging in.";
  }
  if (text.includes("password")) {
    return "Check the password and try again. Passwords must be at least 8 characters.";
  }
  if (text.includes("expired") || text.includes("invalid")) {
    return "That link is invalid or has expired. Please request a new one.";
  }

  return fallback;
}
