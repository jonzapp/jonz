// What the two live-update scripts (live-latency.mjs, live-load.mjs) share:
// staging's settings from the environment, signing the demo house's people
// in, calling /v1 as one of them, and finding a John of Sam's to tick.
import { createClient } from "@supabase/supabase-js";

const need = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
};
const SUPABASE_URL = need("SUPABASE_URL");
const KEY = need("SUPABASE_PUBLISHABLE_KEY");
const PASSWORD = need("DEMO_PASSWORD");
export const API = need("API_URL").replace(/\/+$/, "");
/** How the scripts name themselves to the API. */
export const CLIENT = "script/1.0.0";

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Signs one of the demo house's people in: their client, token and id. */
export async function signIn(email) {
  const client = createClient(SUPABASE_URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(`${email} couldn't sign in: ${error.message}`);
  return { client, token: data.session.access_token, userId: data.user.id };
}

/** One /v1 call as whoever the token is for; a refusal throws with what the API said. */
export async function v1(token, method, path, body) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Jonz-Client": CLIENT, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${method} ${path}: ${response.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

export const quantile = (values, q) => {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 0) return NaN;
  const at = (sorted.length - 1) * q;
  const low = Math.floor(at);
  return sorted[low] + (sorted[Math.ceil(at)] - sorted[low]) * (at - low);
};

/** The demo house Alex runs, and a John of Sam's to tick: the week is dealt first if nobody has. */
export async function samsJohnIn(alex, sam) {
  const house = await v1(alex.token, "GET", "/v1/me/house");
  if (!house) throw new Error("Alex has no house on staging: run the Staging workflow's \"Seed the demo house\"");
  const houseId = house.houseId;
  const samsJohn = async () => {
    const today = await v1(sam.token, "GET", `/v1/houses/${houseId}/today`);
    return today.assignments.find((a) => a.userId === sam.userId && !a.skipped) ?? null;
  };
  let john = await samsJohn();
  if (!john) {
    console.log("No John for Sam this week: dealing the week as Alex.");
    await v1(alex.token, "POST", `/v1/houses/${houseId}/deal`, {});
    john = await samsJohn();
  }
  if (!john) throw new Error("Sam still has no John after the deal");
  return { houseId, john };
}
