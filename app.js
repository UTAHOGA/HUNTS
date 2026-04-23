// ================================
// UOGA MAP CONTROLLER (CLEAN BUILD)
// ================================

let googleMap = null;
let cesiumViewer = null;

// --- GOOGLE INIT ---
function initGoogleMap() {
  if (googleMap) return;

  googleMap = new google.maps.Map(document.getElementById("map"), {
    center: { lat: 39.3, lng: -111.7 },
    zoom: 7,
    mapTypeId: "terrain",
    streetViewControl: false,
  });
}

// --- CESIUM INIT ---
function initCesium() {
  if (cesiumViewer) return;

  cesiumViewer = new Cesium.Viewer("globeMap", {
    terrainProvider: Cesium.createWorldTerrain(),
    animation: false,
    timeline: false,
  });
}

// --- MODE SWITCH ---
function applyMapMode() {
  const select = document.getElementById("mapTypeSelect");
  const value = (select?.value || "terrain").toLowerCase();

  const mapWrap = document.querySelector(".map-wrap");
  const dwrFrame = document.getElementById("dwrMapFrame");

  if (!mapWrap) return;

  // RESET EVERYTHING
  mapWrap.classList.remove("is-globe-mode");
  mapWrap.classList.remove("is-dwr-mode");

  if (dwrFrame) {
    dwrFrame.hidden = true;
  }

  // =================
  // GLOBE MODE
  // =================
  if (value === "globe") {
    initCesium();
    mapWrap.classList.add("is-globe-mode");
    return;
  }

  // =================
  // DWR MODE (IFRAME)
  // =================
  if (value === "dwr") {
    mapWrap.classList.add("is-dwr-mode");

    if (dwrFrame) {
      dwrFrame.hidden = false;

      if (!dwrFrame.src) {
        dwrFrame.src =
          "https://dwrapps.utah.gov/huntboundary/hbstart";
      }
    }

    return;
  }

  // =================
  // GOOGLE BASEMAPS
  // =================
  const validTypes = ["terrain", "roadmap", "hybrid", "satellite"];
  const mapType = validTypes.includes(value) ? value : "terrain";

  initGoogleMap();
  googleMap.setMapTypeId(mapType);
}

// --- INIT ---
window.addEventListener("load", () => {
  const select = document.getElementById("mapTypeSelect");

  if (select) {
    select.addEventListener("change", applyMapMode);
  }

  applyMapMode();
});