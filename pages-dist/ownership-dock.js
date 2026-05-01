(() => {
  function moveOwnershipControls() {
    const dock = document.getElementById('ownershipDock');
    if (!dock) return;

    const target = dock.querySelector('.ownership-case') || dock;
    const row = dock.querySelector('.toggle-row') || document.querySelector('header.topbar.topbar-planner .toggle-row');
    if (!row) return;

    // If already moved, don't do it again.
    if (target.contains(row)) return;

    target.appendChild(row);
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
