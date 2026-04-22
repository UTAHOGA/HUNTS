(() => {
  function moveOwnershipControls() {
    const dock = document.getElementById('ownershipDock');
    const header = document.querySelector('header.topbar.topbar-planner');
    if (!dock || !header) return;

    const row = header.querySelector('.toggle-row');
    if (!row) return;

    // If already moved, don't do it again.
    if (dock.contains(row)) return;

    dock.appendChild(row);
  }

  function init() {
    moveOwnershipControls();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();

