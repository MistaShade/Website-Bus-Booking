const loginForm = document.getElementById("login-form");
const registerForm = document.getElementById("register-form");

function getSupabase() {
  return window.supabaseClient || null;
}

function showAuthPageError(message) {
  let el = document.getElementById("auth-page-error");
  if (!el) {
    el = document.createElement("p");
    el.id = "auth-page-error";
    el.className = "auth-error";
    el.setAttribute("role", "alert");
    const card = document.querySelector(".auth-card");
    if (card) card.insertBefore(el, card.firstChild);
  }
  el.textContent = message;
  el.hidden = false;
}

function clearAuthPageError() {
  const el = document.getElementById("auth-page-error");
  if (el) el.hidden = true;
}

function setSubmitLoading(form, loading, defaultLabel) {
  const btn = form?.querySelector('button[type="submit"]');
  if (!btn) return;
  if (loading) {
    btn.disabled = true;
    btn.dataset.defaultLabel = btn.textContent;
    btn.textContent = defaultLabel || "Please wait…";
  } else {
    btn.disabled = false;
    btn.textContent = btn.dataset.defaultLabel || btn.textContent;
  }
}

function setLoginStatus(message) {
  const el = document.getElementById("login-status");
  if (el) el.textContent = message || "";
}

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => {
        reject(
          new Error(
            `${label} timed out. Check your internet, Supabase project URL/key, and that the site is opened with http:// (Live Server), not file://.`
          )
        );
      }, ms);
    }),
  ]);
}

function formatAuthError(error) {
  if (!error?.message) return "Something went wrong. Please try again.";
  const msg = error.message.toLowerCase();
  if (msg.includes("invalid login credentials")) {
    return "Wrong email or password. Try again or register a new account.";
  }
  if (msg.includes("rate limit") || msg.includes("email rate")) {
    return (
      "Supabase email limit reached. Wait 30–60 minutes, or turn off “Confirm email” in Supabase → Authentication → Email.\n\n" +
      error.message
    );
  }
  return error.message;
}

function requireSupabaseClient() {
  if (window.__GOBUS_SUPABASE_ERROR__) {
    showAuthPageError(window.__GOBUS_SUPABASE_ERROR__);
    alert(window.__GOBUS_SUPABASE_ERROR__);
    return null;
  }
  const supabase = getSupabase();
  if (!supabase) {
    const msg =
      "Supabase is not ready. Open this site with Live Server (http://localhost), not by double-clicking the HTML file.";
    showAuthPageError(msg);
    alert(msg);
    return null;
  }
  return supabase;
}

async function afterAuthSuccess(session) {
  if (!window.gobusAuth || !session?.user) return;
  window.gobusAuth.persistAppUserFromSession(session);
  try {
    await window.gobusAuth.ensureUserProfile(session);
  } catch (err) {
    console.warn("[auth] profile save:", err);
  }
}

function sendRegistrationEmail(email, fullName) {
  if (!window.emailjs) return Promise.resolve();

  const serviceId = "YOUR_EMAILJS_SERVICE_ID";
  const templateId = "YOUR_EMAILJS_REGISTER_TEMPLATE_ID";

  const payload = {
    to_email: email,
    to_name: fullName || "GoBus passenger",
  };

  return emailjs.send(serviceId, templateId, payload);
}

document.addEventListener("DOMContentLoaded", () => {
  if (window.__GOBUS_SUPABASE_ERROR__) {
    showAuthPageError(window.__GOBUS_SUPABASE_ERROR__);
  }
  if (!window.supabaseClient && (loginForm || registerForm)) {
    showAuthPageError(
      "Supabase did not connect. Use http://127.0.0.1:5500/index.html via Live Server (see project README)."
    );
  }
});

