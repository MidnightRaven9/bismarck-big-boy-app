/* A service-worker update can reload the first document after it is ready. */
window.BigBoyStartup = (() => {
  const key = 'bb_skip_startup_once';
  let timeout;
  try {
    if (sessionStorage.getItem(key) === '1') {
      sessionStorage.removeItem(key);
      document.documentElement.classList.add('skip-startup');
    }
  } catch (error) {
    // The splash still times out if storage is blocked.
  }

  function finish() {
    const overlay = document.getElementById('startup');
    if (!overlay || overlay.classList.contains('startup-leaving')) return;
    clearTimeout(timeout);
    if (!overlay.querySelector('img').naturalWidth || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      overlay.remove();
      return;
    }
    overlay.classList.add('startup-leaving');
    setTimeout(() => overlay.remove(), 160);
  }

  document.addEventListener('DOMContentLoaded', () => {
    const overlay = document.getElementById('startup');
    if (document.documentElement.classList.contains('skip-startup')) {
      overlay?.remove();
      return;
    }
    const logo = overlay?.querySelector('img');
    if (!logo || overlay.classList.contains('startup-leaving')) return;
    if (logo.complete && !logo.naturalWidth) {
      finish();
      return;
    }
    logo.addEventListener('error', finish, { once:true });
    timeout = setTimeout(finish, 1800);
    document.addEventListener('pointerdown', finish, { once:true });
    document.addEventListener('keydown', finish, { once:true });
  }, { once:true });

  return {
    finish,
    skipNextReload() {
      try { sessionStorage.setItem(key, '1'); } catch (error) {}
    }
  };
})();
