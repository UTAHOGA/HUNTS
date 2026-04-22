(() => {
  const STORAGE_KEY = 'uoga_google_basemap_type_v1';
  const DEFAULT_TYPE = 'terrain';

  const VALID_TYPES = new Set(['roadmap', 'terrain', 'hybrid', 'satellite']);

  function getMapTypeSelect() {
    return document.getElementById('mapTypeSelect');
  }

  function getBasemapPanel() {
    return document.getElementById('globeBasemapPanel');
  }

  function readPreferredType() {
    const raw = (localStorage.getItem(STORAGE_KEY) || '').trim();
    return VALID_TYPES.has(raw) ? raw : DEFAULT_TYPE;
  }

  function writePreferredType(nextType) {
    if (!VALID_TYPES.has(nextType)) return;
    localStorage.setItem(STORAGE_KEY, nextType);
  }

  function isGoogleMode() {
    const sel = getMapTypeSelect();
    return (sel && sel.value === 'google') || false;
  }

  function isGlobeMode() {
    const sel = getMapTypeSelect();
    return (sel && sel.value === 'globe') || false;
  }

  function syncPanelVisibility() {
    // We want the basemap popup available for both Google and Globe.
    const panel = getBasemapPanel();
    if (!panel) return;
    const show = isGoogleMode() || isGlobeMode();
    panel.setAttribute('aria-hidden', show ? 'false' : 'true');
    // Some pages/styles also gate visibility via display; keep it in sync.
    panel.style.display = show ? '' : 'none';
  }

  function applyToGoogleMap() {
    if (!isGoogleMode()) return;
    const preferred = readPreferredType();
    const map = window.googleBaselineMap;
    if (map && typeof map.setMapTypeId === 'function') {
      map.setMapTypeId(preferred);
    }
  }

  function syncButtons() {
    const preferred = readPreferredType();
    document.querySelectorAll('#googleBasemapGrid [data-google-basemap]').forEach((btn) => {
      const t = btn.getAttribute('data-google-basemap');
      const active = t === preferred;
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }

  function onClick(e) {
    const btn = e.target && e.target.closest ? e.target.closest('[data-google-basemap]') : null;
    if (!btn) return;
    const nextType = btn.getAttribute('data-google-basemap');
    if (!VALID_TYPES.has(nextType)) return;
    writePreferredType(nextType);
    syncButtons();
    applyToGoogleMap();
  }

  function onChange(e) {
    if (!e.target || e.target.id !== 'mapTypeSelect') return;
    // When the user returns to Google mode, re-apply their preferred basemap.
    syncPanelVisibility();
    applyToGoogleMap();
  }

  function init() {
    syncPanelVisibility();
    syncButtons();
    document.addEventListener('click', onClick, { passive: true });
    document.addEventListener('change', onChange, { passive: true });

    // Google map loads async; apply preference once it's available.
    let tries = 0;
    const t = window.setInterval(() => {
      tries += 1;
      if (window.googleBaselineMap) {
        window.clearInterval(t);
        applyToGoogleMap();
        return;
      }
      if (tries > 60) window.clearInterval(t);
    }, 250);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
