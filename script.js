const tripTypeButtons = document.querySelectorAll(".toggle-btn");
const returnGroup = document.querySelector('[data-round-trip-only="true"]');
const searchForm = document.getElementById("search-form");
const findDeparturesBtn = document.getElementById("find-departures-btn");
const originSelect = document.getElementById("origin");
const destinationSelect = document.getElementById("destination");
const departingInput = document.getElementById("departing");
const returnInput = document.getElementById("return-date");
const resultsSection = document.getElementById("results-section");
const departuresList = document.getElementById("departures-list");
const ticketSummaryText = document.getElementById("ticket-summary-text");
const totalPriceEl = document.getElementById("total-price");
const checkoutBtn = document.getElementById("checkout-btn");
const sortButtons = document.querySelectorAll(".pill-btn");
const departuresCountEl = document.getElementById("departures-count");
const busFilterInput = document.getElementById("bus-filter");
const seatModal = document.getElementById("seat-modal");
const seatGrid = document.getElementById("seat-grid");
const seatCountLabel = document.getElementById("seat-count-label");
const seatModalRoute = document.getElementById("seat-modal-route");
const seatModalPrice = document.getElementById("seat-modal-price");
const confirmSeatsBtn = document.getElementById("confirm-seats-btn");
const paymentModal = document.getElementById("payment-modal");
const paymentTotalEl = document.getElementById("payment-total");
const paymentGcashFields = document.getElementById("payment-gcash-fields");
const paymentCardFields = document.getElementById("payment-card-fields");
const paymentGcashNumber = document.getElementById("payment-gcash-number");
const paymentCardName = document.getElementById("payment-card-name");
const paymentCardNumber = document.getElementById("payment-card-number");
const paymentCardExpiry = document.getElementById("payment-card-expiry");
const paymentCardCvv = document.getElementById("payment-card-cvv");
const paymentHint = document.getElementById("payment-hint");
const confirmPaymentBtn = document.getElementById("confirm-payment-btn");
const receiptModal = document.getElementById("receipt-modal");
const receiptBody = document.getElementById("receipt-body");
const receiptEmailInput = document.getElementById("receipt-email");
const idConfirmCheckbox = document.getElementById("id-confirm-checkbox");
const sendReceiptBtn = document.getElementById("send-receipt-btn");
const bookingSuccessModal = document.getElementById("booking-success-modal");
const bookingSuccessMessage = document.getElementById("booking-success-message");
const bookingSuccessOkBtn = document.getElementById("booking-success-ok");

const PASSENGER_ROLES = ["adult", "child", "senior", "student", "pwd"];

let currentTripType = "one-way";
let currentSort = "cheapest";
let busFilterQuery = "";
let lockedTripId = null;
let activeSeatTripId = null;
let selectedSeats = new Set();
let seatModalMaxPassengers = 0;
let activeReceiptInfo = null;
let isCompletingCheckout = false;
let checkoutOpening = false;
let lastSavedBookingFingerprint = null;
let lastSavedBookingAt = 0;
let activeDepartures = [];

function findTrip(tripId) {
  return activeDepartures.find((t) => t.id === tripId);
}

function getOccupiedSeatNumbers(tripId) {
  if (window.gtfsData?.isReady?.()) {
    return window.gtfsData.getOccupiedSeatsForTrip(tripId);
  }
  return [1, 5, 9, 14, 22, 30, 38];
}

if (seatModal) seatModal.classList.add("hidden");
if (paymentModal) paymentModal.classList.add("hidden");
if (receiptModal) receiptModal.classList.add("hidden");
if (bookingSuccessModal) bookingSuccessModal.classList.add("hidden");

const PAYMENT_METHOD_LABELS = {
  gcash: "GCash",
  credit_card: "Credit card",
  debit_card: "Debit card",
};

function formatPaymentMethodLabel(method) {
  return PAYMENT_METHOD_LABELS[method] || method || "—";
}

function getSelectedPaymentMethod() {
  const checked = document.querySelector('input[name="payment-method"]:checked');
  return checked?.value || "";
}

function resetPaymentForm() {
  document.querySelectorAll('input[name="payment-method"]').forEach((el) => {
    el.checked = false;
  });
  if (paymentGcashNumber) paymentGcashNumber.value = "";
  if (paymentCardName) paymentCardName.value = "";
  if (paymentCardNumber) paymentCardNumber.value = "";
  if (paymentCardExpiry) paymentCardExpiry.value = "";
  if (paymentCardCvv) paymentCardCvv.value = "";
  if (paymentGcashFields) paymentGcashFields.classList.add("hidden");
  if (paymentCardFields) paymentCardFields.classList.add("hidden");
  updatePaymentFormState();
}

function updatePaymentFormState() {
  const method = getSelectedPaymentMethod();

  if (paymentGcashFields) {
    paymentGcashFields.classList.toggle("hidden", method !== "gcash");
  }
  if (paymentCardFields) {
    paymentCardFields.classList.toggle(
      "hidden",
      method !== "credit_card" && method !== "debit_card"
    );
  }

  let valid = Boolean(method);
  let hint = "Select a payment method to continue.";

  if (method === "gcash") {
    const phone = (paymentGcashNumber?.value || "").replace(/\D/g, "");
    if (phone.length < 11) {
      valid = false;
      hint = "Enter your 11-digit GCash mobile number.";
    } else {
      hint = "You will confirm payment in the GCash app (demo).";
    }
  } else if (method === "credit_card" || method === "debit_card") {
    const name = (paymentCardName?.value || "").trim();
    const digits = (paymentCardNumber?.value || "").replace(/\D/g, "");
    const expiry = (paymentCardExpiry?.value || "").trim();
    const cvv = (paymentCardCvv?.value || "").trim();
    if (!name || digits.length < 15 || !/^\d{2}\/\d{2}$/.test(expiry) || cvv.length < 3) {
      valid = false;
      hint = "Enter cardholder name, card number, expiry (MM/YY), and CVV.";
    } else {
      hint = `Paying with ${formatPaymentMethodLabel(method)} (demo — no real charge).`;
    }
  } else if (method) {
    hint = `Paying with ${formatPaymentMethodLabel(method)}.`;
  }

  if (confirmPaymentBtn) confirmPaymentBtn.disabled = !valid;
  if (paymentHint) paymentHint.textContent = hint;
}

