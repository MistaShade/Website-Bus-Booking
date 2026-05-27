(function (global) {
  const BUS_COLOR_PALETTE = [
    { hex: "#e53935", label: "Red" },
    { hex: "#1e88e5", label: "Blue" },
    { hex: "#43a047", label: "Green" },
    { hex: "#fb8c00", label: "Orange" },
    { hex: "#8e24aa", label: "Purple" },
    { hex: "#00897b", label: "Teal" },
    { hex: "#d81b60", label: "Pink" },
    { hex: "#6d4c41", label: "Brown" },
    { hex: "#3949ab", label: "Indigo" },
    { hex: "#00acc1", label: "Cyan" },
    { hex: "#c0ca33", label: "Lime" },
    { hex: "#f4511e", label: "Deep orange" },
    { hex: "#5e35b1", label: "Violet" },
    { hex: "#7b1fa2", label: "Magenta" },
    { hex: "#546e7a", label: "Slate" },
    { hex: "#fdd835", label: "Yellow" },
    { hex: "#ef6c00", label: "Amber" },
    { hex: "#26a69a", label: "Sea green" },
    { hex: "#ec407a", label: "Rose" },
    { hex: "#5c6bc0", label: "Periwinkle" },
    { hex: "#8d6e63", label: "Taupe" },
    { hex: "#78909c", label: "Blue gray" },
    { hex: "#9ccc65", label: "Light green" },
    { hex: "#ff7043", label: "Coral" },
    { hex: "#ab47bc", label: "Orchid" },
    { hex: "#29b6f6", label: "Sky blue" },
    { hex: "#66bb6a", label: "Grass" },
    { hex: "#ffca28", label: "Gold" },
    { hex: "#7e57c2", label: "Grape" },
    { hex: "#1565c0", label: "Navy" },
    { hex: "#c62828", label: "Crimson" },
    { hex: "#2e7d32", label: "Forest" },
  ];

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function getBusColor(tripId) {
    const id = Number(tripId) || 0;
    const index = Math.abs(id) % BUS_COLOR_PALETTE.length;
    return { ...BUS_COLOR_PALETTE[index], index };
  }

  function colorDotHtml(hex, options = {}) {
    const large = options.large ? " bus-color-dot--lg" : "";
    const title = options.title ? ` title="${escapeHtml(options.title)}"` : "";
    return `<span class="bus-color-dot${large}" style="--bus-color:${hex}"${title} aria-hidden="true"></span>`;
  }

  function buildTripDescriptionHtml(trip, options = {}) {
    if (!trip) return "";
    const color = getBusColor(trip.id);
    const statusLine = options.statusLine || "";
    const busName =
      options.busName || trip.busName || trip.bus_name || "Bus";

    return `<div class="trip-desc">
      <div class="trip-desc-head">
        ${colorDotHtml(color.hex, { large: true })}
        <div>
          <div class="trip-desc-route">${escapeHtml(trip.route)}</div>
          <div class="trip-desc-sub">${escapeHtml(busName)}</div>
        </div>
      </div>
      <div class="trip-desc-grid">
        <div class="trip-desc-cell">
          <span class="trip-desc-label">Seats</span>
          <span class="trip-desc-value">${escapeHtml(trip.seatsAvailable)}</span>
          <span class="trip-desc-hint">Available</span>
        </div>
        <div class="trip-desc-cell">
          <span class="trip-desc-label">Departure</span>
          <span class="trip-desc-value">${escapeHtml(trip.departTime)}</span>
        </div>
        <div class="trip-desc-cell">
          <span class="trip-desc-label">Arrival</span>
          <span class="trip-desc-value">${escapeHtml(trip.arriveTime)}</span>
        </div>
        <div class="trip-desc-cell">
          <span class="trip-desc-label">Duration</span>
          <span class="trip-desc-value">${escapeHtml(trip.duration)}</span>
        </div>
      </div>
      ${
        statusLine
          ? `<p class="trip-desc-status">${escapeHtml(statusLine)}</p>`
          : ""
      }
    </div>`;
  }

  global.busTripColors = {
    BUS_COLOR_PALETTE,
    getBusColor,
    colorDotHtml,
    buildTripDescriptionHtml,
    escapeHtml,
  };
})(window);
