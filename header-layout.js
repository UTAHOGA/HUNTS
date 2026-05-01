(() => {
  const DWR_MAP_URL = 'https://dwrapps.utah.gov/huntboundary/hbstart';
  const isBuilderPage = () => {
    const path = (window.location && window.location.pathname ? window.location.pathname : '').toLowerCase();
    return path.endsWith('/index.html') || path.endsWith('/builder.html') || path === '/' || path === '';
  };

  function bindPageNavControl(wrapper) {
    if (!wrapper || wrapper.__uogaPageNavBound) return;
    const toggle = wrapper.querySelector('.uoga-page-nav-toggle');
    const menu = wrapper.querySelector('.uoga-page-nav-menu');
    if (!toggle || !menu) return;
    wrapper.__uogaPageNavBound = true;

    const setMenuOpen = (isOpen) => {
      menu.hidden = !isOpen;
      menu.style.display = isOpen ? 'grid' : 'none';
      toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    };

    setMenuOpen(false);

    toggle.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      setMenuOpen(menu.hidden);
    });

    menu.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        setMenuOpen(false);
      });
    });

    document.addEventListener('click', event => {
      if (!wrapper.contains(event.target)) setMenuOpen(false);
    });

    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') setMenuOpen(false);
    });
  }

  function closeTopbarOverlays(exceptId = '') {
    const pageNavToggle = document.getElementById('pageNavToggleBtn');
    const pageNavMenu = document.querySelector('.uoga-page-nav-menu');
    if (exceptId !== 'pageNavToggleBtn' && pageNavMenu && pageNavToggle) {
      pageNavMenu.hidden = true;
      pageNavMenu.style.display = 'none';
      pageNavToggle.setAttribute('aria-expanded', 'false');
    }

    const mapModeToggle = document.getElementById('mapModeToggleBtn');
    const mapModeMenu = document.querySelector('.map-mode-menu');
    if (exceptId !== 'mapModeToggleBtn' && mapModeMenu && mapModeToggle) {
      mapModeMenu.hidden = true;
      mapModeToggle.setAttribute('aria-expanded', 'false');
    }

    const instructionsTab = document.getElementById('instructionsTab');
    const instructionsPanel = document.getElementById('instructionsPanel');
    if (exceptId !== 'instructionsTab' && instructionsTab && instructionsPanel) {
      instructionsPanel.hidden = true;
      instructionsTab.setAttribute('aria-expanded', 'false');
    }
  }

  function bindTopbarOverlayPriority() {
    if (document.body?.dataset.uogaOverlayPriorityBound) return;
    if (document.body) document.body.dataset.uogaOverlayPriorityBound = 'true';

    document.addEventListener('click', (event) => {
      const trigger = event.target?.closest?.('#mapModeToggleBtn, #pageNavToggleBtn, #instructionsTab');
      if (!trigger) return;
      closeTopbarOverlays(trigger.id);
    }, { capture: true });
  }

  function buildPageNavDropdown() {
    const strip = document.querySelector('.page-nav-strip');
    const header = document.querySelector('header.topbar');
    const existingWrapper = document.querySelector('[data-uoga-page-nav]');
    if (existingWrapper) {
      bindPageNavControl(existingWrapper);
      if (strip) strip.remove();
      return;
    }
    if (!strip || !header) return;
    const nav = strip.querySelector('.utility-nav');
    if (!nav) return;
    const links = Array.from(nav.querySelectorAll('a.utility-link'));
    if (!links.length) return;
    const active = links.find(link => link.classList.contains('active')) || links[0];
    const activeLabel = active?.textContent?.trim() || 'Builder';
    const wrapper = document.createElement('div');
    wrapper.className = 'uoga-page-nav-control';
    wrapper.setAttribute('data-uoga-page-nav', 'true');
    const toggleBtn = document.createElement('button');
    toggleBtn.id = 'pageNavToggleBtn';
    toggleBtn.className = 'uoga-page-nav-toggle';
    toggleBtn.type = 'button';
    toggleBtn.setAttribute('aria-expanded', 'false');

    const label = document.createElement('span');
    label.className = 'uoga-page-nav-label';
    const kicker = document.createElement('span');
    kicker.className = 'uoga-page-nav-kicker';
    kicker.textContent = 'Page Navigation';
    const current = document.createElement('span');
    current.className = 'uoga-page-nav-current-page';
    current.textContent = activeLabel;

    label.appendChild(kicker);
    label.appendChild(current);
    toggleBtn.appendChild(label);

    const menu = document.createElement('div');
    menu.className = 'uoga-page-nav-menu';
    menu.hidden = true;

    wrapper.appendChild(toggleBtn);
    wrapper.appendChild(menu);
    links.forEach(link => {
      const clone = link.cloneNode(true);
      clone.classList.add('uoga-page-nav-link');
      menu.appendChild(clone);
    });
    const host = header.querySelector('.topbar-left') || header;
    const mapControl = host.querySelector('.map-mode-control');
    if (mapControl && mapControl.parentElement === host) {
      mapControl.insertAdjacentElement('afterend', wrapper);
    } else {
      host.insertBefore(wrapper, host.firstChild);
    }
    strip.remove();
    bindPageNavControl(wrapper);
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
        display:flex !important;
        align-items:center !important;
        gap:14px !important;
        flex-wrap:wrap !important;
      }
      .topbar-title { display:none !important; }
      .topbar-title h1 { margin:0 !important; width:min(720px, 100%) !important; padding:8px 22px 9px !important; border:2px solid rgba(198,42,42,.95) !important; font-family:Georgia, "Times New Roman", serif !important; font-size:clamp(20px,2.15vw,31px) !important; line-height:1.02 !important; font-weight:900 !important; letter-spacing:.04em !important; text-transform:uppercase !important; color:#2b1c12 !important; background:rgba(255,253,248,.78) !important; text-shadow:0 1px 0 rgba(255,255,255,.9), 0 4px 12px rgba(92,55,24,.16) !important; box-shadow:0 8px 20px rgba(58,37,18,.10) !important; }
      .topbar-title h1::after { content:none !important; }
      .page-nav-strip { display:none !important; visibility:hidden !important; opacity:0 !important; background:transparent !important; border:0 !important; }
      .page-nav-case { display:flex !important; align-items:center !important; justify-content:center !important; width:100% !important; }
      .utility-nav { display:flex !important; align-items:center !important; justify-content:center !important; gap:12px !important; flex-wrap:wrap !important; }
      .utility-link,
      .map-mode-toggle,
      .map-mode-option,
      .uoga-page-nav-toggle,
      .uoga-page-nav-link,
      .ownership-dock .toggle-row,
      .ownership-dock .toggle-menu summary,
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
      .uoga-page-nav-link.active,
      .map-mode-option.is-active,
      .map-mode-toggle[aria-expanded="true"],
      .uoga-page-nav-toggle[aria-expanded="true"],
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
      .map-stage { position:relative !important; overflow:hidden !important; }
      #map, #googleEarth3dMap { position:absolute !important; inset:0 !important; width:100% !important; height:100% !important; min-height:100% !important; border:0 !important; }
      #dwrMapFrame {
        position:absolute !important;
        left:0 !important;
        right:0 !important;
        bottom:0 !important;
        top:-42px !important;
        width:100% !important;
        height:calc(100% + 42px) !important;
        min-height:calc(100% + 42px) !important;
        border:0 !important;
      }
      #googleEarth3dMap, #dwrMapFrame { background:#fffdf8 !important; z-index:2 !important; }
      .map-mode-native { position:absolute !important; width:1px !important; height:1px !important; opacity:0 !important; pointer-events:none !important; }
       .topbar-left { display:flex !important; align-items:center !important; justify-content:center !important; gap:14px !important; flex:0 0 auto !important; width:auto !important; min-width:0 !important; }
       .topbar-right {
         display:flex !important;
         align-items:center !important;
         justify-content:flex-end !important;
         flex:0 0 auto !important;
         margin-left:auto !important;
       }
       .uoga-page-nav-control,
       .map-mode-control { position:relative !important; display:flex !important; align-items:center !important; justify-content:center !important; }
       .uoga-page-nav-toggle,
       .map-mode-toggle { display:inline-flex !important; flex-direction:column !important; align-items:center !important; justify-content:center !important; gap:2px !important; width:224px !important; min-height:48px !important; padding:5px 14px !important; cursor:pointer !important; }
       .uoga-page-nav-label,
       .map-mode-label { font-size:10px !important; line-height:1 !important; color:#f07800 !important; white-space:nowrap !important; }
       .uoga-page-nav-current,
       .map-mode-current { display:inline-flex !important; align-items:center !important; justify-content:center !important; width:100% !important; min-width:0 !important; }
       .map-mode-logo--dwr-current { max-height:28px !important; max-width:190px !important; width:auto !important; height:auto !important; object-fit:contain !important; }
       .map-mode-option--icononly[data-map-mode-value=\"dwr\"] { min-height:42px !important; }
       .map-mode-option-logo--dwr { width:170px !important; height:34px !important; max-width:170px !important; max-height:34px !important; object-fit:contain !important; }
       .uoga-page-nav-label {
         display:inline-flex !important;
         flex-direction:column !important;
         align-items:center !important;
         justify-content:center !important;
         min-width:176px !important;
         min-height:38px !important;
         padding:0 18px !important;
         border-radius:999px !important;
         border:1px solid color-mix(in srgb, var(--accent) 52%, transparent) !important;
         background:radial-gradient(circle at top left, rgba(255,255,255,0.22), transparent 34%), linear-gradient(180deg, rgba(57, 44, 34, 0.92), rgba(28, 22, 17, 0.96)) !important;
         box-shadow:0 8px 18px rgba(0,0,0,0.28) !important;
         color:var(--accent) !important;
           font-size:15px !important;
         font-weight:900 !important;
         letter-spacing:.10em !important;
         text-transform:uppercase !important;
         line-height:1.02 !important;
         white-space:nowrap !important;
         text-align:center !important;
       }
       .uoga-page-nav-kicker,
       .uoga-page-nav-current-page { display:block !important; }
       .uoga-page-nav-current-page { color:#f4efe4 !important; font-size:12px !important; letter-spacing:.14em !important; margin-top:2px !important; }
       .uoga-page-nav-menu,
       .map-mode-menu { position:absolute !important; top:calc(100% + 8px) !important; left:50% !important; transform:translateX(-50%) !important; display:grid !important; grid-template-columns:1fr !important; gap:8px !important; z-index:10030 !important; min-width:224px !important; }
       .uoga-page-nav-menu[hidden] { display:none !important; }
       .map-mode-menu[hidden] { display:none !important; }
       .uoga-page-nav-menu { padding:12px !important; min-width:224px !important; }
       .uoga-page-nav-menu .utility-link,
       .uoga-page-nav-menu .uoga-page-nav-link { width:100% !important; min-height:42px !important; justify-content:center !important; }
       .map-mode-option-logo--dwr { width:170px !important; height:34px !important; max-width:170px !important; max-height:34px !important; object-fit:contain !important; }
        .instructions-tab {
          display:inline-flex !important;
          align-items:center !important;
          justify-content:center !important;
          min-height:42px !important;
          padding:8px 16px !important;
          border-radius:999px !important;
          border:1px solid #b45e00 !important;
          background:linear-gradient(180deg,#f28a12,#d66f00) !important;
          color:#2b1c12 !important;
          font-weight:900 !important;
          letter-spacing:.06em !important;
          text-transform:uppercase !important;
          box-shadow:inset 0 1px 0 rgba(255,236,214,.66), inset 0 -2px 3px rgba(62,33,6,.26), 0 6px 14px rgba(58,37,18,.20) !important;
          flex:0 0 auto !important;
        }
        .instructions-tab[aria-expanded=\"true\"],
        .instructions-tab:hover {
          border-color:#f7a142 !important;
          background:linear-gradient(180deg,#f7a142,#e07900) !important;
          box-shadow:inset 0 0 0 2px rgba(255,235,210,.42), 0 8px 18px rgba(58,37,18,.24) !important;
        }
        .instructions-panel {
          display:flex !important;
          flex:1 1 0 !important;
          min-width:0 !important;
          align-items:center !important;
          justify-content:flex-start !important;
          gap:10px 14px !important;
          flex-wrap:nowrap !important;
          overflow-x:auto !important;
        }
        .instructions-panel .qs-step {
          flex:0 0 auto !important;
        }
        .instructions-panel[hidden] { display:none !important; }
       .instructions-control {
         position:relative !important;
         display:flex !important;
         align-items:center !important;
         justify-content:center !important;
         flex:0 0 auto !important;
         order:-1 !important;
         margin-right:auto !important;
         margin-left:clamp(10px, calc((340px - 170px) / 2), 130px) !important;
       }
       .instructions-control .instructions-panel { position:absolute !important; top:calc(100% + 8px) !important; left:50% !important; transform:translateX(-50%) !important; display:grid !important; grid-template-columns:1fr !important; gap:8px !important; width:236px !important; max-width:calc(100vw - 28px) !important; padding:8px !important; border:1px solid #c9a27f !important; border-radius:16px !important; background:rgba(255,253,248,.98) !important; box-shadow:0 14px 34px rgba(58,37,18,.22) !important; z-index:10035 !important; }
       .instructions-control .instructions-panel[hidden] { display:none !important; }
       .instructions-control .qs-step { width:100% !important; max-width:none !important; flex:0 0 auto !important; padding:9px 10px !important; font-size:11px !important; font-weight:900 !important; }
       .ownership-dock { position:absolute !important; top:12px !important; right:14px !important; z-index:30 !important; display:flex !important; justify-content:flex-end !important; align-items:center !important; max-width:min(760px, calc(100% - 28px)) !important; transition:right 160ms ease, max-width 160ms ease !important; }
       .uoga-backpack-open .ownership-dock { right:min(458px, calc(100% - 320px)) !important; max-width:calc(100% - 486px) !important; }
       .ownership-case { display:flex !important; justify-content:flex-end !important; align-items:center !important; width:100% !important; }
       .ownership-dock .toggle-row { justify-content:flex-end !important; width:auto !important; max-width:100% !important; background:rgba(255,253,248,.94) !important; backdrop-filter:blur(10px) !important; -webkit-backdrop-filter:blur(10px) !important; }
       .ownership-dock .toggle-menu-panel { z-index:10040 !important; right:0 !important; left:auto !important; }
       .basemap-pop { position:absolute !important; top:68px !important; right:14px !important; z-index:31 !important; display:grid !important; justify-items:end !important; gap:8px !important; transition:right 160ms ease !important; }
       .basemap-pop[aria-hidden="true"] { display:none !important; }
       .uoga-backpack-open .basemap-pop { right:min(458px, calc(100% - 320px)) !important; }
       .basemap-pop .globe-basemap-panel { position:static !important; display:none !important; width:236px !important; padding:8px !important; }
       .basemap-pop[data-open="true"] .globe-basemap-panel { display:grid !important; gap:8px !important; }
       .basemap-pop .globe-basemap-grid { grid-template-columns:1fr !important; gap:8px !important; }
       .basemap-pop .globe-basemap-btn { min-height:36px !important; }
       .uoga-engine-control { display:flex !important; align-items:center !important; gap:8px !important; }
       .uoga-engine-label { font-size:10px !important; font-weight:900 !important; color:#f07800 !important; letter-spacing:.08em !important; text-transform:uppercase !important; }
       .uoga-engine-pill { min-height:40px !important; padding:0 16px !important; cursor:pointer !important; display:inline-flex !important; align-items:center !important; justify-content:center !important; gap:8px !important; }
      .uoga-engine-pill img { max-height:20px !important; max-width:110px !important; display:block !important; }
      @media (max-width: 1200px) {
        .topbar-left {
          display:flex !important;
          flex-wrap:wrap !important;
          justify-content:center !important;
          align-items:center !important;
          gap:12px !important;
        }
        .topbar-right { margin-left:auto !important; }
        .instructions-control {
          margin-left:0 !important;
          margin-right:auto !important;
          order:0 !important;
        }
      }
      @media (max-width: 900px) {
        .topbar-left {
          display:flex !important;
          flex-wrap:wrap !important;
          justify-content:center !important;
          align-items:center !important;
          gap:10px !important;
        }
        .instructions-control { margin:0 !important; order:0 !important; }
        .uoga-page-nav-control, .map-mode-control { width:auto !important; }
        .uoga-page-nav-toggle, .map-mode-toggle { width:min(224px, 86vw) !important; }
        .topbar-right {
          width:auto !important;
          justify-content:center !important;
          margin-left:0 !important;
        }
        .ownership-dock, .uoga-backpack-open .ownership-dock { left:12px !important; right:12px !important; max-width:none !important; justify-content:center !important; }
        .ownership-dock .toggle-row { overflow-x:auto !important; flex-wrap:nowrap !important; justify-content:flex-start !important; scrollbar-width:thin !important; }
        .basemap-pop, .uoga-backpack-open .basemap-pop { top:74px !important; right:12px !important; left:auto !important; }
      }
    `;
    document.head.appendChild(style);
  }

  function ensureFrames() {
    const stage = document.querySelector('.map-stage') || document.querySelector('.map-wrap');
    if (!stage) return {};
    let dwr = document.getElementById('dwrMapFrame');
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
    return { dwr };
  }

  function normalizeMapSelect() {
    if (!isBuilderPage()) return document.getElementById('mapTypeSelect');
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
    if (!isBuilderPage() || !select || document.querySelector('[data-uoga-engine-pills]') || document.querySelector('[data-map-mode-picker]')) return;
    const wrapper = document.createElement('div');
    wrapper.className = 'uoga-engine-control';
    wrapper.setAttribute('data-uoga-engine-pills', 'true');
    wrapper.innerHTML = `
      <span class="uoga-engine-label">Map Selector</span>
      <button type="button" class="uoga-engine-pill" data-engine="google"><img src="./assets/logos/google-maps-logo.png" alt="Google Maps"><span>Google</span></button>
      <button type="button" class="uoga-engine-pill" data-engine="earth"><img src="./assets/logos/google_earth_logo.png?v=20260430-map-selector-1" alt="Google Earth"><span>Earth</span></button>
      <button type="button" class="uoga-engine-pill" data-engine="dwr"><img src="./assets/logos/DWR-LOGO-maps.png?v=20260430-dwr-pill-1" alt="Utah DWR Map"><span>DWR Map</span></button>
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
    const { dwr } = ensureFrames();
    const next = ['google', 'earth', 'dwr'].includes(mode) ? mode : 'google';
    const didChange = !!select && select.value !== next;
    if (select) select.value = next;
    if (dwr && !dwr.src) dwr.src = DWR_MAP_URL;
    document.body.dataset.mapMode = next;
    if (didChange) {
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }
    document.querySelectorAll('[data-engine], [data-map-mode-value]').forEach(btn => {
      const v = btn.dataset.engine || btn.dataset.mapModeValue;
      btn.classList.toggle('is-active', v === next);
    });
  }

  function bindMapEngine() {
    const select = normalizeMapSelect();
    if (!select || !isBuilderPage()) return;
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
    buildPageNavDropdown();
    bindTopbarOverlayPriority();
    bindMapEngine();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