function closePaymentModal() {
  if (!paymentModal) return;
  paymentModal.classList.add("hidden");
  paymentModal.setAttribute("aria-hidden", "true");
}

function openPaymentModal(info) {
  if (!paymentModal || !info) return;
  activeReceiptInfo = info;
  if (paymentTotalEl) {
    paymentTotalEl.textContent = `Total: ${info.totalPrice}`;
  }
  resetPaymentForm();
  paymentModal.classList.remove("hidden");
  paymentModal.setAttribute("aria-hidden", "false");
}

function applyPaymentToReceiptInfo() {
  const method = getSelectedPaymentMethod();
  if (!activeReceiptInfo || !method) return false;

  activeReceiptInfo.paymentMethod = method;
  activeReceiptInfo.paymentMethodLabel = formatPaymentMethodLabel(method);

  if (method === "gcash") {
    const phone = (paymentGcashNumber?.value || "").replace(/\D/g, "");
    activeReceiptInfo.paymentDetail = `GCash ${phone}`;
  } else if (method === "credit_card" || method === "debit_card") {
    const digits = (paymentCardNumber?.value || "").replace(/\D/g, "");
    const last4 = digits.slice(-4);
    activeReceiptInfo.paymentDetail = `${formatPaymentMethodLabel(method)} ending ${last4}`;
  }

  return true;
}

function openReceiptAfterPayment(session) {
  if (receiptEmailInput && session?.user?.email) {
    receiptEmailInput.value = session.user.email;
  }
  if (idConfirmCheckbox) idConfirmCheckbox.checked = false;
  renderReceiptModal(activeReceiptInfo);
  closePaymentModal();
  if (receiptModal) {
    receiptModal.classList.remove("hidden");
    receiptModal.setAttribute("aria-hidden", "false");
  }
}

function bookingFingerprint(info) {
  if (!info) return "";
  const seats = Array.isArray(info.seats) ? info.seats.join(",") : "";
  return [
    info.route,
    info.date,
    info.departTime,
    info.totalPriceAmount,
    seats,
    info.adultQty,
    info.childQty,
  ].join("|");
}

function setCheckoutButtonBusy(busy) {
  if (!checkoutBtn) return;
  checkoutBtn.disabled = busy;
  checkoutBtn.textContent = busy ? "Opening…" : "Checkout";
}

function setSendReceiptBusy(busy) {
  if (!sendReceiptBtn) return;
  sendReceiptBtn.disabled = busy;
  sendReceiptBtn.textContent = busy ? "Saving…" : "Send & Save Trip";
}

function closeReceiptModal() {
  if (!receiptModal) return;
  receiptModal.classList.add("hidden");
  receiptModal.setAttribute("aria-hidden", "true");
  activeReceiptInfo = null;
  if (idConfirmCheckbox) idConfirmCheckbox.checked = false;
  setSendReceiptBusy(false);
}

function showBookingSuccessModal(message) {
  if (bookingSuccessMessage) {
    bookingSuccessMessage.textContent =
      message ||
      "Your trip was saved. You can view it in My Trips or book another route below.";
  }
  if (bookingSuccessModal) {
    bookingSuccessModal.classList.remove("hidden");
    bookingSuccessModal.setAttribute("aria-hidden", "false");
  }
}

function resetBookingStateAfterSuccess() {
  activeReceiptInfo = null;
  clearLockedTrip();
  activeSeatTripId = null;
  selectedSeats = new Set();
  activeDepartures = [];
  if (departuresList) departuresList.innerHTML = "";
  if (resultsSection) resultsSection.classList.add("hidden");
  if (window.busLiveMap) window.busLiveMap.hide();
  if (departuresCountEl) departuresCountEl.textContent = "0 departures";
  if (busFilterInput) busFilterInput.value = "";
  busFilterQuery = "";
  closeReceiptModal();
  closePaymentModal();
  if (seatModal) seatModal.classList.add("hidden");
  if (idConfirmCheckbox) idConfirmCheckbox.checked = false;
  if (receiptEmailInput) receiptEmailInput.value = "";
  calculateTotals();
  setCheckoutButtonBusy(false);
}

function isDuplicateBookingAttempt(info) {
  const fp = bookingFingerprint(info);
  const dup =
    fp &&
    fp === lastSavedBookingFingerprint &&
    Date.now() - lastSavedBookingAt < 15000;
  return dup;
}

tripTypeButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    currentTripType = btn.dataset.tripType;
    tripTypeButtons.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");

    if (currentTripType === "round-trip") {
      returnGroup.style.display = "flex";
    } else {
      returnGroup.style.display = "none";
    }

    validateSearchForm();
  });
});

if (returnGroup && currentTripType === "one-way") {
  returnGroup.style.display = "none";
}

function validateSearchForm() {
  if (!findDeparturesBtn) return;

  const hasBasic =
    originSelect.value &&
    destinationSelect.value &&
    departingInput.value;

  let valid = hasBasic;

  if (currentTripType === "round-trip") {
    valid = hasBasic && returnInput.value;
  }

  findDeparturesBtn.disabled = !valid;
}

[originSelect, destinationSelect, departingInput, returnInput].forEach(
  (el) => {
    if (el) {
      el.addEventListener("change", validateSearchForm);
      el.addEventListener("input", validateSearchForm);
    }
  }
);

