const tripsList = document.getElementById("trips-list");
const tripsEmpty = document.getElementById("trips-empty");
const cancelModal = document.getElementById("cancel-modal");
const cancelModalTrip = document.getElementById("cancel-modal-trip");
const cancelEmailInput = document.getElementById("cancel-email");
const cancelModalHint = document.getElementById("cancel-modal-hint");
const confirmCancelBtn = document.getElementById("confirm-cancel-btn");
const rescheduleModal = document.getElementById("reschedule-modal");
const rescheduleModalTrip = document.getElementById("reschedule-modal-trip");
const rescheduleDateInput = document.getElementById("reschedule-date");
const rescheduleDeparturesEl = document.getElementById("reschedule-departures");
const rescheduleEmailInput = document.getElementById("reschedule-email");
const rescheduleModalHint = document.getElementById("reschedule-modal-hint");
const confirmRescheduleBtn = document.getElementById("confirm-reschedule-btn");

const DISPLAY_WAIT_HOURS = 6;
const ENFORCE_CHANGE_WAIT = false;
const CHANGE_WAIT_MS = DISPLAY_WAIT_HOURS * 60 * 60 * 1000;

function changeWaitPolicyLabel() {
  const h = DISPLAY_WAIT_HOURS;
  return `Refund and reschedule become available in ${h} hour${h === 1 ? "" : "s"}.`;
}

let currentSession = null;
let pendingCancelBooking = null;
let pendingRescheduleBooking = null;
let selectedRescheduleDepartureId = null;
let rescheduleDepartureOptions = [];

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatCurrency(value) {
  return `₱${Number(value).toFixed(2)}`;
}

function formatPassengerSummary(trip) {
  const parts = [
    { qty: trip.adultQty, label: "Adult" },
    { qty: trip.childQty, label: "Child" },
    { qty: trip.seniorQty, label: "Senior" },
    { qty: trip.studentQty, label: "Student" },
    { qty: trip.pwdQty, label: "PWD" },
  ]
    .filter(({ qty }) => Number(qty) > 0)
    .map(({ qty, label }) => `${qty} ${label}`);

  return parts.length ? parts.join(", ") : "No passengers listed";
}

function normalizeEmail(email) {
  return (email || "").trim().toLowerCase();
}

function normalizeDepartTime(timeStr) {
  const raw = (timeStr || "00:00").trim();
  const ampm = raw.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (ampm) {
    let h = parseInt(ampm[1], 10);
    const m = ampm[2];
    const pm = ampm[3].toUpperCase() === "PM";
    if (pm && h !== 12) h += 12;
    if (!pm && h === 12) h = 0;
    return `${String(h).padStart(2, "0")}:${m}:00`;
  }
  if (/^\d{1,2}:\d{2}$/.test(raw)) return `${raw}:00`;
  if (/^\d{1,2}:\d{2}:\d{2}$/.test(raw)) return raw;
  return "00:00:00";
}

