(() => {
  'use strict';
  const status = document.getElementById('offlineStatus');
  const settings = document.getElementById('settingsBtn');
  const mobileStart = document.getElementById('mobileStartBtn');
  const panel = document.querySelector('.control-panel');
  const openSettings = () => panel?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  settings?.addEventListener('click', openSettings);
  mobileStart?.addEventListener('click', () => document.getElementById('startBtn')?.click());
  document.addEventListener('click', event => {
    if (event.target.closest('#stageSetupBtn')) openSettings();
  });
  if (!('serviceWorker' in navigator)) {
    if (status) status.textContent = '在线试玩 · 本地记录';
    return;
  }
  navigator.serviceWorker.register('./sw.js')
    .then(() => navigator.serviceWorker.ready)
    .then(() => { if (status) status.textContent = '已可离线 · 本地记录'; })
    .catch(() => { if (status) status.textContent = '在线试玩 · 本地记录'; });
})();
