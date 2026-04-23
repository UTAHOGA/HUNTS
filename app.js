// === SIMPLE MAP MODE CONTROLLER (CLEAN) ===

let googleMap = null;
let cesiumViewer = null;

function initGoogleMap() {
  if (googleMap) return;

  googleMap = new google.maps.Map(document.getElementById("map"), {
    center: { lat: 39.3, lng: -111.7 },
    zoom: 7,
    mapTypeId: "terrain",
  });
}

function initCesium() {
  if (cesiumViewer) return;

  cesiumViewer = new Cesium.Viewer("globeMap", {
    terrainProvider: Cesium.createWorldTerrain(),
  });
}

function applyMapMode() {
  const value = document.getElementById("mapTypeSelect").value;
  const mapWrap = document.querySelector(".map-wrap");
  const dwrFrame = document.getElementById("dwrMapFrame");

  // RESET
  mapWrap.classList.remove("is-globe-mode");
  mapWrap.classList.remove("is-dwr-mode");
  dwrFrame.hidden = true;

  // === GLOBE ===
  if (value === "globe") {
    initCesium();
    mapWrap.classList.add("is-globe-mode");
    return;
  }

  // === DWR ===
  if (value === "dwr") {
    mapWrap.classList.add("is-dwr-mode");
    dwrFrame.hidden = false;

    if (!dwrFrame.src) {
      dwrFrame.src = "https://dwrapps.utah.gov/huntboundary/hbstart";
    }

    return;
  }

  // === GOOGLE (4 VALID TYPES ONLY) ===
  const valid = ["terrain", "roadmap", "hybrid", "satellite"];
  const mapType = valid.includes(value) ? value : "terrain";

  initGoogleMap();
  googleMap.setMapTypeId(mapType);
}

// === INIT ===
window.addEventListener("load", () => {
  const select = document.getElementById("mapTypeSelect");

  if (select) {
    select.addEventListener("change", applyMapMode);
  }

  applyMapMode(); // default load
});