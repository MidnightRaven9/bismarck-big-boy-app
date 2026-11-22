/* A service-worker update can reload the first document after it is ready. */
window.BigBoyStartup = (() => {
  const key = 'bb_skip_startup_once';
  let timeout;
  let failed = false;

  try {
    if (sessionStorage.getItem(key) === '1') {
      sessionStorage.removeItem(key);
      document.documentElement.classList.add('startup-reload');
    }
  } catch (error) {
    // Startup also works when session storage is unavailable.
  }

  function fail() {
    const overlay = document.getElementById('startup');
    if (!overlay || failed) return;
    failed = true;
    clearTimeout(timeout);
    overlay.classList.add('startup-failed');
  }

  function finish() {
    const overlay = document.getElementById('startup');
    if (!overlay || failed) return;
    clearTimeout(timeout);
    // Let the initialized screen paint under the splash before revealing it.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (matchMedia('(prefers-reduced-motion: reduce)').matches ||
          document.documentElement.classList.contains('startup-reload')) {
        overlay.remove();
        return;
      }
      overlay.classList.add('startup-leaving');
      overlay.addEventListener('animationend', event => {
        if (event.target === overlay) overlay.remove();
      });
    }));
  }

  document.addEventListener('DOMContentLoaded', () => {
    const overlay = document.getElementById('startup');
    const logo = overlay.querySelector('img');
    logo.decode().then(() => overlay.classList.add('startup-logo-ready'), () => {});
    overlay.classList.add('startup-running');
    timeout = setTimeout(fail, 10000);
  }, { once:true });

  return {
    fail,
    finish,
    skipNextReload() {
      try { sessionStorage.setItem(key, '1'); } catch (error) {}
    }
  };
})();