function tripMatchesBusFilter(trip, q) {
  const needle = (q || "").trim().toLowerCase();
  if (!needle) return true;
  const hay = [
    trip.route,
    trip.busName,
    trip.departTime,
    trip.arriveTime,
    trip.duration,
    String(trip.adultFare),
    String(trip.seatsAvailable),
  ]
    .join(" ")
    .toLowerCase();
  return hay.includes(needle);
}

function getBusServiceLabel(trip) {
  if (!trip?.busName) return "Coach";
  const name = String(trip.busName);
  if (/^express/i.test(name)) return "Express";
  if (/^standard/i.test(name)) return "Standard";
  return "Coach";
}

function captureCardState() {
  const state = {};
  departuresList.querySelectorAll(".departure-card").forEach((card) => {
    const id = Number(card.dataset.id);
    const qty = {};
    PASSENGER_ROLES.forEach((role) => {
      const el = card.querySelector(`select[data-role="${role}"]`);
      qty[role] = el ? el.value : "0";
    });
    state[id] = {
      qty,
      pickedSeats: card.dataset.pickedSeats || null,
    };
  });
  return state;
}

function applyCardStateToCard(card, tripId, state) {
  const s = state[tripId];
  if (!s) return;
  PASSENGER_ROLES.forEach((role) => {
    const el = card.querySelector(`select[data-role="${role}"]`);
    if (el && s.qty[role] !== undefined) el.value = s.qty[role];
  });
  if (s.pickedSeats) card.dataset.pickedSeats = s.pickedSeats;
}

function resetOtherDepartureCards(keepTripId) {
  departuresList.querySelectorAll(".departure-card").forEach((card) => {
    if (Number(card.dataset.id) === keepTripId) return;
    card.querySelectorAll(".qty-select").forEach((sel) => {
      sel.value = "0";
    });
    delete card.dataset.pickedSeats;
  });
  calculateTotals();
}

function highlightPassengerSection(card) {
  if (!card) return;
  card.scrollIntoView({ behavior: "smooth", block: "center" });
  card.classList.add("departure-card--passengers-hint");
  if (card._passHintTimer) clearTimeout(card._passHintTimer);
  card._passHintTimer = setTimeout(() => {
    card.classList.remove("departure-card--passengers-hint");
    card._passHintTimer = null;
  }, 3500);
  const first = card.querySelector('select[data-role="adult"]');
  if (first) {
    requestAnimationFrame(() =>
      first.focus({ preventScroll: true })
    );
  }
}

function clearLockedTrip() {
  lockedTripId = null;
  updateBookingLockUI();
}

function applyTripLockVisibility() {
  departuresList.querySelectorAll(".departure-card").forEach((card) => {
    const show =
      lockedTripId == null || Number(card.dataset.id) === lockedTripId;
    card.classList.toggle("departure-card--hidden", !show);
  });
}

function lockToTrip(tripId, options = {}) {
  const skipRender = options.skipRender === true;
  if (lockedTripId === tripId) {
    updateBookingLockUI();
    if (skipRender) applyTripLockVisibility();
    return;
  }
  lockedTripId = tripId;
  resetOtherDepartureCards(tripId);
  if (skipRender) {
    applyTripLockVisibility();
  } else {
    renderDepartures();
  }
  calculateTotals();
  updateBookingLockUI();
}

function updateBookingLockUI() {
  const banner = document.getElementById("booking-lock-banner");
  const tripLabel = document.getElementById("booking-lock-trip");
  const locked = lockedTripId != null;

  if (busFilterInput) busFilterInput.disabled = locked;
  sortButtons.forEach((btn) => {
    btn.disabled = locked;
    btn.setAttribute("aria-disabled", locked ? "true" : "false");
  });

  if (!banner || !tripLabel) return;
  if (locked) {
    const trip = findTrip(lockedTripId);
    banner.classList.remove("hidden");
    tripLabel.textContent = trip ? trip.busName : "—";
  } else {
    banner.classList.add("hidden");
  }
}

function getSortedDepartures() {
  const trips = activeDepartures.filter((t) => {
    if (lockedTripId != null) return t.id === lockedTripId;
    return tripMatchesBusFilter(t, busFilterQuery);
  });

  if (currentSort === "earliest") {
    trips.sort((a, b) => a.departTime.localeCompare(b.departTime));
  } else if (currentSort === "cheapest") {
    trips.sort((a, b) => a.adultFare - b.adultFare);
  }

  return trips;
}

function updateDeparturesCountTitle(count) {
  if (!departuresCountEl) return;
  const label =
    count === 1 ? "1 Departure Found" : `${count} Departures Found`;
  departuresCountEl.textContent = label;
}

function syncLiveBusMap() {
  if (!window.busLiveMap) return;
  if (!resultsSection || resultsSection.classList.contains("hidden")) {
    window.busLiveMap.hide();
    return;
  }
  const trips = getSortedDepartures();
  if (!trips.length) {
    window.busLiveMap.hide();
    return;
  }
  window.busLiveMap.update({
    trips,
    origin: originSelect?.value || "",
    destination: destinationSelect?.value || "",
    travelDate: departingInput?.value || "",
  });
}

function formatCurrency(value) {
  return `₱${value.toFixed(2)}`;
}
function qtyOptionsHtml() {
  return Array.from({ length: 7 }, (_, i) => `<option value="${i}">${i}</option>`).join(
    ""
  );
}
function getConcessionFares(adultFare) {
  return {
    senior: Math.round(adultFare * 0.8),
    student: Math.round(adultFare * 0.85),
    pwd: Math.round(adultFare * 0.8),
  };
}
function getCardPassengerTotal(card) {
  if (!card) return 0;
  return PASSENGER_ROLES.reduce((sum, role) => {
    const el = card.querySelector(`select[data-role="${role}"]`);
    return sum + Number(el?.value || 0);
  }, 0);
}
function getTripPriceForCard(card, trip) {
  const adult = Number(card.querySelector('[data-role="adult"]')?.value || 0);
  const child = Number(card.querySelector('[data-role="child"]')?.value || 0);
  const senior = Number(card.querySelector('[data-role="senior"]')?.value || 0);
  const student = Number(card.querySelector('[data-role="student"]')?.value || 0);
  const pwd = Number(card.querySelector('[data-role="pwd"]')?.value || 0);
  const d = getConcessionFares(trip.adultFare);
  return (
    adult * trip.adultFare +
    child * trip.childFare +
    senior * d.senior +
    student * d.student +
    pwd * d.pwd
  );
}

