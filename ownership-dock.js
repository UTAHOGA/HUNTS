(() => {
  function closeAllOwnershipMenus() {
    document.querySelectorAll('#ownershipDock details.toggle-menu[open]').forEach((detailsEl) => {
      detailsEl.open = false;
    });
  }

  function bindOwnershipMenuBehavior(dock) {
    if (!dock || dock.dataset.ownershipBound === 'true') return;
    dock.dataset.ownershipBound = 'true';

    const menus = Array.from(dock.querySelectorAll('details.toggle-menu'));
    menus.forEach((menu) => {
      menu.addEventListener('toggle', () => {
        if (!menu.open) return;
        menus.forEach((other) => {
          if (other !== menu) other.open = false;
        });
      });
    });

    document.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (!dock.contains(target)) closeAllOwnershipMenus();
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeAllOwnershipMenus();
    });
  }

  function moveOwnershipDockToHeader() {
    const dock = document.getElementById('ownershipDock');
    if (!dock) return;

    const huntUnits = document.getElementById('toggleDwrUnits');
    if (huntUnits && !huntUnits.checked) {
      huntUnits.checked = true;
      huntUnits.dispatchEvent(new Event('change', { bubbles: true }));
    }

    const topbarLeft = document.querySelector('header.topbar.topbar-planner .topbar-left');
    if (!topbarLeft) return;

    const anchor = topbarLeft.querySelector('.uoga-page-nav-control')
      || topbarLeft.querySelector('.instructions-control');
    if (anchor && dock.parentElement !== topbarLeft) {
      topbarLeft.insertBefore(dock, anchor);
    } else if (!anchor && dock.parentElement !== topbarLeft) {
      topbarLeft.appendChild(dock);
    }

    dock.classList.add('ownership-dock--header-mounted');
    bindOwnershipMenuBehavior(dock);
  }

  function init() {
    moveOwnershipDockToHeader();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
