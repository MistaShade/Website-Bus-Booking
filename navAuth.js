(function () {
  const navRight = document.querySelector("header.navbar .nav-right");
  const navLinks = document.querySelector("header.navbar .nav-links");

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function updateMyTripsLink(session) {
    if (!navLinks) return;
    let link = navLinks.querySelector('a[href="mytrips.html"]');
    if (session?.user) {
      if (!link) {
        link = document.createElement("a");
        link.href = "mytrips.html";
        link.className = "nav-link";
        link.textContent = "My Trips";
        const routes = navLinks.querySelector('a[href="index.html"]');
        if (routes?.nextSibling) {
          navLinks.insertBefore(link, routes.nextSibling);
        } else {
          navLinks.appendChild(link);
        }
      }
      link.style.display = "";
      if (window.location.pathname.endsWith("mytrips.html")) {
        navLinks.querySelectorAll(".nav-link").forEach((a) => a.classList.remove("active"));
        link.classList.add("active");
      }
    } else if (link) {
      link.remove();
    }
  }

  async function render() {
    const supabase = window.supabaseClient;
    if (!supabase || !navRight) return;

    const {
      data: { session },
    } = await supabase.auth.getSession();

    updateMyTripsLink(session);

    if (session?.user) {
      if (window.gobusAuth) {
        window.gobusAuth.persistAppUserFromSession(session);
        window.gobusAuth.ensureUserProfile(session);
      }
      const meta = session.user.user_metadata || {};
      const label =
        (meta.full_name && String(meta.full_name).trim()) ||
        session.user.email ||
        "Account";
      navRight.innerHTML = `
        <span class="nav-user" title="${escapeHtml(session.user.email || "")}">${escapeHtml(label)}</span>
        <button type="button" class="btn btn-outline btn-nav-account" id="nav-account-btn">
          User manager
        </button>
        <button type="button" class="btn btn-outline" id="nav-logout-btn">Log out</button>
      `;

      if (window.gobusAuth?.assertAccountActive) {
        window.gobusAuth.assertAccountActive(session).catch(() => {});
      }

      const accountBtn = document.getElementById("nav-account-btn");
      if (accountBtn) {
        accountBtn.addEventListener("click", () => {
          if (window.gobusAccountManager) {
            window.gobusAccountManager.open(session);
          }
        });
      }

      const btn = document.getElementById("nav-logout-btn");
      if (btn) {
        btn.addEventListener("click", async () => {
          await supabase.auth.signOut();
          localStorage.removeItem("gobusCurrentUser");
          window.location.href = "login.html";
        });
      }
    } else {
      navRight.innerHTML = `<a href="login.html" class="btn btn-outline">Sign In</a>`;
    }
  }

  render();
})();
