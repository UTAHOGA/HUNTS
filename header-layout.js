(() => {
  function moveNavStripIntoHeader() {
    const strip = document.querySelector('.page-nav-strip');
    const header = document.querySelector('header.topbar');
    if (!strip || !header) return;

    if (header.contains(strip)) return;

    const center = header.querySelector('.topbar-center');
    if (center) {
      center.insertBefore(strip, center.firstChild);
    } else {
      header.insertBefore(strip, header.firstChild);
    }
  }

  function init() {
    moveNavStripIntoHeader();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();