function parseDepartureDateTime(dateStr, timeStr) {
  if (!dateStr || dateStr === "N/A") return null;

  const clock = normalizeDepartTime(timeStr);

  const iso = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    const [, y, mo, d] = iso;
    const parsed = new Date(
      Number(y),
      Number(mo) - 1,
      Number(d),
      Number(clock.slice(0, 2)),
      Number(clock.slice(3, 5)),
      0
    );
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  const slash = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) {
    const [, mm, dd, yyyy] = slash;
    const parsed = new Date(
      Number(yyyy),
      Number(mm) - 1,
      Number(dd),
      Number(clock.slice(0, 2)),
      Number(clock.slice(3, 5)),
      0
    );
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  const fallback = new Date(`${dateStr}T${clock}`);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

function getBookingCreatedAt(booking) {
  const raw = booking.createdAt || booking.bookedAt;
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatDurationRemaining(ms) {
  const totalMin = Math.max(1, Math.ceil(ms / 60000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

function formatChangeOpensAt(date) {
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function getTripChangeEligibility(booking) {
  if (booking.status === "cancelled" || booking.status === "refunded") {
    return {
      allowed: false,
      waiting: false,
      showActionButtons: false,
      reason: booking.refundAmount
        ? `Refunded ${formatCurrency(booking.refundAmount)} on ${formatCancelledWhen(booking)}.`
        : "This reservation was already cancelled.",
    };
  }

  const departAt = parseDepartureDateTime(booking.date, booking.departTime);
  if (departAt && departAt.getTime() <= Date.now()) {
    return {
      allowed: false,
      waiting: false,
      showActionButtons: true,
      reason:
        "This trip has already departed — cancellation and rescheduling are no longer available.",
    };
  }

  if (!ENFORCE_CHANGE_WAIT) {
    return {
      allowed: true,
      waiting: false,
      showActionButtons: true,
      policyNotice: changeWaitPolicyLabel(),
      cancelReason: "You can cancel and receive a full refund.",
      rescheduleReason:
        "You can change your travel date or pick another bus on this route.",
    };
  }

  const createdAt = getBookingCreatedAt(booking);
  if (!createdAt) {
    return {
      allowed: false,
      waiting: true,
      showActionButtons: true,
      waitMessage: changeWaitPolicyLabel(),
      reason:
        "Booking time is unavailable. Contact support if you need to make changes sooner.",
    };
  }

  const changesOpenAt = new Date(createdAt.getTime() + CHANGE_WAIT_MS);
  const msUntilOpen = changesOpenAt.getTime() - Date.now();

  if (msUntilOpen > 0) {
    const remaining = formatDurationRemaining(msUntilOpen);
    return {
      allowed: false,
      waiting: true,
      showActionButtons: true,
      waitMessage: changeWaitPolicyLabel(),
      changesOpenAt,
      reason: `${changeWaitPolicyLabel()} — ${remaining} left (after ${formatChangeOpensAt(changesOpenAt)}).`,
    };
  }

  return {
    allowed: true,
    waiting: false,
    showActionButtons: true,
    cancelReason: "You can cancel and receive a full refund.",
    rescheduleReason:
      "You can change your travel date or pick another bus on this route.",
  };
}

function getCancellationEligibility(booking) {
  const e = getTripChangeEligibility(booking);
  if (e.cancelReason) return { ...e, reason: e.cancelReason };
  return e;
}

function getRescheduleEligibility(booking) {
  const e = getTripChangeEligibility(booking);
  if (e.rescheduleReason) return { ...e, reason: e.rescheduleReason };
  return e;
}

function getConcessionFares(adultFare) {
  return {
    senior: Math.round(adultFare * 0.8),
    student: Math.round(adultFare * 0.85),
    pwd: Math.round(adultFare * 0.8),
  };
}

function computeBookingTotal(departure, booking) {
  const disc = getConcessionFares(departure.adultFare);
  return (
    (booking.adultQty ?? 0) * departure.adultFare +
    (booking.childQty ?? 0) * departure.childFare +
    (booking.seniorQty ?? 0) * disc.senior +
    (booking.studentQty ?? 0) * disc.student +
    (booking.pwdQty ?? 0) * disc.pwd
  );
}

function parseRouteEndpoints(route) {
  const parts = String(route || "")
    .split("→")
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length >= 2) {
    return { origin: parts[0], dest: parts[parts.length - 1] };
  }
  return null;
}

function bookingDateToInputValue(dateStr) {
  if (!dateStr || dateStr === "N/A") return "";
  const iso = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return dateStr;
  const slash = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) {
    const [, mm, dd, yyyy] = slash;
    return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  }
  return "";
}

function todayInputValue() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function seatsAvailableOnDeparture(departure, seatNumbers) {
  const seats = Array.isArray(seatNumbers) ? seatNumbers : [];
  if (!seats.length) return true;
  const occupied = new Set(
    (window.gtfsData?.getOccupiedSeatsForTrip(departure.id) || []).map(String)
  );
  return seats.every((s) => !occupied.has(String(s)));
}

function findSelectedRescheduleDeparture() {
  if (selectedRescheduleDepartureId == null || selectedRescheduleDepartureId === "") {
    return null;
  }
  const selectedId = String(selectedRescheduleDepartureId);
  return (
    rescheduleDepartureOptions.find((d) => String(d.id) === selectedId) || null
  );
}

function getRescheduleDepartureOptions(booking) {
  if (!window.gtfsData?.isReady()) return [];

  const endpoints = parseRouteEndpoints(booking.route);
  if (!endpoints) return [];

  const pool = window.gtfsData.getDeparturesForSearch(
    endpoints.origin,
    endpoints.dest
  );
  const routeLine = (booking.route || "").trim();
  const filtered = pool.filter((dep) => {
    if (routeLine && dep.route === routeLine) return true;
    if (booking.busName && dep.busName === booking.busName) return true;
    return false;
  });

  const list = filtered.length ? filtered : pool;
  return list.sort((a, b) =>
    (a.departTime || "").localeCompare(b.departTime || "")
  );
}

function formatCancelledWhen(booking) {
  const raw = booking.cancelledAt || booking.refundedAt;
  if (!raw) return "";
  try {
    return new Date(raw).toLocaleString();
  } catch {
    return "";
  }
}

function bookingFromRow(b) {
  return {
    id: b.id,
    route: b.route,
    busName: b.bus_name,
    date: b.depart_date,
    tripType: b.trip_type,
    departTime: b.depart_time,
    arriveTime: b.arrive_time,
    totalPrice: formatCurrency(b.total_price),
    totalPriceAmount: Number(b.total_price),
    adultQty: b.adult_qty,
    childQty: b.child_qty,
    seniorQty: b.senior_qty,
    studentQty: b.student_qty,
    pwdQty: b.pwd_qty,
    seats: b.seat_numbers || [],
    status: b.status || "confirmed",
    cancelledAt: b.cancelled_at,
    refundedAt: b.refunded_at,
    refundAmount: b.refund_amount,
    receiptEmail: b.receipt_email,
    userEmail: b.user_email,
    createdAt: b.created_at,
    isCloud: true,
  };
}

function renderTripCard(trip) {
  const card = document.createElement("article");
  card.className = "departure-card";
  if (trip.status === "cancelled" || trip.status === "refunded") {
    card.classList.add("departure-card--cancelled");
  }

  const changeEligibility = trip.isCloud
    ? getTripChangeEligibility(trip)
    : {
        allowed: false,
        reason: "Only trips saved to your account can be changed here.",
      };
  const cancelEligibility = getCancellationEligibility(trip);
  const rescheduleEligibility = getRescheduleEligibility(trip);

  const statusBadge =
    trip.status === "refunded" || trip.status === "cancelled"
      ? `<span class="trip-status trip-status--cancelled">Cancelled · Refunded</span>`
      : `<span class="trip-status trip-status--confirmed">Confirmed</span>`;

  const showTripActions =
    trip.isCloud &&
    trip.id &&
    trip.status !== "cancelled" &&
    trip.status !== "refunded" &&
    changeEligibility.showActionButtons !== false;

  const lockedTitle = escapeHtml(
    changeEligibility.waitMessage || changeWaitPolicyLabel()
  );

  const cancelBlock = showTripActions
    ? `<div class="trip-actions">
          ${
            changeEligibility.waiting
              ? `<div class="trip-cancel-wait" role="status">
                  <p class="trip-cancel-wait-title">${lockedTitle}</p>
                  <p class="trip-cancel-wait-detail">${escapeHtml(changeEligibility.reason)}</p>
                </div>`
              : changeEligibility.policyNotice
                ? `<p class="trip-cancel-hint">${escapeHtml(changeEligibility.policyNotice)}</p>`
                : `<p class="trip-cancel-hint">${escapeHtml(cancelEligibility.reason || changeEligibility.reason)}</p>`
          }
          <div class="trip-actions-buttons">
            <button
              type="button"
              class="btn btn-outline btn-small btn-reschedule-trip${changeEligibility.allowed ? "" : " btn-reschedule-trip--locked"}"
              ${changeEligibility.allowed ? `data-reschedule-id="${trip.id}"` : "disabled"}
              aria-disabled="${changeEligibility.allowed ? "false" : "true"}"
              title="${changeEligibility.allowed ? "Change travel date or bus" : lockedTitle}"
            >
              Reschedule
            </button>
            <button
              type="button"
              class="btn btn-outline btn-small btn-cancel-reservation${changeEligibility.allowed ? "" : " btn-cancel-reservation--locked"}"
              ${changeEligibility.allowed ? `data-cancel-id="${trip.id}"` : "disabled"}
              aria-disabled="${changeEligibility.allowed ? "false" : "true"}"
              title="${changeEligibility.allowed ? "Cancel and request refund" : lockedTitle}"
            >
              Cancel reservation
            </button>
          </div>
          ${
            changeEligibility.allowed && rescheduleEligibility.reason
              ? `<p class="trip-cancel-hint trip-reschedule-hint">${escapeHtml(rescheduleEligibility.reason)}</p>`
              : ""
          }
        </div>`
    : trip.isCloud && trip.id
      ? `<p class="trip-cancel-hint">${escapeHtml(changeEligibility.reason)}</p>${
          trip.refundAmount
            ? `<p class="trip-refund-line">Refund: ${escapeHtml(formatCurrency(trip.refundAmount))}</p>`
            : ""
        }`
      : `<p class="trip-cancel-hint">${escapeHtml(changeEligibility.reason)}</p>`;

  card.innerHTML = `
    <div class="departure-top">
      <div>
        <div class="route-main">${escapeHtml(trip.route)}</div>
        <div class="route-sub">${escapeHtml(trip.busName)}</div>
        ${statusBadge}
      </div>
      <div>
        <span class="seats-line">${escapeHtml(trip.date)}</span>
        <span class="seats-available">${escapeHtml(trip.tripType)}</span>
      </div>
      <div>
        <span class="time-value">${escapeHtml(trip.departTime)}</span>
        <span class="time-label">Departure</span>
      </div>
      <div>
        <span class="time-value">${escapeHtml(trip.arriveTime)}</span>
        <span class="time-label">Arrival</span>
      </div>
      <div>
        <span class="duration-value">${escapeHtml(trip.totalPrice)}</span>
        <span class="duration-label">Total price</span>
      </div>
    </div>
    <div class="departure-bottom">
      <div class="fare-row">
        <span class="fare-math">${escapeHtml(formatPassengerSummary(trip))}</span>
      </div>
      <div class="fare-row">
        <span class="fare-math">
          Seats: ${
            trip.seats && trip.seats.length
              ? trip.seats.map((s) => escapeHtml(String(s))).join(", ")
              : "Not selected"
          }
        </span>
      </div>
      ${cancelBlock}
    </div>
  `;

  const cancelBtn = card.querySelector("[data-cancel-id]");
  if (cancelBtn) {
    cancelBtn.addEventListener("click", () => openCancelModal(trip));
  }

  const rescheduleBtn = card.querySelector("[data-reschedule-id]");
  if (rescheduleBtn) {
    rescheduleBtn.addEventListener("click", () => openRescheduleModal(trip));
  }

  tripsList.appendChild(card);
}

function setEmptyMessage(html) {
  if (!tripsEmpty) return;
  tripsEmpty.style.display = "block";
  const p = tripsEmpty.querySelector("p");
  if (p) p.innerHTML = html;
}

function getAllowedEmailsForBooking(booking) {
  const emails = new Set();
  if (currentSession?.user?.email) {
    emails.add(normalizeEmail(currentSession.user.email));
  }
  if (booking.receiptEmail) emails.add(normalizeEmail(booking.receiptEmail));
  if (booking.userEmail) emails.add(normalizeEmail(booking.userEmail));
  return emails;
}

function updateCancelConfirmState() {
  if (!confirmCancelBtn || !cancelEmailInput || !pendingCancelBooking) return;

  const typed = normalizeEmail(cancelEmailInput.value);
  const allowed = getAllowedEmailsForBooking(pendingCancelBooking);
  const emailOk = typed && allowed.has(typed);
  const eligibility = getCancellationEligibility(pendingCancelBooking);

  confirmCancelBtn.disabled = !(emailOk && eligibility.allowed);

  if (cancelModalHint) {
    if (!typed) {
      cancelModalHint.textContent = "Enter your email to enable cancellation.";
    } else if (!emailOk) {
      cancelModalHint.textContent =
        "Email does not match this booking. Use the email on your receipt or account.";
    } else if (!eligibility.allowed) {
      cancelModalHint.textContent = eligibility.reason;
    } else {
      cancelModalHint.textContent = `Refund amount: ${formatCurrency(pendingCancelBooking.totalPriceAmount)}. Credited to your original payment method in 5–7 business days.`;
    }
  }
}

function openCancelModal(trip) {
  const eligibility = getCancellationEligibility(trip);
  if (!eligibility.allowed) {
    alert(
      eligibility.waitMessage
        ? `${eligibility.waitMessage}\n\n${eligibility.reason}`
        : eligibility.reason
    );
    return;
  }

  pendingCancelBooking = trip;
  if (cancelModalTrip) {
    cancelModalTrip.innerHTML = `<strong>${escapeHtml(trip.route)}</strong><br>${escapeHtml(trip.date)} · ${escapeHtml(trip.departTime)} · ${escapeHtml(trip.totalPrice)}`;
  }
  if (cancelEmailInput) {
    cancelEmailInput.value = currentSession?.user?.email || "";
  }
  updateCancelConfirmState();
  if (cancelModal) {
    cancelModal.classList.remove("hidden");
    cancelModal.setAttribute("aria-hidden", "false");
  }
}

function closeCancelModal() {
  pendingCancelBooking = null;
  if (cancelModal) {
    cancelModal.classList.add("hidden");
    cancelModal.setAttribute("aria-hidden", "true");
  }
  if (cancelEmailInput) cancelEmailInput.value = "";
}

function renderRescheduleDeparturesList() {
  if (!rescheduleDeparturesEl || !pendingRescheduleBooking) return;

  rescheduleDepartureOptions = getRescheduleDepartureOptions(
    pendingRescheduleBooking
  );
  selectedRescheduleDepartureId = null;

  if (!rescheduleDepartureOptions.length) {
    rescheduleDeparturesEl.innerHTML =
      '<p class="reschedule-departures-empty">No alternate departures found for this route. Try another date or contact support.</p>';
    updateRescheduleConfirmState();
    return;
  }

  const seats = pendingRescheduleBooking.seats || [];
  rescheduleDeparturesEl.innerHTML = rescheduleDepartureOptions
    .map((dep) => {
      const total = computeBookingTotal(dep, pendingRescheduleBooking);
      const seatsOk = seatsAvailableOnDeparture(dep, seats);
      const seatNote =
        seats.length === 0
          ? "No seats on file"
          : seatsOk
            ? `Seats ${seats.join(", ")} available`
            : `Seats ${seats.join(", ")} may not be available`;
      return `<label class="reschedule-departure-option">
        <input type="radio" name="reschedule-departure" value="${escapeHtml(String(dep.id))}" />
        <span>
          <div class="reschedule-departure-main">${escapeHtml(dep.busName)} · ${escapeHtml(dep.departTime)} – ${escapeHtml(dep.arriveTime)}</div>
          <div class="reschedule-departure-meta">${escapeHtml(dep.route)} · ${escapeHtml(formatCurrency(total))} · ${escapeHtml(seatNote)}</div>
        </span>
      </label>`;
    })
    .join("");

  updateRescheduleConfirmState();
}

function updateRescheduleConfirmState() {
  if (!confirmRescheduleBtn || !rescheduleEmailInput || !pendingRescheduleBooking) {
    return;
  }

  const typed = normalizeEmail(rescheduleEmailInput.value);
  const allowed = getAllowedEmailsForBooking(pendingRescheduleBooking);
  const emailOk = typed && allowed.has(typed);
  const eligibility = getTripChangeEligibility(pendingRescheduleBooking);
  const newDate = rescheduleDateInput?.value?.trim();
  const dep = findSelectedRescheduleDeparture();

  confirmRescheduleBtn.disabled = !(
    emailOk &&
    eligibility.allowed &&
    newDate &&
    dep
  );

  if (rescheduleModalHint) {
    if (!newDate) {
      rescheduleModalHint.textContent = "Choose a new travel date.";
    } else if (!dep) {
      rescheduleModalHint.textContent = "Select a departure for the new date.";
    } else if (!typed) {
      rescheduleModalHint.textContent = "Enter your email to confirm the change.";
    } else if (!emailOk) {
      rescheduleModalHint.textContent =
        "Email does not match this booking. Use the email on your receipt or account.";
    } else if (!eligibility.allowed) {
      rescheduleModalHint.textContent = eligibility.reason;
    } else {
      const total = computeBookingTotal(dep, pendingRescheduleBooking);
      const oldTotal = pendingRescheduleBooking.totalPriceAmount;
      const diff = total - oldTotal;
      let priceNote = `New total: ${formatCurrency(total)}`;
      if (diff > 0) {
        priceNote += ` (${formatCurrency(diff)} additional charge)`;
      } else if (diff < 0) {
        priceNote += ` (${formatCurrency(-diff)} credit)`;
      }
      rescheduleModalHint.textContent = priceNote;
    }
  }
}

async function openRescheduleModal(trip) {
  const eligibility = getTripChangeEligibility(trip);
  if (!eligibility.allowed) {
    alert(
      eligibility.waitMessage
        ? `${eligibility.waitMessage}\n\n${eligibility.reason}`
        : eligibility.reason
    );
    return;
  }

  if (window.gtfsData) {
    await window.gtfsData.loadGtfsData();
    if (!window.gtfsData.isReady()) {
      alert(
        "Route data is not loaded. Open the site over http(s) and ensure transit data is seeded in Supabase."
      );
      return;
    }
  } else {
    alert("Route data helper did not load.");
    return;
  }

  pendingRescheduleBooking = trip;
  selectedRescheduleDepartureId = null;

  if (rescheduleModalTrip) {
    rescheduleModalTrip.innerHTML = `<strong>${escapeHtml(trip.route)}</strong><br>Current: ${escapeHtml(trip.date)} · ${escapeHtml(trip.departTime)} · ${escapeHtml(trip.busName)} · ${escapeHtml(trip.totalPrice)}`;
  }

  if (rescheduleDateInput) {
    const min = todayInputValue();
    rescheduleDateInput.min = min;
    const current = bookingDateToInputValue(trip.date);
    rescheduleDateInput.value = current && current >= min ? current : min;
  }

  if (rescheduleEmailInput) {
    rescheduleEmailInput.value = currentSession?.user?.email || "";
  }

  renderRescheduleDeparturesList();
  updateRescheduleConfirmState();

  if (rescheduleModal) {
    rescheduleModal.classList.remove("hidden");
    rescheduleModal.setAttribute("aria-hidden", "false");
  }
}

function closeRescheduleModal() {
  pendingRescheduleBooking = null;
  selectedRescheduleDepartureId = null;
  rescheduleDepartureOptions = [];
  if (rescheduleModal) {
    rescheduleModal.classList.add("hidden");
    rescheduleModal.setAttribute("aria-hidden", "true");
  }
  if (rescheduleEmailInput) rescheduleEmailInput.value = "";
  if (rescheduleDeparturesEl) rescheduleDeparturesEl.innerHTML = "";
}

async function confirmReschedule() {
  if (!pendingRescheduleBooking?.id || !currentSession?.user) return;

  const typed = normalizeEmail(rescheduleEmailInput?.value);
  const allowed = getAllowedEmailsForBooking(pendingRescheduleBooking);
  if (!typed || !allowed.has(typed)) {
    alert("Enter the email address that matches this booking.");
    return;
  }

  const eligibility = getTripChangeEligibility(pendingRescheduleBooking);
  if (!eligibility.allowed) {
    alert(eligibility.reason);
    return;
  }

  const newDate = rescheduleDateInput?.value?.trim();
  const dep = findSelectedRescheduleDeparture();
  if (!newDate || !dep) {
    alert("Choose a new date and departure.");
    return;
  }

  const seats = pendingRescheduleBooking.seats || [];
  if (seats.length && !seatsAvailableOnDeparture(dep, seats)) {
    const proceed = confirm(
      `Your seats (${seats.join(", ")}) may not be available on ${dep.busName}. Reschedule anyway?`
    );
    if (!proceed) return;
  }

  const supabase = window.supabaseClient;
  if (!supabase) {
    alert("Supabase is not available.");
    return;
  }

  const newTotal = computeBookingTotal(dep, pendingRescheduleBooking);

  confirmRescheduleBtn.disabled = true;
  confirmRescheduleBtn.textContent = "Saving…";

  const { data, error } = await supabase
    .from("bookings")
    .update({
      route: dep.route,
      bus_name: dep.busName,
      depart_date: newDate,
      depart_time: dep.departTime,
      arrive_time: dep.arriveTime,
      total_price: newTotal,
    })
    .eq("id", pendingRescheduleBooking.id)
    .eq("user_id", currentSession.user.id)
    .select("id")
    .maybeSingle();

  confirmRescheduleBtn.textContent = "Confirm reschedule";

  if (error) {
    console.error("Reschedule booking:", error);
    alert(`Could not reschedule:\n\n${error.message}`);
    updateRescheduleConfirmState();
    return;
  }

  if (!data) {
    alert("Reschedule failed. Booking not found.");
    updateRescheduleConfirmState();
    return;
  }

  closeRescheduleModal();
  alert(
    `Trip rescheduled.\n\n${dep.route}\n${newDate} · ${dep.departTime} · ${dep.busName}\nNew total: ${formatCurrency(newTotal)}`
  );
  await loadTrips();
}

async function confirmCancellation() {
  if (!pendingCancelBooking?.id || !currentSession?.user) return;

  const typed = normalizeEmail(cancelEmailInput?.value);
  const allowed = getAllowedEmailsForBooking(pendingCancelBooking);
  if (!typed || !allowed.has(typed)) {
    alert("Enter the email address that matches this booking.");
    return;
  }

  const eligibility = getCancellationEligibility(pendingCancelBooking);
  if (!eligibility.allowed) {
    alert(eligibility.reason);
    return;
  }

  const supabase = window.supabaseClient;
  if (!supabase) {
    alert("Supabase is not available.");
    return;
  }

  const refundAmount = pendingCancelBooking.totalPriceAmount;
  const nowIso = new Date().toISOString();

  confirmCancelBtn.disabled = true;
  confirmCancelBtn.textContent = "Processing…";

  const { data, error } = await supabase
    .from("bookings")
    .update({
      status: "refunded",
      cancelled_at: nowIso,
      refunded_at: nowIso,
      refund_amount: refundAmount,
    })
    .eq("id", pendingCancelBooking.id)
    .eq("user_id", currentSession.user.id)
    .select("id")
    .maybeSingle();

  confirmCancelBtn.textContent = "Cancel & refund";

  if (error) {
    console.error("Cancel booking:", error);
    alert(
      `Could not cancel:\n\n${error.message}\n\nRun supabase/bookings-cancel.sql and ensure bookings_update_own policy exists.`
    );
    updateCancelConfirmState();
    return;
  }

  if (!data) {
    alert("Cancellation failed. Booking not found or already cancelled.");
    updateCancelConfirmState();
    return;
  }

  closeCancelModal();
  alert(
    `Reservation cancelled.\n\nA refund of ${formatCurrency(refundAmount)} will be returned to your original payment method within 5–7 business days.`
  );
  await loadTrips();
}

if (cancelEmailInput) {
  cancelEmailInput.addEventListener("input", updateCancelConfirmState);
}

if (confirmCancelBtn) {
  confirmCancelBtn.addEventListener("click", confirmCancellation);
}

document.querySelectorAll("[data-close-cancel]").forEach((btn) => {
  btn.addEventListener("click", closeCancelModal);
});

if (cancelModal) {
  cancelModal.addEventListener("click", (e) => {
    if (e.target === cancelModal) closeCancelModal();
  });
}

if (rescheduleEmailInput) {
  rescheduleEmailInput.addEventListener("input", updateRescheduleConfirmState);
}

if (rescheduleDateInput) {
  rescheduleDateInput.addEventListener("change", () => {
    renderRescheduleDeparturesList();
    updateRescheduleConfirmState();
  });
}

if (rescheduleDeparturesEl) {
  rescheduleDeparturesEl.addEventListener("change", (e) => {
    const input = e.target;
    if (input?.name !== "reschedule-departure") return;
    selectedRescheduleDepartureId = input.value;
    updateRescheduleConfirmState();
  });
}

if (confirmRescheduleBtn) {
  confirmRescheduleBtn.addEventListener("click", confirmReschedule);
}

document.querySelectorAll("[data-close-reschedule]").forEach((btn) => {
  btn.addEventListener("click", closeRescheduleModal);
});

if (rescheduleModal) {
  rescheduleModal.addEventListener("click", (e) => {
    if (e.target === rescheduleModal) closeRescheduleModal();
  });
}

async function loadTrips() {
  tripsList.innerHTML = "";

  const supabase = window.supabaseClient;
  if (!supabase) {
    setEmptyMessage(
      "Supabase did not load. Open this site over http(s), not file://."
    );
    return;
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user) {
    const login = window.gobusAuth
      ? window.gobusAuth.loginUrl("mytrips.html")
      : "login.html";
    window.location.replace(login);
    return;
  }

  currentSession = session;

  if (window.gobusAuth) {
    await window.gobusAuth.migrateLocalTripsToDatabase(session);
  }

  const { data, error } = await supabase
    .from("bookings")
    .select("*")
    .eq("user_id", session.user.id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Supabase loadTrips:", error);
    setEmptyMessage(
      "Could not load trips. Run <code>bookings-cancel.sql</code> and <code>schema.sql</code> in the SQL Editor."
    );
    return;
  }

  if (data && data.length > 0) {
    tripsEmpty.style.display = "none";
    data.forEach((b) => renderTripCard(bookingFromRow(b)));
    return;
  }

  if (window.gobusAuth) {
    const localOnly = window.gobusAuth.localTripsForUser(session);
    if (localOnly.length > 0) {
      tripsEmpty.style.display = "none";
      localOnly.forEach((trip) => {
        renderTripCard({
          route: trip.route,
          busName: trip.busName,
          date: trip.date,
          tripType: trip.tripType,
          departTime: trip.departTime,
          arriveTime: trip.arriveTime,
          totalPrice: trip.totalPrice,
          totalPriceAmount: trip.totalPriceAmount,
          adultQty: trip.adultQty,
          childQty: trip.childQty,
          seniorQty: trip.seniorQty,
          studentQty: trip.studentQty,
          pwdQty: trip.pwdQty,
          seats: trip.seats || [],
          status: "confirmed",
          isCloud: false,
        });
      });
      return;
    }
  }

  setEmptyMessage(
    'You do not have any saved trips yet. <a href="index.html">Book a trip</a> while signed in, then use <strong>Send &amp; Save Trip</strong> at checkout.'
  );
}

loadTrips();