function renderDepartures(options = {}) {
  const resetState = options.resetState === true;
  const state = resetState ? {} : captureCardState();

  departuresList.innerHTML = "";

  const trips = getSortedDepartures();
  updateDeparturesCountTitle(trips.length);

  if (trips.length === 0) {
    const empty = document.createElement("p");
    empty.className = "departures-empty";
    const q = (busFilterQuery || "").trim();
    empty.textContent = q
      ? `No buses match “${q}”. Try another keyword or clear the filter.`
      : "No departures match your search.";
    departuresList.appendChild(empty);
    updateBookingLockUI();
    syncLiveBusMap();
    return;
  }

  trips.forEach((trip) => {
    const card = document.createElement("article");
    card.className = "departure-card";
    card.dataset.id = trip.id;

    const busColor = window.busTripColors?.getBusColor(trip.id);
    const colorHex = busColor?.hex || "#1565c0";
    if (busColor) {
      card.dataset.busColor = colorHex;
      card.style.setProperty("--bus-track-color", colorHex);
    }

    const colorDot =
      window.busTripColors?.colorDotHtml(colorHex, {
        title: "Match this dot to the bus on the map",
      }) || "";

    const disc = getConcessionFares(trip.adultFare);
    const opts = qtyOptionsHtml();

    card.innerHTML = `
      <div class="departure-top">
        <div class="departure-route-col">
          ${colorDot}
          <div>
            <div class="route-main">${trip.route}</div>
            <div class="route-sub">${trip.busName}</div>
          </div>
        </div>
        <div>
          <span class="seats-line">${trip.seatsAvailable}</span>
          <span class="seats-available">Available</span>
        </div>
        <div>
          <span class="time-value">${trip.departTime}</span>
          <span class="time-label">Departure</span>
        </div>
        <div>
          <span class="time-value">${trip.arriveTime}</span>
          <span class="time-label">Arrival</span>
        </div>
        <div>
          <span class="duration-value">${trip.duration}</span>
          <span class="duration-label">Duration</span>
        </div>
      </div>
      <div class="departure-bottom">
        <div class="passenger-fares" role="group" aria-label="Passenger fares">
          <span class="fare-label">Adult</span>
          <select class="qty-select" data-role="adult">${opts}</select>
          <span class="fare-x" aria-hidden="true">×</span>
          <span class="fare-math">${formatCurrency(trip.adultFare)}</span>

          <span class="fare-label">Child</span>
          <select class="qty-select" data-role="child">${opts}</select>
          <span class="fare-x" aria-hidden="true">×</span>
          <span class="fare-math">${formatCurrency(trip.childFare)}</span>

          <span class="fare-label">Senior</span>
          <select class="qty-select" data-role="senior">${opts}</select>
          <span class="fare-x" aria-hidden="true">×</span>
          <span class="fare-math">${formatCurrency(disc.senior)}</span>
          <span class="fare-hint">20% off adult · SC ID</span>

          <span class="fare-label">Student</span>
          <select class="qty-select" data-role="student">${opts}</select>
          <span class="fare-x" aria-hidden="true">×</span>
          <span class="fare-math">${formatCurrency(disc.student)}</span>
          <span class="fare-hint">15% off adult · School ID</span>

          <span class="fare-label">PWD</span>
          <select class="qty-select" data-role="pwd">${opts}</select>
          <span class="fare-x" aria-hidden="true">×</span>
          <span class="fare-math">${formatCurrency(disc.pwd)}</span>
          <span class="fare-hint">20% off adult · PWD ID</span>
        </div>
        <div class="fare-pick-seats">
          <button type="button" class="btn btn-outline btn-small" data-pick-seats>
            Pick Seats
          </button>
        </div>
      </div>
    `;

    departuresList.appendChild(card);
    applyCardStateToCard(card, trip.id, state);
  });
  updateBookingLockUI();
  syncLiveBusMap();
}

function calculateTotals() {
  let totalPrice = 0;
  let ticketCount = 0;

  departuresList.querySelectorAll(".departure-card").forEach((card) => {
    const id = Number(card.dataset.id);
    const trip = findTrip(id);
    ticketCount += getCardPassengerTotal(card);
    totalPrice += getTripPriceForCard(card, trip);
  });

  totalPriceEl.textContent = formatCurrency(totalPrice);

  if (ticketCount === 0) {
    ticketSummaryText.textContent = "No tickets selected";
    checkoutBtn.disabled = true;
  } else {
    ticketSummaryText.textContent = `${ticketCount} ticket${
      ticketCount > 1 ? "s" : ""
    } selected`;
    checkoutBtn.disabled = false;
  }
}

if (searchForm) {
  searchForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!window.gtfsData?.isReady?.()) {
      alert(
        window.gtfsData?.getLoadError?.() ||
          "Route data is still loading. Open over http(s) and run supabase/transit-catalog.sql + seed-transit.sql."
      );
      return;
    }
    clearLockedTrip();
    busFilterQuery = "";
    if (busFilterInput) busFilterInput.value = "";
    activeDepartures = window.gtfsData.getDeparturesForSearch(
      originSelect?.value,
      destinationSelect?.value
    );
    resultsSection.classList.remove("hidden");
    renderDepartures({ resetState: true });
    calculateTotals();
    requestAnimationFrame(() => {
      syncLiveBusMap();
      window.busLiveMap?.invalidateSize?.();
    });
  });
}

