// Cesium/globe mode has been intentionally retired.
// Keep this compatibility module so older imports do not crash while the app
// finishes moving to the Google Maps / Google Earth / Utah DWR map system.

let currentGlobeBasemap = 'terrain';

export function getViewer() { return null; }
export function getCurrentGlobeBasemap() { return currentGlobeBasemap; }
export function setCurrentGlobeBasemap(key) { currentGlobeBasemap = key || currentGlobeBasemap; }
export function syncGlobeBasemapButtons() {}
export function applyGlobeBasemap(key = currentGlobeBasemap) { currentGlobeBasemap = key || currentGlobeBasemap; }
export async function ensureCesiumHuntBoundaries() { return null; }
export async function ensureCesiumUtahOutline() { return null; }
export function getCesiumEntityOutlinePositions() { return null; }
export function getCesiumEntityMatches() { return []; }
export function focusCesiumBoundaryEntity() {}
export function updateCesiumBoundaryStyles() {}
export function ensureCesiumViewer() {}

export function fallbackToGlobeMode(reason = 'Google map unavailable.') {
  const mapTypeSelect = document.getElementById('mapTypeSelect');
  const mapWrap = document.querySelector('.map-wrap');
  if (mapTypeSelect && mapTypeSelect.value !== 'google') {
    mapTypeSelect.value = 'google';
    mapTypeSelect.dispatchEvent(new Event('change', { bubbles: true }));
  }
  if (mapWrap) mapWrap.classList.remove('is-globe-mode');
  if (typeof updateStatus === 'function') updateStatus(reason.replace(/globe/gi, 'Google map'));
}
