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

  function getGoogleGrid() {
    return document.getElementById('googleBasemapGrid');
  }

  function getGlobeGrid() {
    return document.getElementById('globeBasemapGrid');
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

  function isBackpackOpen() {
    // Backpack UI is injected by ui.js; it uses .uoga-backpack-shell.is-open when expanded.
    return !!document.querySelector('.uoga-backpack-shell.is-open');
  }

  function syncPanelVisibility() {
    // We want the basemap popup available for both Google and Globe.
    const panel = getBasemapPanel();
    if (!panel) return;
    const show = isGoogleMode() || isGlobeMode();
    const should = show ? 'false' : 'true';
    if (panel.getAttribute('aria-hidden') !== should) panel.setAttribute('aria-hidden', should);

    // Inline layout so other CSS can't push it offscreen when map mode changes.
    panel.style.position = 'fixed';
    panel.style.top = '160px';
    panel.style.zIndex = '2147482000';

    // If Hunt Backpack is open, don't let it cover the basemap panel.
    if (isBackpackOpen()) {
      panel.style.left = '24px';
      panel.style.right = 'auto';
    } else {
      panel.style.left = 'auto';
      panel.style.right = '24px';
    }

    // Keep a mode flag for optional CSS/debugging.
    panel.dataset.mapMode = isGoogleMode() ? 'google' : isGlobeMode() ? 'globe' : 'dwr';

    // Reduce confusion: highlight only the relevant grid.
    const googleGrid = getGoogleGrid();
    const globeGrid = getGlobeGrid();
    if (googleGrid) googleGrid.style.opacity = isGlobeMode() ? '0.45' : '1';
    if (globeGrid) globeGrid.style.opacity = isGoogleMode() ? '0.45' : '1';
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
    // If other scripts toggle the panel after this handler, re-assert on the next tick.
    window.setTimeout(syncPanelVisibility, 50);
    applyToGoogleMap();
  }

  function protectPanelFromOtherScripts() {
    const panel = getBasemapPanel();
    if (!panel || panel.__uogaBasemapProtected) return;
    panel.__uogaBasemapProtected = true;

    const obs = new MutationObserver(() => {
      // If another script hides it while it should be visible, immediately revert.
      const shouldShow = isGoogleMode() || isGlobeMode();
      if (!shouldShow) return;
      if (panel.getAttribute('aria-hidden') === 'true') {
        panel.setAttribute('aria-hidden', 'false');
      }
    });

    obs.observe(panel, { attributes: true, attributeFilter: ['aria-hidden', 'style', 'class'] });
  }

  function wrapApplyMapMode() {
    // Some code paths switch modes without firing <select> change.
    const fn = window.applyMapMode;
    if (typeof fn !== 'function' || fn.__uogaWrapped) return;
    function wrapped(...args) {
      const res = fn.apply(this, args);
      syncPanelVisibility();
      window.setTimeout(syncPanelVisibility, 0);
      return res;
    }
    wrapped.__uogaWrapped = true;
    window.applyMapMode = wrapped;
  }

  function init() {
    syncPanelVisibility();
    syncButtons();
    document.addEventListener('click', onClick, { passive: true });
    document.addEventListener('change', onChange, { passive: true });
    protectPanelFromOtherScripts();
    wrapApplyMapMode();

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
    // Give the rest of the page time to initialize its own UI, then re-assert.
    window.setTimeout(syncPanelVisibility, 250);
    window.setTimeout(syncPanelVisibility, 1000);
    // Backpack can open/close without triggering map change; keep position synced.
    window.setInterval(syncPanelVisibility, 500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