if (busFilterInput) {
  busFilterInput.addEventListener("input", () => {
    if (lockedTripId != null) return;
    busFilterQuery = busFilterInput.value;
    renderDepartures();
    calculateTotals();
  });
}

departuresList.addEventListener("focusin", (e) => {
  if (e.target.matches(".qty-select")) {
    e.target.dataset.prevQty = e.target.value;
  }
});

departuresList.addEventListener("change", (e) => {
  if (!e.target.matches(".qty-select")) return;

  const card = e.target.closest(".departure-card");
  if (!card) return;
  const tripId = Number(card.dataset.id);
  const prev = e.target.dataset.prevQty ?? "0";

  if (lockedTripId != null && lockedTripId !== tripId) {
    e.target.value = prev;
    alert(
      "You already started booking on another bus. Click “Choose a different bus” to switch."
    );
    return;
  }

  const passengerTotal = getCardPassengerTotal(card);
  if (passengerTotal > 0) {
    if (lockedTripId == null) {
      lockToTrip(tripId);
      return;
    }
  } else if (lockedTripId === tripId) {
    clearLockedTrip();
    renderDepartures();
  }

  calculateTotals();
  updateBookingLockUI();
});

departuresList.addEventListener("click", (e) => {
  const card = e.target.closest(".departure-card");
  if (card && !e.target.closest("[data-pick-seats]") && window.busLiveMap) {
    window.busLiveMap.highlightTrip(Number(card.dataset.id));
  }

  const pickBtn = e.target.closest("[data-pick-seats]");
  if (!pickBtn) return;
  if (!card) return;

  const tripId = Number(card.dataset.id);
  if (lockedTripId != null && lockedTripId !== tripId) {
    alert(
      "You already started booking on another bus. Click “Choose a different bus” to switch."
    );
    return;
  }

  openSeatModal(card);
});

const changeDepartureBtn = document.getElementById("change-departure-btn");
if (changeDepartureBtn) {
  changeDepartureBtn.addEventListener("click", () => {
    clearLockedTrip();
    renderDepartures({ resetState: true });
    calculateTotals();
  });
}

sortButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    sortButtons.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");

    currentSort = btn.dataset.sort;
    if (!resultsSection.classList.contains("hidden")) {
      renderDepartures();
      calculateTotals();
    }
  });
});

function openSeatModal(card) {
  const tripId = Number(card.dataset.id);
  activeSeatTripId = tripId;

  const trip = findTrip(activeSeatTripId);
  if (!trip || !seatGrid) return;

  seatModalMaxPassengers = getCardPassengerTotal(card);

  if (seatModalMaxPassengers === 0) {
    highlightPassengerSection(card);
    return;
  }

  if (lockedTripId == null) {
    lockToTrip(tripId, { skipRender: true });
  } else if (lockedTripId !== tripId) {
    return;
  }

  const origin = originSelect?.value || "Origin";
  const dest = destinationSelect?.value || "Destination";
  if (seatModalRoute) {
    seatModalRoute.textContent = `${trip.busName} · ${origin} → ${dest}`;
  }

  selectedSeats = new Set();
  const prev = card.dataset.pickedSeats;
  if (prev) {
    try {
      JSON.parse(prev).forEach((n) => selectedSeats.add(String(n)));
    } catch {

    }
  }

  const occupied = new Set(getOccupiedSeatNumbers(trip.id).map(String));
  selectedSeats = new Set(
    [...selectedSeats].filter((s) => !occupied.has(s))
  );
  while (selectedSeats.size > seatModalMaxPassengers) {
    const arr = [...selectedSeats].map(Number).sort((a, b) => a - b);
    arr.pop();
    selectedSeats = new Set(arr.map(String));
  }
  const totalSeatSlots = Math.min(40, trip.seatsAvailable || 40);

  seatGrid.innerHTML = "";

  let currentRow = null;
  for (let seatNum = 1; seatNum <= totalSeatSlots; seatNum++) {
    if ((seatNum - 1) % 4 === 0) {
      currentRow = document.createElement("div");
      currentRow.className = "seat-row";
      seatGrid.appendChild(currentRow);
    }

    const seatEl = document.createElement("button");
    seatEl.type = "button";
    seatEl.className = "seat-btn";
    seatEl.textContent = String(seatNum);
    seatEl.dataset.seat = String(seatNum);

    if (occupied.has(String(seatNum))) {
      seatEl.classList.add("seat-btn--occupied");
      seatEl.disabled = true;
      seatEl.setAttribute("aria-disabled", "true");
    } else {
      seatEl.classList.add("seat-btn--available");
      if (selectedSeats.has(String(seatNum))) {
        seatEl.classList.add("seat-btn--selected");
      }
      seatEl.addEventListener("click", () =>
        toggleSeatSelection(seatEl, seatNum)
      );
    }

    currentRow.appendChild(seatEl);

    if ((seatNum - 1) % 4 === 1) {
      const aisle = document.createElement("div");
      aisle.className = "seat-aisle";
      aisle.setAttribute("aria-hidden", "true");
      currentRow.appendChild(aisle);
    }
  }

  updateSeatModalUI(card, trip);
  seatModal.classList.remove("hidden");
}

function toggleSeatSelection(seatEl, seatNum) {
  const key = String(seatNum);
  if (selectedSeats.has(key)) {
    selectedSeats.delete(key);
    seatEl.classList.remove("seat-btn--selected");
  } else {
    if (selectedSeats.size >= seatModalMaxPassengers) {
      alert(
        `You can only select ${seatModalMaxPassengers} seat(s) — same as your passenger count.`
      );
      return;
    }
    selectedSeats.add(key);
    seatEl.classList.add("seat-btn--selected");
  }

  seatEl.blur();

  const card = departuresList.querySelector(
    `.departure-card[data-id="${activeSeatTripId}"]`
  );
  const trip = findTrip(activeSeatTripId);
  if (card && trip) updateSeatModalUI(card, trip);
}

