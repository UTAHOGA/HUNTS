(() => {
  const STORAGE_KEY = 'uoga_google_basemap_type_v2';
  const DEFAULT_TYPE = 'terrain';
  const VALID_TYPES = new Set(['roadmap', 'terrain', 'hybrid', 'satellite']);

  const CROP_BASEMAP_PANEL_ON_SELECT = true;

  function getMapTypeSelect() {
    return document.getElementById('mapTypeSelect');
  }

  function getPopover() {
    return document.getElementById('basemapPopover');
  }

  function getToggleBtn() {
    return document.getElementById('basemapToggleBtn');
  }

  function getPanel() {
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

  function shouldShowPopover() {
    return isGoogleMode() || isGlobeMode();
  }

  function applyToGoogleMap() {
    if (!isGoogleMode()) return;
    const preferred = readPreferredType();
    const map = window.googleBaselineMap;
    if (map && typeof map.setMapTypeId === 'function') {
      map.setMapTypeId(preferred);
    }
  }

  function syncGoogleButtons() {
    const preferred = readPreferredType();
    document.querySelectorAll('#googleBasemapGrid [data-google-basemap]').forEach((btn) => {
      const t = btn.getAttribute('data-google-basemap');
      const active = t === preferred;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }

  function setPanelOpen(nextOpen) {
    const popover = getPopover();
    const btn = getToggleBtn();
    const panel = getPanel();
    const open = !!nextOpen;

    if (btn) btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (panel) panel.setAttribute('aria-hidden', open ? 'false' : 'true');
    if (popover) popover.dataset.open = open ? 'true' : 'false';
  }

  function isPanelOpen() {
    const btn = getToggleBtn();
    return btn ? btn.getAttribute('aria-expanded') === 'true' : false;
  }

  function closePanel() {
    setPanelOpen(false);
  }

  function syncModeVisibility() {
    const popover = getPopover();
    if (!popover) return;
    const show = shouldShowPopover();
    popover.setAttribute('aria-hidden', show ? 'false' : 'true');
    if (!show) closePanel();

    const panel = getPanel();
    if (panel) {
      panel.dataset.mapMode = isGoogleMode() ? 'google' : isGlobeMode() ? 'globe' : 'dwr';
    }

    // Reduce confusion: dim the irrelevant grid.
    const googleGrid = document.getElementById('googleBasemapGrid');
    const globeGrid = document.getElementById('globeBasemapGrid');
    if (googleGrid) googleGrid.style.opacity = isGlobeMode() ? '0.45' : '1';
    if (globeGrid) globeGrid.style.opacity = isGoogleMode() ? '0.45' : '1';
  }

  function onToggleClick(e) {
    e.preventDefault();
    e.stopPropagation();
    setPanelOpen(!isPanelOpen());
  }

  function onDocClick(e) {
    if (!isPanelOpen()) return;
    const popover = getPopover();
    if (!popover) return;
    if (!popover.contains(e.target)) closePanel();
  }

  function onKeyDown(e) {
    if (e.key !== 'Escape') return;
    if (!isPanelOpen()) return;
    closePanel();
  }

  function onBasemapClick(e) {
    const googleBtn = e.target && e.target.closest ? e.target.closest('[data-google-basemap]') : null;
    if (googleBtn) {
      const nextType = googleBtn.getAttribute('data-google-basemap');
      if (!VALID_TYPES.has(nextType)) return;
      writePreferredType(nextType);
      syncGoogleButtons();
      applyToGoogleMap();
      if (CROP_BASEMAP_PANEL_ON_SELECT) closePanel();
      return;
    }

    const globeBtn = e.target && e.target.closest ? e.target.closest('[data-globe-basemap]') : null;
    if (globeBtn) {
      // app.js owns applying globe basemap; we just auto-collapse for cleanliness.
      if (CROP_BASEMAP_PANEL_ON_SELECT) {
        window.setTimeout(closePanel, 0);
      }
    }
  }

  function onMapTypeChange(e) {
    if (!e.target || e.target.id !== 'mapTypeSelect') return;
    syncModeVisibility();
    // When the user returns to Google mode, re-apply their preferred basemap.
    applyToGoogleMap();
  }

  function wrapApplyMapMode() {
    // Some code paths switch modes without firing <select> change.
    const fn = window.applyMapMode;
    if (typeof fn !== 'function' || fn.__uogaWrapped) return;
    function wrapped(...args) {
      const res = fn.apply(this, args);
      syncModeVisibility();
      // Let other scripts finish their own mode toggles, then re-assert.
      window.setTimeout(syncModeVisibility, 0);
      return res;
    }
    wrapped.__uogaWrapped = true;
    window.applyMapMode = wrapped;
  }

  function init() {
    const btn = getToggleBtn();
    if (btn) btn.addEventListener('click', onToggleClick);

    syncGoogleButtons();
    syncModeVisibility();
    wrapApplyMapMode();

    document.addEventListener('click', onBasemapClick, { passive: true });
    document.addEventListener('click', onDocClick, { passive: true });
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('change', onMapTypeChange, { passive: true });

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

