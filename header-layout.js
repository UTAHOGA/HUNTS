(() => {
  const DWR_MAP_URL = 'https://dwrapps.utah.gov/huntboundary/hbstart';
  const GOOGLE_EARTH_URL = 'https://earth.google.com/web/@39.3209804,-111.0937311,1730290.51059961a,0d,35y,0h,0t,0r';

  function moveNavStripIntoHeader() {
    const strip = document.querySelector('.page-nav-strip');
    const header = document.querySelector('header.topbar');
    if (!strip || !header) return;
    if (header.contains(strip)) return;
    const center = header.querySelector('.topbar-center');
    if (center) center.insertBefore(strip, center.firstChild);
    else header.insertBefore(strip, header.firstChild);
  }

  function injectLightPillStyle() {
    if (document.getElementById('uoga-light-pill-system-fix')) return;
    const style = document.createElement('style');
    style.id = 'uoga-light-pill-system-fix';
    style.textContent = `
      :root, body, body.theme-dark {
        --bg:#f4efe4 !important;
        --panel:rgba(255,251,244,.96) !important;
        --panel2:#fffdf8 !important;
        --line:#c9a27f !important;
        --text:#2b1c12 !important;
        --muted:#6b5646 !important;
        --accent:#f07800 !important;
        --accent-dark:#d96700 !important;
        --selected-fill:#fff7ee !important;
        --selected-fill-dark:#ead8c4 !important;
        --selected-text:#2b1c12 !important;
        --selected-outline:#f07800 !important;
        --bg-image:none !important;
      }
      html, body {
        background-color:#f4efe4 !important;
        background-image:none !important;
        color:#2b1c12 !important;
      }
      .topbar, .topbar.topbar-planner {
        background:rgba(255,253,249,.94) !important;
        border-bottom:1px solid #c9a27f !important;
        box-shadow:0 8px 22px rgba(58,37,18,.14) !important;
        color:#2b1c12 !important;
      }
      .page-nav-strip { display:block !important; visibility:visible !important; opacity:1 !important; background:transparent !important; border:0 !important; }
      .page-nav-case { display:flex !important; align-items:center !important; justify-content:center !important; width:100% !important; }
      .utility-nav { display:flex !important; align-items:center !important; justify-content:center !important; gap:12px !important; flex-wrap:wrap !important; }
      .utility-link,
      .map-mode-toggle,
      .map-mode-option,
      .topbar .toggle-row,
      .topbar .toggle-menu summary,
      .basemap-toggle,
      .globe-basemap-btn,
      .uoga-engine-pill {
        border-radius:999px !important;
        border:1px solid #c9a27f !important;
        background:linear-gradient(180deg,#fffdf9,#f2e8dc) !important;
        color:#2b1c12 !important;
        font-weight:900 !important;
        letter-spacing:.06em !important;
        text-transform:uppercase !important;
        box-shadow:inset 0 1px 0 rgba(255,255,255,.95), inset 0 -2px 2px rgba(0,0,0,.08), 0 4px 10px rgba(58,37,18,.14) !important;
      }
      .utility-link.active,
      .map-mode-option.is-active,
      .map-mode-toggle[aria-expanded="true"],
      .uoga-engine-pill.is-active {
        border-color:#f07800 !important;
        background:linear-gradient(180deg,#fff7ee,#ead8c4) !important;
        box-shadow:inset 0 0 0 2px #f07800, 0 6px 14px rgba(58,37,18,.18) !important;
      }
      .sidebar, .rightbar, .panel, .panel-body, .rightbar-header, .hunt-card, .outfitter-card {
        background:rgba(255,251,244,.96) !important;
        color:#2b1c12 !important;
        border-color:#c9a27f !important;
      }
      .panel h2 {
        background:linear-gradient(180deg,#f07800,#d96700) !important;
        color:#fff8f1 !important;
      }
      .hunt-input, .hunt-select, select, input {
        background:#fffdf8 !important;
        color:#2b1c12 !important;
        border-color:#c9a27f !important;
      }
      .helper, .empty-note, .hunt-card-meta, .map-chooser-meta { color:#6b5646 !important; }
      .map-stage { position:relative !important; }
      #map, #googleEarthFrame, #dwrMapFrame { position:absolute !important; inset:0 !important; width:100% !important; height:100% !important; min-height:100% !important; border:0 !important; }
      #googleEarthFrame, #dwrMapFrame { background:#fffdf8 !important; z-index:2 !important; }
      .map-mode-native { position:absolute !important; width:1px !important; height:1px !important; opacity:0 !important; pointer-events:none !important; }
      .uoga-engine-control { display:flex !important; align-items:center !important; gap:8px !important; }
      .uoga-engine-label { font-size:10px !important; font-weight:900 !important; color:#f07800 !important; letter-spacing:.08em !important; text-transform:uppercase !important; }
      .uoga-engine-pill { min-height:40px !important; padding:0 16px !important; cursor:pointer !important; display:inline-flex !important; align-items:center !important; justify-content:center !important; gap:8px !important; }
      .uoga-engine-pill img { max-height:20px !important; max-width:110px !important; display:block !important; }
    `;
    document.head.appendChild(style);
  }

  function ensureFrames() {
    const stage = document.querySelector('.map-stage') || document.querySelector('.map-wrap');
    if (!stage) return {};
    let earth = document.getElementById('googleEarthFrame');
    let dwr = document.getElementById('dwrMapFrame');
    if (!earth) {
      earth = document.createElement('iframe');
      earth.id = 'googleEarthFrame';
      earth.className = 'google-earth-frame';
      earth.title = 'Google Earth';
      earth.loading = 'lazy';
      earth.allow = 'geolocation; fullscreen';
      earth.referrerPolicy = 'no-referrer-when-downgrade';
      earth.hidden = true;
      stage.appendChild(earth);
    }
    if (!dwr) {
      dwr = document.createElement('iframe');
      dwr.id = 'dwrMapFrame';
      dwr.className = 'dwr-map-frame';
      dwr.title = 'Utah DWR Hunt Boundary Map';
      dwr.loading = 'lazy';
      dwr.allow = 'geolocation';
      dwr.referrerPolicy = 'no-referrer-when-downgrade';
      dwr.hidden = true;
      stage.appendChild(dwr);
    }
    return { earth, dwr };
  }

  function normalizeMapSelect() {
    let select = document.getElementById('mapTypeSelect');
    if (!select) {
      select = document.createElement('select');
      select.id = 'mapTypeSelect';
      select.className = 'map-mode-native';
      select.setAttribute('aria-hidden', 'true');
      select.tabIndex = -1;
      document.body.appendChild(select);
    }
    const hasEngineValues = Array.from(select.options || []).some(opt => ['google', 'earth', 'dwr'].includes(opt.value));
    if (!hasEngineValues) {
      select.innerHTML = '<option value="google" selected>Google Maps</option><option value="earth">Google Earth</option><option value="dwr">DWR Map</option>';
    }
    if (!['google', 'earth', 'dwr'].includes(select.value)) select.value = 'google';
    select.classList.add('map-mode-native');
    return select;
  }

  function ensureVisibleEnginePills(select) {
    if (!select || document.querySelector('[data-uoga-engine-pills]') || document.querySelector('[data-map-mode-picker]')) return;
    const wrapper = document.createElement('div');
    wrapper.className = 'uoga-engine-control';
    wrapper.setAttribute('data-uoga-engine-pills', 'true');
    wrapper.innerHTML = `
      <span class="uoga-engine-label">Map Selector</span>
      <button type="button" class="uoga-engine-pill" data-engine="google"><img src="./assets/logos/google-maps-logo.png" alt="Google Maps"><span>Google</span></button>
      <button type="button" class="uoga-engine-pill" data-engine="earth"><img src="./assets/logos/google_earth_logo.png" alt="Google Earth"><span>Earth</span></button>
      <button type="button" class="uoga-engine-pill" data-engine="dwr"><span>DWR Map</span></button>
    `;
    const oldGroup = select.closest('.control-group');
    const host = document.querySelector('.topbar-left') || document.querySelector('.topbar') || document.body;
    if (oldGroup) oldGroup.replaceWith(wrapper);
    else host.insertBefore(wrapper, host.firstChild);
    wrapper.appendChild(select);
    wrapper.querySelectorAll('[data-engine]').forEach(btn => {
      btn.addEventListener('click', () => {
        select.value = btn.dataset.engine;
        select.dispatchEvent(new Event('change', { bubbles:true }));
      });
    });
  }

  function setMode(mode) {
    const select = normalizeMapSelect();
    const map = document.getElementById('map');
    const { earth, dwr } = ensureFrames();
    const next = ['google', 'earth', 'dwr'].includes(mode) ? mode : 'google';
    if (select && select.value !== next) select.value = next;
    if (earth && !earth.src) earth.src = GOOGLE_EARTH_URL;
    if (dwr && !dwr.src) dwr.src = DWR_MAP_URL;
    if (map) map.hidden = next !== 'google';
    if (earth) earth.hidden = next !== 'earth';
    if (dwr) dwr.hidden = next !== 'dwr';
    document.body.dataset.mapMode = next;
    document.querySelectorAll('[data-engine], [data-map-mode-value]').forEach(btn => {
      const v = btn.dataset.engine || btn.dataset.mapModeValue;
      btn.classList.toggle('is-active', v === next);
    });
    const status = document.getElementById('status');
    if (status) status.textContent = next === 'earth' ? 'Google Earth active.' : next === 'dwr' ? 'Utah DWR map active.' : 'Google map active.';
  }

  function bindMapEngine() {
    const select = normalizeMapSelect();
    if (!select) return;
    ensureFrames();
    ensureVisibleEnginePills(select);
    select.addEventListener('change', () => window.setTimeout(() => setMode(select.value), 0));
    document.addEventListener('click', event => {
      const btn = event.target.closest?.('[data-map-mode-value]');
      if (!btn) return;
      window.setTimeout(() => setMode(btn.dataset.mapModeValue), 0);
    });
    setMode(select.value || 'google');
  }

  function init() {
    injectLightPillStyle();
    moveNavStripIntoHeader();
    bindMapEngine();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