function updateSeatModalUI(card, trip) {
  const nums = [...selectedSeats]
    .map(Number)
    .sort((a, b) => a - b);
  const count = nums.length;

  if (seatCountLabel) {
    if (count === 0) {
      seatCountLabel.textContent = "0 seats selected";
    } else {
      seatCountLabel.textContent = `${count} seat${
        count === 1 ? "" : "s"
      } selected: ${nums.map((n) => `#${n}`).join(", ")}`;
    }
  }

  const rowTotal = getTripPriceForCard(card, trip);

  if (seatModalPrice) {
    seatModalPrice.textContent = formatCurrency(rowTotal);
  }

  if (confirmSeatsBtn) {
    const ready = count === seatModalMaxPassengers && seatModalMaxPassengers > 0;
    confirmSeatsBtn.disabled = !ready;
    confirmSeatsBtn.textContent = `Continue (${count} seat${count === 1 ? "" : "s"})`;
  }
}

if (seatModal && seatGrid && seatCountLabel && confirmSeatsBtn) {
  document
    .querySelectorAll("[data-close-seat]")
    .forEach((btn) =>
      btn.addEventListener("click", () => seatModal.classList.add("hidden"))
    );

  confirmSeatsBtn.addEventListener("click", () => {
    if (!activeSeatTripId) {
      seatModal.classList.add("hidden");
      return;
    }

    const card = departuresList.querySelector(
      `.departure-card[data-id="${activeSeatTripId}"]`
    );
    if (!card) {
      seatModal.classList.add("hidden");
      return;
    }

    const nums = [...selectedSeats].map(Number).sort((a, b) => a - b);
    card.dataset.pickedSeats = JSON.stringify(nums);

    lockedTripId = activeSeatTripId;
    renderDepartures();
    calculateTotals();
    updateBookingLockUI();
    seatModal.classList.add("hidden");
  });
}

function getBookingCardAndTrip() {
  if (lockedTripId != null) {
    const card = departuresList.querySelector(
      `.departure-card[data-id="${lockedTripId}"]`
    );
    const trip = findTrip(lockedTripId);
    if (card && trip) return { card, trip };
  }
  let found = null;
  departuresList.querySelectorAll(".departure-card").forEach((card) => {
    if (found) return;
    const id = Number(card.dataset.id);
    const trip = findTrip(id);
    if (trip && getCardPassengerTotal(card) > 0) found = { card, trip };
  });
  return found;
}

function formatPassengerSummaryLines(qty) {
  const parts = [];
  if (qty.adultQty > 0) {
    parts.push(
      `${qty.adultQty} ${qty.adultQty === 1 ? "Adult" : "Adults"}`
    );
  }
  if (qty.childQty > 0) {
    parts.push(
      `${qty.childQty} ${qty.childQty === 1 ? "Child" : "Children"}`
    );
  }
  if (qty.seniorQty > 0) {
    parts.push(
      `${qty.seniorQty} ${qty.seniorQty === 1 ? "Senior" : "Seniors"}`
    );
  }
  if (qty.studentQty > 0) {
    parts.push(
      `${qty.studentQty} ${qty.studentQty === 1 ? "Student" : "Students"}`
    );
  }
  if (qty.pwdQty > 0) {
    parts.push(
      `${qty.pwdQty} PWD passenger${qty.pwdQty === 1 ? "" : "s"}`
    );
  }
  return parts;
}

function getBoardingDocumentsBlock(qty) {
  const items = [];
  if (qty.childQty > 0) {
    items.push({
      title: "Child passengers",
      text: "Valid government-issued ID or birth certificate (when applicable).",
    });
  }
  if (qty.seniorQty > 0) {
    items.push({
      title: "Senior citizens",
      text: "Senior citizen ID (OSCA ID or equivalent).",
    });
  }
  if (qty.studentQty > 0) {
    items.push({
      title: "Students",
      text: "Current school ID or registration.",
    });
  }
  if (qty.pwdQty > 0) {
    items.push({
      title: "PWD passengers",
      text: "PWD ID issued by the relevant government authority.",
    });
  }
  if (!items.length) return "";
  return `
    <div class="receipt-boarding">
      <h3 class="receipt-boarding-title">Documents required at boarding</h3>
      <ul class="receipt-boarding-list">
        ${items
          .map(
            (i) =>
              `<li><span class="receipt-boarding-item-title">${i.title}.</span> ${i.text}</li>`
          )
          .join("")}
      </ul>
    </div>
  `;
}

