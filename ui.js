window.UOGA_UI = (() => {
  function initThemeToggle() {
    const themeToggleBtn = document.getElementById('themeToggleBtn');
    if (!themeToggleBtn) return;

    themeToggleBtn.addEventListener('click', () => {
      document.body.classList.toggle('theme-dark');
      const isDark = document.body.classList.contains('theme-dark');
      themeToggleBtn.textContent = isDark ? 'Light Mode' : 'Dark Mode';
    });
  }

  function initShell() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initThemeToggle, { once: true });
      return;
    }
    initThemeToggle();
  }

  return {
    initShell,
    initThemeToggle
  };
})();

window.UOGA_UI.initShell();
