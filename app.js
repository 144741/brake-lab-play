(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const ui = {
    stage: $('gameCanvas'), resultChart: $('resultChart'), stageCenter: $('stageCenter'), stageTag: $('stageTag'),
    sceneChip: $('sceneChip'), surfaceChip: $('surfaceChip'), timeValue: $('timeValue'), timerLabel: $('timerLabel'),
    distanceLabel: $('distanceLabel'), distanceValue: $('distanceValue'), speedValue: $('speedValue'),
    forceValue: $('forceValue'), forceFill: $('forceFill'), forceState: $('forceState'), progressFill: $('progressFill'),
    forecastPill: $('forecastPill'), forecastValue: $('forecastValue'), brakeBtn: $('brakeBtn'), startBtn: $('startBtn'),
    pauseBtn: $('pauseBtn'), soundBtn: $('soundBtn'), soundLabel: $('soundLabel'), modeHint: $('modeHint'),
    bestScore: $('bestScore'), totalRuns: $('totalRuns'), initialSpeed: $('initialSpeed'), brakeDistance: $('brakeDistance'),
    historyList: $('historyList'), exportBtn: $('exportBtn'), clearBtn: $('clearBtn'),
    resultModal: $('resultModal'), resultIcon: $('resultIcon'), resultTitle: $('resultTitle'), resultMessage: $('resultMessage'),
    resultScore: $('resultScore'), resultInitial: $('resultInitial'), resultTime: $('resultTime'),
    resultDistance: $('resultDistance'), resultForce: $('resultForce'), announcer: $('announcer')
  };

  const MODE = {
    classic: { name: '极限挑战', distance: 2597.3, hint: '超过 100 km/h 才能制动。踏板力度达到 1612 N 即失败；路障前停住，按初速度² ÷ 刹停用时计分。' },
    precision: { name: '精准停车', distance: 1850, target: 1500, zone: 70, hint: '在距起点 1500 m 附近的 70 m 目标区停车。踏板过猛仍会断裂；停车越接近中心，得分越高。' },
    practice: { name: '自由练习', distance: 2597.3, hint: '可提前观察预计停车点，踏板力度不会断裂。练习成绩单独记录，不与极限挑战混排。' }
  };
  const SCENE = { dusk: '晚霞', day: '晴昼', night: '夜行' };
  const SURFACE = { dry: '干燥路面', wet: '湿滑路面' };
  const STORAGE_KEY = 'brakelab-offline-v1';
  const DT = 1 / 120;
  const MAX_FORCE = 1612;
  let config = { mode: 'classic', scene: 'dusk', surface: 'dry' };
  let records = loadRecords();
  let run = makeRun('ready');
  let lastFrame = 0;
  let accumulator = 0;
  let previewTime = 0;
  let brakeInput = false;
  let soundOn = false;
  let audioContext = null;
  let modalOpen = false;
  const ctx = ui.stage.getContext('2d', { alpha: false });

  function makeRun(phase) {
    return { phase, prevPhase: '', countdown: 3, speed: 0, distance: 0, brakeStartDistance: 0,
      initialSpeed: 0, brakeTime: 0, force: 0, peakForce: 0, hold: 0, samples: [], sampleClock: 0,
      result: null, alert: '', config: { ...config } };
  }
  function loadRecords() {
    try { const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); return Array.isArray(parsed) ? parsed.filter(v => v && typeof v === 'object').slice(0, 50) : []; }
    catch { return []; }
  }
  function saveRecords() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(records)); } catch { /* private browsing can disable storage */ } }
  function label(text) { ui.announcer.textContent = text; }
  function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }
  function fmt(n, digits = 0) { return Number(n).toLocaleString('zh-CN', { minimumFractionDigits: digits, maximumFractionDigits: digits }); }

  function setSelected(group, value) {
    const selector = group === 'mode' ? '[data-mode]' : group === 'scene' ? '[data-scene]' : '[data-surface]';
    for (const button of document.querySelectorAll(selector)) {
      const active = button.dataset[group] === value;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    }
    config[group] = value;
    document.body.dataset.scene = config.scene;
    document.body.dataset.surface = config.surface;
    ui.modeHint.textContent = MODE[config.mode].hint;
    ui.stageTag.textContent = `待命 · ${MODE[config.mode].name}`;
    ui.sceneChip.textContent = SCENE[config.scene];
    ui.surfaceChip.textContent = SURFACE[config.surface];
    ui.distanceLabel.textContent = config.mode === 'precision' ? '距目标中心' : '距路障';
    ui.distanceValue.innerHTML = `${fmt(config.mode === 'precision' ? MODE.precision.target : MODE[config.mode].distance)}<span>m</span>`;
    ui.forecastPill.hidden = config.mode !== 'practice';
    updateRecords();
  }
  function controlsLocked(locked) {
    document.body.classList.toggle('game-active', locked);
    for (const b of document.querySelectorAll('[data-mode], [data-scene], [data-surface]')) b.disabled = locked;
    ui.startBtn.disabled = locked;
    ui.pauseBtn.disabled = !locked;
  }
  function beep(freq = 650, duration = .08, type = 'sine') {
    if (!soundOn) return;
    try {
      audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
      if (audioContext.state === 'suspended') audioContext.resume();
      const osc = audioContext.createOscillator(); const gain = audioContext.createGain();
      osc.type = type; osc.frequency.value = freq; gain.gain.value = .0001;
      osc.connect(gain); gain.connect(audioContext.destination);
      const t = audioContext.currentTime;
      gain.gain.exponentialRampToValueAtTime(.09, t + .01);
      gain.gain.exponentialRampToValueAtTime(.0001, t + duration);
      osc.start(t); osc.stop(t + duration + .015);
    } catch { soundOn = false; syncSound(); }
  }
  function syncSound() { ui.soundLabel.textContent = soundOn ? '开' : '关'; ui.soundBtn.setAttribute('aria-label', `音效：${soundOn ? '开' : '关'}`); ui.soundBtn.setAttribute('aria-pressed', String(soundOn)); }

  function startGame() {
    closeResult();
    ui.stage.closest('.stage').scrollIntoView({ behavior: 'smooth', block: 'start' });
    run = makeRun('countdown');
    brakeInput = false; accumulator = 0;
    controlsLocked(true);
    ui.stageCenter.classList.remove('is-hidden');
    ui.brakeBtn.disabled = true;
    ui.forecastPill.hidden = config.mode !== 'practice';
    ui.initialSpeed.textContent = '—'; ui.brakeDistance.textContent = '—';
    ui.stageTag.textContent = `倒计时 · ${MODE[config.mode].name}`;
    ui.timerLabel.textContent = '比赛计时';
    ui.pauseBtn.textContent = '暂停 P';
    label('倒计时开始。'); beep(530, .1);
  }
  function setBrake(pressed) {
    if (!pressed) { brakeInput = false; ui.brakeBtn.classList.remove('is-pressed'); return; }
    if (modalOpen || run.phase === 'paused') return;
    if (run.phase !== 'accelerating' && run.phase !== 'braking') return;
    if (run.phase === 'accelerating' && run.speed * 3.6 < 100) return;
    brakeInput = true; ui.brakeBtn.classList.add('is-pressed');
  }
  function pauseGame() {
    if (run.phase === 'paused') {
      run.phase = run.prevPhase; run.prevPhase = '';
      ui.pauseBtn.textContent = '暂停 P';
      ui.stageCenter.classList.add('is-hidden');
      ui.brakeBtn.disabled = run.phase === 'countdown' || (run.phase === 'accelerating' && run.speed * 3.6 < 100);
      label('继续比赛。');
    } else if (['countdown', 'accelerating', 'braking'].includes(run.phase)) {
      run.prevPhase = run.phase; run.phase = 'paused'; setBrake(false);
      ui.pauseBtn.textContent = '继续 P'; ui.brakeBtn.disabled = true;
      setCenter('已暂停', '按 P 或右上角按钮继续', 'Ⅱ'); label('比赛已暂停。');
    }
  }
  function setCenter(title, subtitle = '', icon = '✦') {
    const setupAction = run.phase === 'ready' && (document.body.classList.contains('web-app') || document.body.classList.contains('native-app'))
      ? '<button type="button" class="stage-setup" id="stageSetupBtn">选择玩法 ↗</button>' : '';
    const markup = `<span class="center-cross" aria-hidden="true">${icon}</span><strong>${title}</strong><small>${subtitle}</small>${setupAction}`;
    if (ui.stageCenter.innerHTML !== markup) ui.stageCenter.innerHTML = markup;
    ui.stageCenter.classList.remove('is-hidden');
  }
  function step(dt) {
    if (run.phase === 'countdown') {
      const previous = Math.ceil(run.countdown);
      run.countdown -= dt;
      const next = Math.ceil(run.countdown);
      if (next !== previous && next > 0) beep(590 + (3 - next) * 100, .09);
      if (run.countdown <= 0) { run.phase = 'accelerating'; run.countdown = 0; beep(870, .16); label('车辆开始加速。'); }
      return;
    }
    if (run.phase !== 'accelerating' && run.phase !== 'braking') return;
    if (run.phase === 'accelerating') {
      if (brakeInput && run.speed * 3.6 >= 100) {
        run.phase = 'braking'; run.initialSpeed = run.speed * 3.6; run.brakeStartDistance = run.distance;
        ui.initialSpeed.textContent = `${fmt(run.initialSpeed, 1)} km/h`;
        beep(270, .12, 'sawtooth'); label(`开始制动，初速度${fmt(run.initialSpeed, 1)}公里每小时。`);
      } else {
        const ratio = Math.min(run.speed / (260 / 3.6), 1);
        run.speed = Math.min(260 / 3.6, run.speed + 7.4 * (1 - ratio ** 1.55) * dt);
        run.distance += run.speed * dt;
      }
    }
    if (run.phase === 'braking') {
      if (brakeInput) {
        run.hold += dt;
        run.force += (200 + 800 * run.hold) * dt;
        if (run.config.mode === 'practice') run.force = Math.min(1600, run.force);
      } else {
        run.hold = 0;
        run.force = Math.max(0, run.force - 900 * dt);
      }
      if (run.config.mode !== 'practice') run.force = Math.min(run.force, MAX_FORCE);
      run.peakForce = Math.max(run.peakForce, run.force);
      if (run.force >= MAX_FORCE && run.config.mode !== 'practice') { finish(false, 'pedal'); return; }
      const grip = run.config.surface === 'wet' ? .72 : 1;
      const decel = .15 + .00022 * run.speed * run.speed + (10.8 / MAX_FORCE) * run.force * grip;
      run.speed = Math.max(0, run.speed - decel * dt);
      run.distance += run.speed * dt;
      run.brakeTime += dt;
      run.sampleClock += dt;
      if (run.sampleClock >= .08) {
        run.samples.push({ t: run.brakeTime, speed: run.speed * 3.6, force: run.force });
        run.sampleClock = 0;
      }
      if (run.speed <= .08) { run.speed = 0; finish(true, 'stopped'); return; }
    }
    if (run.distance >= MODE[run.config.mode].distance) { finish(false, 'barrier'); }
  }
  function finish(stopped, cause) {
    if (run.result) return;
    setBrake(false);
    const mode = run.config.mode;
    const distance = run.initialSpeed > 0 ? Math.max(0, run.distance - run.brakeStartDistance) : 0;
    const error = Math.abs(run.distance - MODE.precision.target);
    let success = stopped;
    let reason = '挑战完成';
    let message = '在路障前安全刹停，继续挑战更高初速度。';
    if (cause === 'pedal') { success = false; reason = '踏板断裂'; message = '踏板力度达到 1612 N。可以短踩、松开，再逐步加力。'; }
    else if (cause === 'barrier') { success = false; reason = '撞上路障'; message = '没有及时刹停。试试更早踩下并保持合理力度。'; }
    else if (mode === 'precision' && error > MODE.precision.zone / 2) { success = false; reason = run.distance < MODE.precision.target ? '停得太早' : '冲过目标'; message = `距目标中心 ${fmt(error, 1)} m；停在彩色区域内才能得分。`; }
    else if (mode === 'precision') { message = `距目标中心仅 ${fmt(error, 1)} m，表现很稳。`; }
    else if (mode === 'practice') { message = '练习完成。看一下曲线，再试试正式挑战。'; }
    const score = !success ? 0 : mode === 'precision' ? Math.max(1, Math.round(1300 - error * 20 + run.initialSpeed)) : Math.round(run.initialSpeed ** 2 / Math.max(.1, run.brakeTime));
    run.result = { success, cause, reason, message, score, mode, scene: run.config.scene, surface: run.config.surface,
      initialSpeed: run.initialSpeed, brakeTime: run.brakeTime, brakeDistance: distance, peakForce: run.peakForce,
      stoppedAt: run.distance, date: new Date().toISOString(), samples: run.samples.slice() };
    run.phase = success ? 'stopped' : 'failed';
    ui.brakeBtn.disabled = true;
    controlsLocked(false);
    ui.stageTag.textContent = `${success ? '完成' : '失败'} · ${MODE[mode].name}`;
    ui.brakeDistance.textContent = `${fmt(distance, 1)} m`;
    records.unshift({ ...run.result, samples: undefined }); records = records.slice(0, 50); saveRecords(); updateRecords();
    if (success) beep(880, .24); else { beep(190, .28, 'sawtooth'); if (navigator.vibrate) navigator.vibrate(90); }
    label(`${reason}。得分${score}。`);
    showResult(run.result);
  }
  function showResult(result) {
    modalOpen = true;
    ui.resultIcon.textContent = result.success ? '✓' : '!'; ui.resultIcon.classList.toggle('failed', !result.success);
    ui.resultTitle.textContent = result.reason; ui.resultMessage.textContent = result.message;
    ui.resultScore.textContent = fmt(result.score); ui.resultInitial.textContent = `${fmt(result.initialSpeed, 1)} km/h`;
    ui.resultTime.textContent = `${fmt(result.brakeTime, 3)} s`;
    ui.resultDistance.textContent = `${fmt(result.brakeDistance, 1)} m`;
    ui.resultForce.textContent = `${fmt(result.peakForce)} N`;
    ui.resultModal.hidden = false; drawChart(result.samples); $('retryBtn').focus();
  }
  function closeResult() { modalOpen = false; ui.resultModal.hidden = true; }
  function updateRecords() {
    const modeRecords = records.filter(r => r.mode === config.mode);
    const best = modeRecords.filter(r => r.success).reduce((m, r) => Math.max(m, Number(r.score) || 0), 0);
    ui.bestScore.textContent = best ? fmt(best) : '—'; ui.totalRuns.textContent = fmt(records.length);
    ui.historyList.replaceChildren();
    if (records.length === 0) { const p = document.createElement('p'); p.className = 'empty-history'; p.textContent = '还没有记录，完成第一次挑战吧。'; ui.historyList.append(p); return; }
    for (const r of records.slice(0, 4)) {
      const row = document.createElement('div'); row.className = 'history-row';
      const left = document.createElement('span'); left.textContent = `${MODE[r.mode]?.name || '挑战'} · ${Number(r.initialSpeed || 0).toFixed(1)} km/h`;
      const right = document.createElement('span'); right.className = r.success ? 'pass' : 'fail'; right.textContent = r.success ? `${fmt(r.score)} 分` : '未完成';
      row.append(left, right); ui.historyList.append(row);
    }
  }
  function exportCSV() {
    if (!records.length) { label('当前没有可以导出的成绩。'); return; }
    const heads = ['日期', '模式', '场景', '路面', '结果', '得分', '初速度km/h', '刹停用时s', '制动距离m', '最大踏板力N'];
    const q = v => `"${String(v ?? '').replaceAll('"', '""')}"`;
    const lines = [heads.map(q).join(','), ...records.map(r => [r.date, MODE[r.mode]?.name || r.mode, SCENE[r.scene] || r.scene, SURFACE[r.surface] || r.surface, r.reason, r.score, Number(r.initialSpeed || 0).toFixed(1), Number(r.brakeTime || 0).toFixed(3), Number(r.brakeDistance || 0).toFixed(1), Number(r.peakForce || 0).toFixed(0)].map(q).join(','))];
    const csv = '\ufeff' + lines.join('\r\n');
    if (window.webkit?.messageHandlers?.exportCSV) {
      window.webkit.messageHandlers.exportCSV.postMessage(csv);
      return;
    }
    if (window.BrakeLabAndroid?.exportCSV) {
      window.BrakeLabAndroid.exportCSV(csv);
      return;
    }
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = '刹车实验场_成绩.csv'; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    label('成绩已导出为 CSV 文件。');
  }
  function estimatedStop() {
    if (run.phase !== 'braking' || run.force < 60) return null;
    const grip = run.config.surface === 'wet' ? .72 : 1;
    const decel = Math.max(.3, .15 + .00022 * run.speed ** 2 + (10.8 / MAX_FORCE) * run.force * grip);
    return run.distance + run.speed ** 2 / (2 * decel);
  }
  function updateUI() {
    const active = ['countdown', 'accelerating', 'braking', 'paused'].includes(run.phase);
    if (document.body.dataset.phase !== run.phase) document.body.dataset.phase = run.phase;
    const kmh = run.speed * 3.6;
    ui.speedValue.textContent = fmt(kmh);
    ui.forceValue.textContent = fmt(run.force);
    ui.forceFill.style.width = `${clamp(run.force / MAX_FORCE * 100, 0, 100)}%`;
    ui.forceState.textContent = brakeInput ? '制动力上升中' : run.force > 1 ? '松开 · 制动力回落' : '松开踏板';
    ui.timeValue.innerHTML = `${fmt(run.brakeTime, 3)}<span>s</span>`;
    const m = MODE[run.config.mode];
    const left = run.config.mode === 'precision' ? m.target - run.distance : m.distance - run.distance;
    ui.distanceValue.innerHTML = `${fmt(run.config.mode === 'precision' ? left : Math.max(0, left))}<span>m</span>`;
    ui.progressFill.style.width = `${clamp(run.distance / m.distance * 100, 0, 100)}%`;
    ui.brakeBtn.disabled = !active || run.phase === 'paused' || run.phase === 'countdown' || (run.phase === 'accelerating' && kmh < 100);
    if (run.config.mode === 'practice' && active) {
      const stop = estimatedStop(); ui.forecastPill.hidden = false;
      ui.forecastValue.textContent = stop === null ? '制动后显示' : `${fmt(m.distance - stop)} m 距路障`;
    } else ui.forecastPill.hidden = true;
    if (run.phase === 'ready') setCenter('准备好了吗？', '选择模式，然后开始挑战');
    if (run.phase === 'countdown') setCenter(String(Math.max(1, Math.ceil(run.countdown))), '自动加速即将开始', '●');
    if (run.phase === 'accelerating') {
      if (kmh >= 100) { ui.stageCenter.classList.add('is-hidden'); ui.stageTag.textContent = '刹车已解锁 · 判断时机'; }
      else { setCenter('加速中', '达到 100 km/h 后刹车解锁', '↗'); ui.stageTag.textContent = '加速中 · 100 km/h 解锁刹车'; }
    }
    if (run.phase === 'braking') { ui.stageCenter.classList.add('is-hidden'); ui.stageTag.textContent = '制动中 · 注意踏板力度'; }
    if (run.phase === 'failed' || run.phase === 'stopped') ui.stageCenter.classList.add('is-hidden');
  }

  function drawChart(samples) {
    const c = ui.resultChart, x = c.getContext('2d'); const W = c.width, H = c.height;
    x.clearRect(0, 0, W, H); x.fillStyle = '#07181d'; x.fillRect(0, 0, W, H);
    x.strokeStyle = 'rgba(255,255,255,.09)'; x.lineWidth = 1;
    for (let i = 1; i < 4; i++) { const y = i * H / 4; x.beginPath(); x.moveTo(12, y); x.lineTo(W - 12, y); x.stroke(); }
    if (!samples || samples.length < 2) return;
    const maxT = Math.max(samples.at(-1).t, 1), maxSpeed = Math.max(100, ...samples.map(v => v.speed));
    const line = (color, value) => { x.beginPath(); x.lineWidth = 2.5; x.strokeStyle = color; samples.forEach((v, i) => { const px = 13 + v.t / maxT * (W - 26); const py = H - 10 - value(v) * (H - 20); i ? x.lineTo(px, py) : x.moveTo(px, py); }); x.stroke(); };
    line('#c7fa69', v => v.speed / maxSpeed); line('#ffbf86', v => v.force / MAX_FORCE);
    x.fillStyle = '#c7fa69'; x.fillRect(W - 139, 10, 10, 2); x.fillStyle = '#d4e7db'; x.font = '10px sans-serif'; x.fillText('车速', W - 124, 14);
    x.fillStyle = '#ffbf86'; x.fillRect(W - 76, 10, 10, 2); x.fillStyle = '#d4e7db'; x.fillText('踏板力', W - 61, 14);
  }

  // All visuals are constructed from Canvas primitives; no network images or fonts are loaded.
  function drawScene(time) {
    if (document.body.classList.contains('web-app')) return;
    const c = ui.stage, bounds = c.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = Math.max(1, Math.round(bounds.width)), H = Math.max(1, Math.round(bounds.height));
    if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const scene = run.config.scene;
    const palettes = {
      dusk: { skyTop: '#173543', skyMid: '#b97166', skyLow: '#f6a266', land: '#383941', land2: '#304048', road: '#28343a', shoulder: '#535254', stripe: '#eee9d4' },
      day: { skyTop: '#578cac', skyMid: '#bdd6dc', skyLow: '#f7d6a7', land: '#56727c', land2: '#42636c', road: '#3d4b50', shoulder: '#697474', stripe: '#f9f5df' },
      night: { skyTop: '#071327', skyMid: '#142841', skyLow: '#3c5a68', land: '#1a2b3b', land2: '#182936', road: '#202b35', shoulder: '#394653', stripe: '#c8e5df' }
    };
    const p = palettes[scene];
    const sky = ctx.createLinearGradient(0, 0, 0, H * .68); sky.addColorStop(0, p.skyTop); sky.addColorStop(.6, p.skyMid); sky.addColorStop(1, p.skyLow);
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
    const horizon = H * .38, cx = W * .5;
    if (scene === 'night') {
      ctx.fillStyle = 'rgba(232,249,245,.7)';
      for (let i = 0; i < 42; i++) { const x = (Math.sin(i * 91.13) * 9891.33 % 1 + 1) % 1 * W; const y = ((Math.sin(i * 17.81) * 7482.44 % 1 + 1) % 1) * horizon * .8; const r = i % 5 === 0 ? 1.5 : .7; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); }
    } else {
      const sx = W * .21, sy = H * (scene === 'dusk' ? .33 : .22), radius = scene === 'dusk' ? 35 : 25;
      const glow = ctx.createRadialGradient(sx, sy, 2, sx, sy, radius * 5); glow.addColorStop(0, scene === 'dusk' ? 'rgba(255,230,168,.8)' : 'rgba(255,252,213,.9)'); glow.addColorStop(1, 'rgba(255,238,170,0)');
      ctx.fillStyle = glow; ctx.fillRect(sx - radius * 5, sy - radius * 5, radius * 10, radius * 10);
      ctx.fillStyle = scene === 'dusk' ? '#ffe0af' : '#fff5ce'; ctx.beginPath(); ctx.arc(sx, sy, radius, 0, 7); ctx.fill();
    }
    // Layered mountains and skyline keep the scene readable without external assets.
    for (let layer = 0; layer < 3; layer++) {
      ctx.fillStyle = [p.land, p.land2, scene === 'night' ? '#172731' : '#34434a'][layer]; ctx.beginPath(); ctx.moveTo(0, horizon + 31 + layer * 16);
      for (let x = 0; x <= W + 25; x += 23) { const t = x / W; const wave = Math.sin(t * 12 + layer * 2) * (20 - layer * 4) + Math.sin(t * 27 + layer * 7) * 7; ctx.lineTo(x, horizon + 17 + layer * 17 + wave); }
      ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.fill();
    }
    const vanY = horizon + 5, baseY = H + 20;
    const roadWidth = y => W * (.08 + .89 * ((y - vanY) / (baseY - vanY)) ** 1.16);
    const leftAt = y => cx - roadWidth(y) / 2, rightAt = y => cx + roadWidth(y) / 2;
    ctx.fillStyle = p.shoulder; ctx.beginPath(); ctx.moveTo(cx - 16, vanY); ctx.lineTo(cx + 16, vanY); ctx.lineTo(W * 1.02, baseY); ctx.lineTo(-W * .02, baseY); ctx.fill();
    ctx.fillStyle = p.road; ctx.beginPath(); ctx.moveTo(cx - 8, vanY); ctx.lineTo(cx + 8, vanY); ctx.lineTo(rightAt(baseY), baseY); ctx.lineTo(leftAt(baseY), baseY); ctx.fill();
    const proj = z => { const s = 1 / (1 + Math.max(0, z) / 48); const y = vanY + (baseY - vanY) * s; return { y, s, left: leftAt(y), right: rightAt(y) }; };
    const travel = run.distance + (run.phase === 'ready' ? time * 9 : 0);
    // Roadside posts and lane markings move toward the camera as distance grows.
    for (let z = 580 - (travel % 70); z > 0; z -= 70) {
      const q = proj(z), size = Math.max(1, q.s * 22);
      ctx.fillStyle = scene === 'night' ? '#b7e2da' : '#f0e0c5';
      for (const side of [-1, 1]) { const x = side < 0 ? q.left - 5 - q.s * 10 : q.right + 5 + q.s * 10; ctx.fillRect(x, q.y - size, Math.max(1.5, q.s * 4), size); ctx.fillStyle = scene === 'night' ? '#ffe6a1' : '#eed9ab'; ctx.fillRect(x - q.s * 3, q.y - size, Math.max(3, q.s * 10), Math.max(2, q.s * 4)); }
    }
    ctx.lineCap = 'round';
    for (let z = 460 - (travel % 22); z > 0; z -= 22) {
      const a = proj(z + 9), b = proj(z); ctx.strokeStyle = p.stripe; ctx.globalAlpha = .55 + b.s * .35; ctx.lineWidth = Math.max(1, b.s * 4);
      for (const fraction of [1 / 3, 2 / 3]) { ctx.beginPath(); ctx.moveTo(a.left + (a.right - a.left) * fraction, a.y); ctx.lineTo(b.left + (b.right - b.left) * fraction, b.y); ctx.stroke(); }
    }
    ctx.globalAlpha = 1;
    // Target zone in precision mode; barrier in every mode.
    if (run.config.mode === 'precision') {
      const target = MODE.precision.target, zoneHalf = MODE.precision.zone / 2;
      for (let i = 0; i < 6; i++) {
        const world = target - zoneHalf + i * MODE.precision.zone / 6;
        const z0 = world - run.distance, z1 = z0 + MODE.precision.zone / 6;
        if (z1 > 0 && z0 < 700) { const a = proj(Math.max(0, z0)), b = proj(Math.max(0, z1)); ctx.fillStyle = i % 2 ? 'rgba(199,250,105,.35)' : 'rgba(246,248,224,.38)'; ctx.beginPath(); ctx.moveTo(a.left, a.y); ctx.lineTo(a.right, a.y); ctx.lineTo(b.right, b.y); ctx.lineTo(b.left, b.y); ctx.fill(); }
      }
    }
    const remain = MODE[run.config.mode].distance - run.distance;
    if (remain > 0 && remain < 880) {
      const q = proj(remain), yh = Math.max(3, q.s * 64);
      ctx.fillStyle = '#e97f62'; ctx.fillRect(q.left, q.y - yh, q.right - q.left, Math.max(2, yh * .22));
      ctx.fillStyle = '#f8c78c'; for (let i = 0; i < 9; i++) { const x = q.left + (q.right - q.left) * i / 9; ctx.fillRect(x, q.y - yh, Math.max(2, (q.right - q.left) / 17), Math.max(2, yh * .22)); }
      ctx.fillStyle = '#172326'; ctx.fillRect(q.left + 3, q.y - yh * .78, Math.max(3, q.s * 10), yh * .9); ctx.fillRect(q.right - Math.max(10, q.s * 10), q.y - yh * .78, Math.max(3, q.s * 10), yh * .9);
      if (q.s > .13) { ctx.fillStyle = '#fff2dc'; ctx.font = `bold ${Math.max(10, q.s * 32)}px system-ui`; ctx.textAlign = 'center'; ctx.fillText('STOP', cx, q.y - yh - 10); }
    }
    if (run.config.surface === 'wet') {
      const reflection = ctx.createLinearGradient(0, vanY, 0, H); reflection.addColorStop(0, 'rgba(151,203,209,.07)'); reflection.addColorStop(1, 'rgba(184,222,229,.17)');
      ctx.fillStyle = reflection; ctx.beginPath(); ctx.moveTo(cx - 8, vanY); ctx.lineTo(cx + 8, vanY); ctx.lineTo(rightAt(baseY), baseY); ctx.lineTo(leftAt(baseY), baseY); ctx.fill();
      ctx.strokeStyle = 'rgba(229,242,228,.22)'; ctx.lineWidth = 1;
      for (let i = 0; i < 25; i++) { const x = (Math.sin(i * 61.4 + time * .7) * 7021.8 % 1 + 1) % 1 * W; const y = H * (.48 + ((Math.sin(i * 13) * 799.9 % 1 + 1) % 1) * .5); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 10, y + 15); ctx.stroke(); }
    }
    drawCar(ctx, W, H, time, scene);
  }
  function drawCar(c, W, H, time, scene) {
    const sway = run.phase === 'ready' ? Math.sin(time * .7) * 2 : Math.sin(run.distance * .065) * Math.min(3, run.speed * .1);
    const x = W * .5 + sway, y = H * .745, scale = clamp(W / 920, .54, 1.12);
    c.save(); c.translate(x, y); c.scale(scale, scale);
    c.fillStyle = 'rgba(0,0,0,.33)'; c.beginPath(); c.ellipse(0, 48, 128, 30, 0, 0, 7); c.fill();
    c.fillStyle = '#0a1116'; c.fillRect(-110, 16, 19, 50); c.fillRect(91, 16, 19, 50);
    const body = c.createLinearGradient(-110, -63, 110, 67); body.addColorStop(0, '#d6dfd0'); body.addColorStop(.48, '#849aa0'); body.addColorStop(1, '#283942');
    c.fillStyle = body; c.beginPath(); c.moveTo(-84, -80); c.lineTo(84, -80); c.quadraticCurveTo(107, -56, 112, -20); c.lineTo(111, 37); c.quadraticCurveTo(103, 62, 79, 63); c.lineTo(-79, 63); c.quadraticCurveTo(-104, 61, -112, 37); c.lineTo(-112, -20); c.quadraticCurveTo(-106, -56, -84, -80); c.fill();
    c.strokeStyle = 'rgba(237,251,242,.45)'; c.lineWidth = 2; c.stroke();
    c.fillStyle = scene === 'night' ? '#0b1b2c' : '#253942'; c.beginPath(); c.moveTo(-72, -70); c.lineTo(72, -70); c.lineTo(88, -19); c.lineTo(-88, -19); c.closePath(); c.fill();
    c.fillStyle = '#193039'; c.fillRect(-93, -7, 186, 39);
    c.fillStyle = '#101e23'; c.fillRect(-103, 32, 206, 18);
    const glow = c.createLinearGradient(-95, 0, 95, 0); glow.addColorStop(0, '#fc5f62'); glow.addColorStop(.5, '#ffaba0'); glow.addColorStop(1, '#fc5f62');
    c.fillStyle = glow; c.shadowColor = '#ff6a60'; c.shadowBlur = 16; c.fillRect(-95, 2, 190, 7); c.shadowBlur = 0;
    c.fillStyle = run.phase === 'braking' ? '#fae6dc' : '#f47068'; c.fillRect(-103, 5, 9, 27); c.fillRect(94, 5, 9, 27);
    c.fillStyle = '#061116'; c.fillRect(-25, 34, 50, 16); c.fillStyle = '#c7fa69'; c.font = 'bold 9px system-ui'; c.textAlign = 'center'; c.fillText('BRAKE/LAB', 0, 45);
    c.restore();
  }
  function frame(timestamp) {
    const elapsed = lastFrame ? Math.min((timestamp - lastFrame) / 1000, .05) : 0;
    lastFrame = timestamp; previewTime += elapsed;
    if (run.phase !== 'paused') { accumulator = Math.min(accumulator + elapsed, .1); let n = 0; while (accumulator >= DT && n++ < 12) { step(DT); accumulator -= DT; } }
    updateUI(); drawScene(previewTime); requestAnimationFrame(frame);
  }

  document.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => { if (b.disabled) return; setSelected('mode', b.dataset.mode); run = makeRun('ready'); }));
  document.querySelectorAll('[data-scene]').forEach(b => b.addEventListener('click', () => { if (b.disabled) return; setSelected('scene', b.dataset.scene); run = makeRun('ready'); }));
  document.querySelectorAll('[data-surface]').forEach(b => b.addEventListener('click', () => { if (b.disabled) return; setSelected('surface', b.dataset.surface); run = makeRun('ready'); }));
  ui.startBtn.addEventListener('click', startGame); ui.pauseBtn.addEventListener('click', pauseGame);
  ui.soundBtn.addEventListener('click', () => { soundOn = !soundOn; syncSound(); if (soundOn) beep(760, .12); });
  ui.brakeBtn.addEventListener('pointerdown', e => { e.preventDefault(); if (ui.brakeBtn.disabled) return; ui.brakeBtn.setPointerCapture?.(e.pointerId); setBrake(true); });
  ui.brakeBtn.addEventListener('pointerup', () => setBrake(false)); ui.brakeBtn.addEventListener('pointercancel', () => setBrake(false));
  window.addEventListener('pointerup', () => setBrake(false)); window.addEventListener('blur', () => { setBrake(false); if (['countdown', 'accelerating', 'braking'].includes(run.phase)) pauseGame(); });
  window.addEventListener('keydown', e => {
    if (e.code === 'Space') { if (document.activeElement?.tagName !== 'BUTTON') e.preventDefault(); if (!e.repeat) setBrake(true); }
    else if (e.code === 'KeyP' || e.code === 'Escape') { e.preventDefault(); pauseGame(); }
    else if (e.code === 'KeyR') { e.preventDefault(); startGame(); }
    else if (e.code === 'KeyM') { soundOn = !soundOn; syncSound(); }
  });
  window.addEventListener('keyup', e => { if (e.code === 'Space') setBrake(false); });
  $('retryBtn').addEventListener('click', startGame);
  $('closeResultBtn').addEventListener('click', closeResult); $('resultCloseBtn').addEventListener('click', closeResult);
  ui.exportBtn.addEventListener('click', exportCSV);
  ui.clearBtn.addEventListener('click', () => { if (!records.length) return; if (window.confirm('确定清空这台设备保存的全部成绩吗？此操作无法撤销。')) { records = []; saveRecords(); updateRecords(); label('全部本地成绩已清空。'); } });

  setSelected('mode', 'classic'); syncSound(); controlsLocked(false); requestAnimationFrame(frame);
})();