function renderReceiptModal(info) {
  if (!receiptBody || !info) return;

  const qty = {
    adultQty: info.adultQty,
    childQty: info.childQty,
    seniorQty: info.seniorQty,
    studentQty: info.studentQty,
    pwdQty: info.pwdQty,
  };
  const passengerParts = formatPassengerSummaryLines(qty);
  const passengerHtml = passengerParts.length
    ? `<div class="receipt-passengers">${passengerParts.join(", ")}</div>`
    : "";
  const boardingBlock = getBoardingDocumentsBlock(qty);
  const seatList = Array.isArray(info.seats) ? info.seats : [];
  const seatsLabel =
    seatList.length > 0
      ? seatList.map((n) => `#${n}`).join(", ")
      : "Not selected";

  receiptBody.innerHTML = `
    <div class="receipt-sheet">
      <div class="receipt-sheet-top">
        <span class="receipt-brand">GoBus</span>
        <span class="receipt-trip-pill">${info.tripType}</span>
      </div>
      <p class="receipt-route-line">${info.route}</p>
      <div class="receipt-meta-grid">
        <div class="receipt-meta-item">
          <span class="receipt-meta-label">Bus line</span>
          <span class="receipt-meta-value">${info.busName}</span>
        </div>
        <div class="receipt-meta-item">
          <span class="receipt-meta-label">Service type</span>
          <span class="receipt-meta-value">${info.busServiceLabel}</span>
        </div>
        <div class="receipt-meta-item">
          <span class="receipt-meta-label">Travel date</span>
          <span class="receipt-meta-value">${info.date}</span>
        </div>
        <div class="receipt-meta-item receipt-meta-item--wide">
          <span class="receipt-meta-label">Departure — Arrival</span>
          <span class="receipt-meta-value">${info.departTime} — ${info.arriveTime}</span>
        </div>
        <div class="receipt-meta-item receipt-meta-item--wide">
          <span class="receipt-meta-label">Seats</span>
          <span class="receipt-meta-value">${seatsLabel}</span>
        </div>
        ${
          info.paymentMethodLabel
            ? `<div class="receipt-meta-item receipt-meta-item--wide">
                <span class="receipt-meta-label">Payment</span>
                <span class="receipt-meta-value">${info.paymentMethodLabel}${
                  info.paymentDetail ? ` · ${info.paymentDetail}` : ""
                }</span>
              </div>`
            : ""
        }
      </div>
      ${
        passengerHtml
          ? `<div class="receipt-section"><div class="receipt-meta-label">Passengers</div>${passengerHtml}</div>`
          : ""
      }
      <div class="receipt-total-row">
        <span>Total</span>
        <strong>${info.totalPrice}</strong>
      </div>
      ${boardingBlock}
    </div>
  `;
}

function buildReceipt() {
  const pair = getBookingCardAndTrip();
  if (!pair) return null;
  const { card, trip } = pair;

  const adultQty = Number(
    card.querySelector('select[data-role="adult"]')?.value || 0
  );
  const childQty = Number(
    card.querySelector('select[data-role="child"]')?.value || 0
  );
  const seniorQty = Number(
    card.querySelector('select[data-role="senior"]')?.value || 0
  );
  const studentQty = Number(
    card.querySelector('select[data-role="student"]')?.value || 0
  );
  const pwdQty = Number(
    card.querySelector('select[data-role="pwd"]')?.value || 0
  );

  const totalPrice = getTripPriceForCard(card, trip);
  const tripTypeLabel =
    currentTripType === "round-trip" ? "Round trip" : "One way";

  let seatList = [];
  if (card.dataset.pickedSeats) {
    try {
      seatList = JSON.parse(card.dataset.pickedSeats);
    } catch {
      seatList = [];
    }
  }

  const info = {
    route: trip.route,
    busName: trip.busName,
    busServiceLabel: getBusServiceLabel(trip),
    date: departingInput.value || "N/A",
    departTime: trip.departTime,
    arriveTime: trip.arriveTime,
    adultQty,
    childQty,
    seniorQty,
    studentQty,
    pwdQty,
    totalPriceAmount: totalPrice,
    totalPrice: formatCurrency(totalPrice),
    tripType: tripTypeLabel,
    seats: seatList,
  };

  activeReceiptInfo = info;
  renderReceiptModal(info);
  return info;
}

if (checkoutBtn && receiptModal) {
  checkoutBtn.addEventListener("click", async () => {
    if (checkoutOpening || isCompletingCheckout) return;

    const pair = getBookingCardAndTrip();
    if (!pair) {
      alert("Select passengers and seats on a departure first.");
      return;
    }
    const { card } = pair;
    const pax = getCardPassengerTotal(card);
    if (pax === 0) return;
    let seatList = [];
    try {
      seatList = JSON.parse(card.dataset.pickedSeats || "[]");
    } catch {
      seatList = [];
    }
    if (!Array.isArray(seatList) || seatList.length !== pax) {
      alert(
        "Pick seats so the number of seats matches your passenger count, then checkout."
      );
      return;
    }

    checkoutOpening = true;
    setCheckoutButtonBusy(true);

    try {
      const info = buildReceipt();
      if (!info) return;

      const session = window.gobusAuth
        ? await window.gobusAuth.getSession()
        : null;

      if (!session?.user) {
        if (window.gobusAuth) {
          window.gobusAuth.stashPendingCheckout(info);
          window.location.href = window.gobusAuth.loginUrl(
            "index.html?resume=checkout"
          );
        } else {
          alert("Sign in to save your booking to your account.");
          window.location.href = "login.html";
        }
        return;
      }

      openPaymentModal(info);
    } finally {
      checkoutOpening = false;
      setCheckoutButtonBusy(false);
    }
  });
}

if (paymentModal) {
  document.querySelectorAll("[data-close-payment]").forEach((btn) => {
    btn.addEventListener("click", closePaymentModal);
  });
  paymentModal.addEventListener("click", (e) => {
    if (e.target === paymentModal) closePaymentModal();
  });
}

document.querySelectorAll('input[name="payment-method"]').forEach((input) => {
  input.addEventListener("change", updatePaymentFormState);
});

[
  paymentGcashNumber,
  paymentCardName,
  paymentCardNumber,
  paymentCardExpiry,
  paymentCardCvv,
].forEach((el) => {
  if (el) el.addEventListener("input", updatePaymentFormState);
});

if (confirmPaymentBtn) {
  confirmPaymentBtn.addEventListener("click", async () => {
    if (!activeReceiptInfo) return;
    if (!applyPaymentToReceiptInfo()) {
      alert("Please complete your payment details.");
      return;
    }

    const session = window.gobusAuth
      ? await window.gobusAuth.getSession()
      : null;

    if (!session?.user) {
      if (window.gobusAuth) {
        window.gobusAuth.stashPendingCheckout(activeReceiptInfo);
        window.location.href = window.gobusAuth.loginUrl(
          "index.html?resume=checkout"
        );
      }
      return;
    }

    openReceiptAfterPayment(session);
  });
}

