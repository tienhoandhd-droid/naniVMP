/* Same appearance preference as VMP main.tsx / Layout.tsx. No account data. */
(() => {
  const root = document.documentElement;
  root.dataset.visual = 'lotus-pearl';
  const system = matchMedia('(prefers-color-scheme: dark)');
  const apply = () => {
    try {
      const saved = localStorage.getItem('vmp-theme');
      root.dataset.theme = saved === 'light' || saved === 'dark' ? saved : system.matches ? 'dark' : 'light';
    } catch { root.dataset.theme = 'light'; }
  };
  apply();
  system.addEventListener('change', apply);
  addEventListener('storage', event => { if (event.key === 'vmp-theme' || event.key === null) apply(); });
})();
