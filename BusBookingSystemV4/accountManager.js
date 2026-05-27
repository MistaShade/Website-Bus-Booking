(function (global) {
  let currentUserEmail = "";

  function normalizeEmail(email) {
    return (email || "").trim().toLowerCase();
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function getSupabase() {
    return global.supabaseClient || null;
  }

  function ensureModal() {
    const existing = document.getElementById("account-manager-modal");
    if (existing && !document.getElementById("account-password-email-wrap")) {
      existing.remove();
    }
    if (document.getElementById("account-manager-modal")) return;

    const section = document.createElement("section");
    section.id = "account-manager-modal";
    section.className = "overlay hidden";
    section.setAttribute("aria-hidden", "true");
    section.innerHTML = `
      <div class="overlay-content account-manager-content">
        <h2 class="overlay-title">User manager</h2>
        <p class="overlay-subtitle">
          Manage your GoBus account. You will be asked to confirm your email when you apply a change.
        </p>
        <p id="account-manager-email-display" class="account-manager-email"></p>

        <div class="account-manager-section">
          <h3 class="account-manager-section-title">Change password</h3>
          <div class="field-group">
            <label class="field-label" for="account-new-password">New password</label>
            <input
              id="account-new-password"
              class="field-input"
              type="password"
              placeholder="At least 6 characters"
              autocomplete="new-password"
            />
          </div>
          <div class="field-group">
            <label class="field-label" for="account-confirm-password">Confirm new password</label>
            <input
              id="account-confirm-password"
              class="field-input"
              type="password"
              placeholder="Re-enter new password"
              autocomplete="new-password"
            />
          </div>
          <div id="account-password-email-wrap" class="account-email-confirm-wrap hidden">
            <div class="field-group">
              <label class="field-label" for="account-confirm-email-password">Confirm your email</label>
              <input
                id="account-confirm-email-password"
                class="field-input"
                type="email"
                placeholder="Same email as your account"
                autocomplete="email"
              />
            </div>
          </div>
          <button type="button" class="btn btn-primary" id="account-change-password-btn">
            Update password
          </button>
        </div>

        <div class="account-manager-section account-manager-section--danger">
          <h3 class="account-manager-section-title">Deactivate account</h3>
          <p class="account-manager-warning">
            Your account will be deactivated. You will not be able to sign in or book trips until support reactivates your account.
          </p>
          <div id="account-deactivate-email-wrap" class="account-email-confirm-wrap hidden">
            <div class="field-group">
              <label class="field-label" for="account-confirm-email-deactivate">Confirm your email</label>
              <input
                id="account-confirm-email-deactivate"
                class="field-input"
                type="email"
                placeholder="Same email as your account"
                autocomplete="email"
              />
            </div>
          </div>
          <button type="button" class="btn btn-danger" id="account-deactivate-btn">
            Deactivate account
          </button>
        </div>

        <p id="account-manager-hint" class="account-manager-hint" role="status"></p>

        <div class="overlay-footer overlay-actions">
          <button type="button" class="btn btn-outline" data-close-account-manager>
            Close
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(section);

    section.querySelectorAll("[data-close-account-manager]").forEach((btn) => {
      btn.addEventListener("click", close);
    });
    section.addEventListener("click", (e) => {
      if (e.target === section) close();
    });

    document
      .getElementById("account-change-password-btn")
      ?.addEventListener("click", changePassword);

    document
      .getElementById("account-deactivate-btn")
      ?.addEventListener("click", deactivateAccount);
  }

  function setHint(message, isError) {
    const el = document.getElementById("account-manager-hint");
    if (!el) return;
    el.textContent = message || "";
    el.classList.toggle("account-manager-hint--error", Boolean(isError));
  }

  function verifyEmailInput(inputId) {
    const typed = normalizeEmail(document.getElementById(inputId)?.value);
    const expected = normalizeEmail(currentUserEmail);
    if (!typed) {
      setHint("Enter your email to confirm this change.", true);
      return null;
    }
    if (typed !== expected) {
      setHint("Email does not match your account.", true);
      return null;
    }
    return typed;
  }

  function hideEmailConfirmPanels() {
    document
      .querySelectorAll(".account-email-confirm-wrap")
      .forEach((el) => el.classList.add("hidden"));
  }

  function showEmailConfirmPanel(wrapId, inputId) {
    hideEmailConfirmPanels();
    const wrap = document.getElementById(wrapId);
    const input = document.getElementById(inputId);
    if (wrap) wrap.classList.remove("hidden");
    if (input) {
      input.value = "";
      input.focus();
    }
  }

  function isEmailPanelVisible(wrapId) {
    const wrap = document.getElementById(wrapId);
    return wrap && !wrap.classList.contains("hidden");
  }

  function resetForm() {
    [
      "account-confirm-email-password",
      "account-confirm-email-deactivate",
      "account-new-password",
      "account-confirm-password",
    ].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.value = "";
    });
    hideEmailConfirmPanels();
    setHint("");
  }

  function open(session) {
    ensureModal();
    const modal = document.getElementById("account-manager-modal");
    if (!modal || !session?.user) return;

    currentUserEmail = session.user.email || "";
    const meta = session.user.user_metadata || {};
    const name =
      (meta.full_name && String(meta.full_name).trim()) || currentUserEmail;

    const display = document.getElementById("account-manager-email-display");
    if (display) {
      display.innerHTML = `Signed in as <strong>${escapeHtml(name)}</strong>${currentUserEmail ? ` · ${escapeHtml(currentUserEmail)}` : ""}`;
    }

    resetForm();
    modal.classList.remove("hidden");
    modal.setAttribute("aria-hidden", "false");
  }

  function close() {
    const modal = document.getElementById("account-manager-modal");
    if (!modal) return;
    modal.classList.add("hidden");
    modal.setAttribute("aria-hidden", "true");
    resetForm();
  }

  async function changePassword() {
    const newPassword = document.getElementById("account-new-password")?.value || "";
    const confirmPassword =
      document.getElementById("account-confirm-password")?.value || "";

    if (newPassword.length < 6) {
      setHint("Password must be at least 6 characters.", true);
      return;
    }
    if (newPassword !== confirmPassword) {
      setHint("New passwords do not match.", true);
      return;
    }

    if (!isEmailPanelVisible("account-password-email-wrap")) {
      showEmailConfirmPanel(
        "account-password-email-wrap",
        "account-confirm-email-password"
      );
      setHint("Enter your email, then click Update password again.");
      return;
    }

    if (!verifyEmailInput("account-confirm-email-password")) return;

    const supabase = getSupabase();
    if (!supabase) {
      setHint("Sign-in service is not available.", true);
      return;
    }

    const btn = document.getElementById("account-change-password-btn");
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Updating…";
    }
    setHint("");

    const { error } = await supabase.auth.updateUser({ password: newPassword });

    if (btn) {
      btn.disabled = false;
      btn.textContent = "Update password";
    }

    if (error) {
      setHint(error.message || "Could not update password.", true);
      return;
    }

    setHint("Password updated successfully.");
    document.getElementById("account-new-password").value = "";
    document.getElementById("account-confirm-password").value = "";
    hideEmailConfirmPanels();
  }

  async function deactivateAccount() {
    if (!isEmailPanelVisible("account-deactivate-email-wrap")) {
      showEmailConfirmPanel(
        "account-deactivate-email-wrap",
        "account-confirm-email-deactivate"
      );
      setHint("Enter your email, then click Deactivate account again.");
      return;
    }

    if (!verifyEmailInput("account-confirm-email-deactivate")) return;

    const confirmed = confirm(
      "Deactivate your GoBus account? You will be signed out and will not be able to log in again until your account is reactivated."
    );
    if (!confirmed) return;

    const supabase = getSupabase();
    if (!supabase) {
      setHint("Sign-in service is not available.", true);
      return;
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.user) {
      setHint("You are not signed in.", true);
      return;
    }

    const btn = document.getElementById("account-deactivate-btn");
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Deactivating…";
    }
    setHint("");

    const nowIso = new Date().toISOString();
    const { error: profileError } = await supabase
      .from("profiles")
      .update({ deactivated_at: nowIso })
      .eq("id", session.user.id);

    if (profileError) {
      if (btn) {
        btn.disabled = false;
        btn.textContent = "Deactivate account";
      }
      const msg = profileError.message || "";
      if (msg.includes("deactivated_at") || msg.includes("column")) {
        setHint(
          "Database not ready. Run supabase/account-settings.sql in the SQL Editor.",
          true
        );
      } else {
        setHint(`Could not deactivate: ${msg}`, true);
      }
      return;
    }

    await supabase.auth.signOut();
    global.localStorage.removeItem("gobusCurrentUser");
    close();
    alert("Your account has been deactivated. Contact support if you need it restored.");
    global.location.href = "login.html";
  }

  global.gobusAccountManager = {
    init: ensureModal,
    open,
    close,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", ensureModal);
  } else {
    ensureModal();
  }
})(window);