if (receiptModal) {
  document.querySelectorAll("[data-close-receipt]").forEach((btn) => {
    btn.addEventListener("click", closeReceiptModal);
  });
  receiptModal.addEventListener("click", (e) => {
    if (e.target === receiptModal && !isCompletingCheckout) closeReceiptModal();
  });
}

if (sendReceiptBtn && receiptModal) {
  sendReceiptBtn.addEventListener("click", async () => {
    if (isCompletingCheckout) return;

    const info = activeReceiptInfo || buildReceipt();
    if (!info) return;

    if (!idConfirmCheckbox?.checked) {
      alert(
        "Please confirm that concession passengers will present the required documents at boarding."
      );
      return;
    }

    const email = receiptEmailInput?.value.trim();
    if (!email) {
      alert("Please enter an email address for the receipt.");
      return;
    }

    if (isDuplicateBookingAttempt(info)) {
      showBookingSuccessModal(
        "This trip was already saved. Check My Trips — no duplicate booking was created."
      );
      resetBookingStateAfterSuccess();
      return;
    }

    info.receiptEmail = email;

    const payload = {
      to_email: email,
      route: info.route,
      bus_name: info.busName,
      bus_service: info.busServiceLabel,
      date: info.date,
      depart_time: info.departTime,
      arrive_time: info.arriveTime,
      adult_qty: info.adultQty,
      child_qty: info.childQty,
      senior_qty: info.seniorQty,
      student_qty: info.studentQty,
      pwd_qty: info.pwdQty,
      trip_type: info.tripType,
      total_price: info.totalPrice,
    };

    isCompletingCheckout = true;
    setSendReceiptBusy(true);

    try {
      if (window.emailjs) {
        const serviceId = "";
        const templateId = "";
        if (serviceId && templateId) {
          try {
            await emailjs.send(serviceId, templateId, payload);
          } catch (err) {
            console.error("EmailJS error", err);
            alert(
              "We could not send the email right now, but your trip will still be saved."
            );
          }
        }
      }
      await finalizeTripSave(info);
    } catch (err) {
      console.error("Save booking:", err);
      alert("Something went wrong while saving. Please try again.");
      isCompletingCheckout = false;
      setSendReceiptBusy(false);
    }
  });
}

async function finalizeTripSave(info) {
  const receiptEmail =
    (info?.receiptEmail && String(info.receiptEmail).trim()) || null;

  if (!window.gobusAuth) {
    alert("Auth helper did not load.");
    isCompletingCheckout = false;
    setSendReceiptBusy(false);
    return;
  }

  const session = await window.gobusAuth.getSession();
  if (!session?.user) {
    alert("You must be signed in to save a trip. Please sign in and try again.");
    window.location.href = window.gobusAuth.loginUrl("index.html");
    isCompletingCheckout = false;
    setSendReceiptBusy(false);
    return;
  }

  const result = await window.gobusAuth.saveBookingToDatabase(
    info,
    session,
    receiptEmail
  );

  if (!result.ok) {
    console.error("Supabase insert error:", result.error);
    alert(
      `Could not save to your account:\n\n${result.error?.message || result.error}\n\nRun supabase/bookings-table.sql and supabase/schema.sql in the SQL Editor.`
    );
    isCompletingCheckout = false;
    setSendReceiptBusy(false);
    return;
  }

  const trips = window.gobusAuth.loadLocalTrips();
  trips.push({
    ...info,
    ownerUserId: session.user.id,
    ownerEmail: (session.user.email || receiptEmail || "").toLowerCase(),
    receiptEmail,
    syncedToCloud: true,
    bookedAt: new Date().toISOString(),
  });
  window.gobusAuth.saveLocalTrips(trips);

  lastSavedBookingFingerprint = bookingFingerprint(info);
  lastSavedBookingAt = Date.now();

  closeReceiptModal();
  resetBookingStateAfterSuccess();
  isCompletingCheckout = false;
  setSendReceiptBusy(false);

  showBookingSuccessModal(
    `Your trip on ${info.route} (${info.date}) was saved. View it in My Trips or search for another route.`
  );
}

if (bookingSuccessOkBtn) {
  bookingSuccessOkBtn.addEventListener("click", () => {
    if (bookingSuccessModal) {
      bookingSuccessModal.classList.add("hidden");
      bookingSuccessModal.setAttribute("aria-hidden", "true");
    }
    resetBookingStateAfterSuccess();
  });
}

async function tryResumePendingCheckout() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("resume") !== "checkout" || !window.gobusAuth) return;

  const session = await window.gobusAuth.getSession();
  if (!session?.user) return;

  const info = window.gobusAuth.takePendingCheckout();
  if (!info) return;

  activeReceiptInfo = info;
  if (info.paymentMethod) {
    openReceiptAfterPayment(session);
  } else {
    openPaymentModal(info);
  }

  if (window.history.replaceState) {
    const url = new URL(window.location.href);
    url.searchParams.delete("resume");
    window.history.replaceState({}, "", url.pathname + url.search);
  }
}

async function initGtfsDataset() {
  const help = document.querySelector(".search-help");
  if (!window.gtfsData) {
    if (help) {
      help.textContent =
        "GTFS loader missing. Ensure gtfsData.js is included before script.js.";
    }
    validateSearchForm();
    return;
  }

  if (help) help.textContent = "Loading routes…";
  await window.gtfsData.loadGtfsData();
  window.gtfsData.populatePlaceSelects(originSelect, destinationSelect);

  const meta = window.gtfsData.getMeta();
  if (window.gtfsData.isReady() && help) {
    help.textContent = window.gtfsData.formatSearchHelpMessage(meta);
  } else if (help) {
    help.textContent =
      "Could not load routes right now. Please refresh the page or try again later.";
  }
  validateSearchForm();
}

initGtfsDataset().then(() => tryResumePendingCheckout());
validateSearchForm();








