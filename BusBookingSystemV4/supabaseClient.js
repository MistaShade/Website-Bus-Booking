(() => {
  if (typeof window === "undefined") return;

  const cfg = window.__GOBUS_SUPABASE__ || {};
  const SUPABASE_URL =
    cfg.url || "https://ilnchdtewkdukehcvczx.supabase.co";
  const SUPABASE_KEY =
    cfg.key || "sb_publishable_voVUVGMOrGj858nevssoIQ_PoENn3c1";

  const lib = window.supabase;
  if (!lib || typeof lib.createClient !== "function") {
    window.__GOBUS_SUPABASE_ERROR__ =
      "Supabase library did not load. Use http://localhost (Live Server), not file://, and check your internet connection.";
    console.error(window.__GOBUS_SUPABASE_ERROR__);
    return;
  }

  try {
    window.supabaseClient = lib.createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
    window.__GOBUS_SUPABASE_READY__ = true;
  } catch (err) {
    window.__GOBUS_SUPABASE_ERROR__ =
      err?.message || "Could not create Supabase client.";
    console.error("[supabaseClient]", err);
  }
})();