if (registerForm) {
  registerForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearAuthPageError();

    const supabase = requireSupabaseClient();
    if (!supabase) return;

    const nameInput = document.getElementById("reg-name");
    const emailInput = document.getElementById("reg-email");
    const passwordInput = document.getElementById("reg-password");
    const confirmInput = document.getElementById("reg-password-confirm");

    const fullName = (nameInput && nameInput.value.trim()) || "";
    const email = emailInput.value.trim().toLowerCase();
    const password = passwordInput.value;
    const confirm = confirmInput.value;

    if (password !== confirm) {
      alert("Passwords do not match. Please try again.");
      return;
    }

    if (password.length < 6) {
      alert("Password must be at least 6 characters.");
      return;
    }

    setSubmitLoading(registerForm, true, "Creating account…");

    let navigating = false;

    try {
      const { data, error } = await withTimeout(
        supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: fullName },
          },
        }),
        20000,
        "Registration"
      );

      if (error) {
        alert(formatAuthError(error));
        return;
      }

      sendRegistrationEmail(email, fullName).catch((err) => {
        console.error("Registration email failed", err);
      });

      if (data.session) {
        if (window.gobusAuth) {
          window.gobusAuth.persistAppUserFromSession(data.session);
        }
        navigating = true;
        window.location.replace(
          window.gobusAuth
            ? window.gobusAuth.getRedirectFromQuery("index.html")
            : "index.html"
        );
        afterAuthSuccess(data.session).catch(() => {});
      } else {
        alert(
          "Account created. Turn OFF “Confirm email” in Supabase → Authentication → Email, then log in — or check your inbox to verify first."
        );
        navigating = true;
        window.location.replace("login.html");
      }
    } catch (err) {
      console.error("[auth] register:", err);
      alert(err?.message || "Registration failed. Check the browser console (F12).");
    } finally {
      if (!navigating) setSubmitLoading(registerForm, false);
    }
  });
}

if (loginForm) {
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearAuthPageError();

    const supabase = requireSupabaseClient();
    if (!supabase) return;

    const emailInput = document.getElementById("login-email");
    const passwordInput = document.getElementById("login-password");

    const email = emailInput.value.trim().toLowerCase();
    const password = passwordInput.value;

    if (!email || !password) {
      alert("Enter your email and password.");
      return;
    }

    setSubmitLoading(loginForm, true, "Signing in…");
    setLoginStatus("Connecting to Supabase…");

    let navigating = false;

    try {
      const { data, error } = await withTimeout(
        supabase.auth.signInWithPassword({ email, password }),
        20000,
        "Login"
      );

      if (error) {
        setLoginStatus("");
        alert(formatAuthError(error));
        return;
      }

      let session = data?.session;
      if (!session) {
        const { data: refreshed } = await supabase.auth.getSession();
        session = refreshed?.session;
      }

      if (!session) {
        setLoginStatus("");
        alert(
          "Login did not start a session. In Supabase → Authentication → Email, turn OFF “Confirm email”, then register again or confirm your email."
        );
        return;
      }

      if (window.gobusAuth) {
        const active = await window.gobusAuth.assertAccountActive(session);
        if (!active) return;

        window.gobusAuth.persistAppUserFromSession(session);
      }

      const redirect = window.gobusAuth
        ? window.gobusAuth.getRedirectFromQuery("index.html")
        : "index.html";

      setLoginStatus("Success! Opening home page…");
      navigating = true;
      window.location.replace(redirect);

      // Profile + trip sync happen on the next page (navAuth), not here — avoids hanging on login.
      afterAuthSuccess(session).catch((err) => console.warn("[auth] profile:", err));
      if (window.gobusAuth) {
        window.gobusAuth
          .migrateLocalTripsToDatabase(session)
          .catch((err) => console.warn("[auth] migrate:", err));
      }
    } catch (err) {
      console.error("[auth] login:", err);
      setLoginStatus("");
      alert(
        err?.message ||
          "Login failed. Open the site with Live Server (http://), not file://. Press F12 for details."
      );
    } finally {
      if (!navigating) {
        setSubmitLoading(loginForm, false);
      }
    }
  });
} else {
  console.error("[auth] #login-form not found — auth.js may be in the wrong folder.");
}
