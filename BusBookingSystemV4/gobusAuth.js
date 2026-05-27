(function (global) {
  const PENDING_CHECKOUT_KEY = "gobusPendingCheckout";
  const LOCAL_TRIPS_KEY = "gobusTrips";

  function getSupabase() {
    return global.supabaseClient || null;
  }

  async function getSession() {
    const supabase = getSupabase();
    if (!supabase) return null;
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session;
  }

  function loginUrl(redirectPath) {
    const target = redirectPath || "index.html";
    return `login.html?redirect=${encodeURIComponent(target)}`;
  }

  function persistAppUserFromSession(session) {
    if (!session?.user) return;
    const u = session.user;
    global.localStorage.setItem(
      "gobusCurrentUser",
      JSON.stringify({
        id: u.id,
        email: u.email || "",
        fullName: (u.user_metadata && u.user_metadata.full_name) || "",
      })
    );
  }

  function bookingInfoToRow(info, session, receiptEmail) {
    const totalAmount =
      typeof info?.totalPriceAmount === "number" ? info.totalPriceAmount : null;
    if (totalAmount === null || Number.isNaN(totalAmount)) return null;

    return {
      user_id: session.user.id,
      user_email: session.user.email,
      route: info.route,
      bus_name: info.busName,
      depart_date: info.date,
      depart_time: info.departTime,
      arrive_time: info.arriveTime,
      trip_type: info.tripType,
      total_price: totalAmount,
      adult_qty: info.adultQty ?? 0,
      child_qty: info.childQty ?? 0,
      senior_qty: info.seniorQty ?? 0,
      student_qty: info.studentQty ?? 0,
      pwd_qty: info.pwdQty ?? 0,
      seat_numbers: Array.isArray(info.seats) ? info.seats : [],
      receipt_email: receiptEmail || session.user.email || null,
      status: "confirmed",
    };
  }

  function loadLocalTrips() {
    try {
      const stored = global.localStorage.getItem(LOCAL_TRIPS_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }

  function saveLocalTrips(trips) {
    global.localStorage.setItem(LOCAL_TRIPS_KEY, JSON.stringify(trips));
  }
  
  function localTripsForUser(session) {
    const uid = session?.user?.id;
    if (!uid) return [];
    return loadLocalTrips().filter(
      (t) => !t.syncedToCloud && t.ownerUserId === uid
    );
  }

  async function isAccountDeactivated(userId) {
    const supabase = getSupabase();
    if (!supabase || !userId) return false;

    const { data, error } = await supabase
      .from("profiles")
      .select("deactivated_at")
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      if (
        error.message?.includes("deactivated_at") ||
        error.message?.includes("column")
      ) {
        return false;
      }
      console.warn("[gobusAuth] profile check:", error.message);
      return false;
    }

    return Boolean(data?.deactivated_at);
  }

  async function assertAccountActive(session) {
    const supabase = getSupabase();
    if (!supabase || !session?.user) return true;

    const deactivated = await isAccountDeactivated(session.user.id);
    if (!deactivated) return true;

    await supabase.auth.signOut();
    global.localStorage.removeItem("gobusCurrentUser");
    alert(
      "This account has been deactivated. Contact support if you need access restored."
    );
    global.location.href = "login.html";
    return false;
  }

  async function ensureUserProfile(session) {
    const supabase = getSupabase();
    if (!supabase || !session?.user) return;

    const active = await assertAccountActive(session);
    if (!active) return;

    const fullName =
      (session.user.user_metadata && session.user.user_metadata.full_name) || "";

    const { error } = await supabase.from("profiles").upsert(
      {
        id: session.user.id,
        full_name: String(fullName).trim(),
      },
      { onConflict: "id" }
    );

    if (error) {
      console.warn("[gobusAuth] profile upsert:", error.message);
    }
  }

  async function saveBookingToDatabase(info, session, receiptEmail) {
    const supabase = getSupabase();
    if (!supabase || !session?.user) {
      return { ok: false, error: new Error("Not signed in") };
    }

    const row = bookingInfoToRow(info, session, receiptEmail);
    if (!row) {
      return { ok: false, error: new Error("Invalid booking total") };
    }

    if (row.user_id !== session.user.id) {
      return { ok: false, error: new Error("Booking user mismatch") };
    }

    const { error } = await supabase.from("bookings").insert([row]);
    if (error) return { ok: false, error };
    return { ok: true };
  }

  async function migrateLocalTripsToDatabase(session) {
    const supabase = getSupabase();
    if (!supabase || !session?.user) return { migrated: 0 };

    const all = loadLocalTrips();
    const pending = localTripsForUser(session);
    let migrated = 0;

    for (const trip of pending) {
      const result = await saveBookingToDatabase(trip, session, trip.receiptEmail);
      if (result.ok) {
        trip.syncedToCloud = true;
        migrated += 1;
      }
    }

    if (migrated > 0) {
      const uid = session.user.id;
      all.forEach((t) => {
        if (t.ownerUserId === uid) {
          t.syncedToCloud = true;
        }
      });
      saveLocalTrips(all);
    }

    return { migrated };
  }

  function stashPendingCheckout(info) {
    global.sessionStorage.setItem(PENDING_CHECKOUT_KEY, JSON.stringify(info));
  }

  function takePendingCheckout() {
    const raw = global.sessionStorage.getItem(PENDING_CHECKOUT_KEY);
    if (!raw) return null;
    global.sessionStorage.removeItem(PENDING_CHECKOUT_KEY);
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function getRedirectFromQuery(defaultPath) {
    const params = new URLSearchParams(global.location.search);
    const redirect = params.get("redirect");
    if (!redirect || redirect.includes("://")) return defaultPath || "index.html";
    return redirect.startsWith("/") ? redirect.slice(1) : redirect;
  }

  global.gobusAuth = {
    PENDING_CHECKOUT_KEY,
    LOCAL_TRIPS_KEY,
    getSupabase,
    getSession,
    loginUrl,
    persistAppUserFromSession,
    isAccountDeactivated,
    assertAccountActive,
    ensureUserProfile,
    saveBookingToDatabase,
    migrateLocalTripsToDatabase,
    localTripsForUser,
    loadLocalTrips,
    saveLocalTrips,
    stashPendingCheckout,
    takePendingCheckout,
    getRedirectFromQuery,
    bookingInfoToRow,
  };
})(window);
