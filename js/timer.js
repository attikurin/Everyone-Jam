/* =========================================
   みんなのジャム - 簡易タイマー
   グループワーク・課題タイムの計測用
   ========================================= */

(function () {
  const STATE = {
    remainingMs: 5 * 60 * 1000,  // 既定5分
    totalMs: 5 * 60 * 1000,
    running: false,
    intervalId: null,
    endsAt: 0,
  };

  const PRESETS = [
    { label: '1分', ms: 60 * 1000 },
    { label: '3分', ms: 3 * 60 * 1000 },
    { label: '5分', ms: 5 * 60 * 1000 },
    { label: '10分', ms: 10 * 60 * 1000 },
    { label: '15分', ms: 15 * 60 * 1000 },
    { label: '30分', ms: 30 * 60 * 1000 },
  ];

  let panel = null;
  let visible = false;

  function buildPanel() {
    panel = document.createElement('div');
    panel.id = 'timer-panel';
    panel.className = 'timer-panel hidden';
    panel.innerHTML = `
      <div class="timer-header" id="timer-drag-handle">
        <i class="fa-solid fa-stopwatch text-orange-400"></i>
        <span class="font-bold text-sm">タイマー</span>
        <button id="timer-close" class="ml-auto text-gray-400 hover:text-gray-700" title="閉じる">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>
      <div class="timer-display" id="timer-display">05:00</div>
      <div class="timer-progress-wrap">
        <div class="timer-progress" id="timer-progress"></div>
      </div>
      <div class="timer-presets">
        ${PRESETS.map(p => `<button class="timer-preset" data-ms="${p.ms}">${p.label}</button>`).join('')}
      </div>
      <div class="timer-edit">
        <label class="text-[11px] text-gray-500 mr-1">分</label>
        <input id="timer-min" type="number" min="0" max="180" value="5" class="timer-input" />
        <label class="text-[11px] text-gray-500 mx-1">秒</label>
        <input id="timer-sec" type="number" min="0" max="59" value="0" class="timer-input" />
        <button id="timer-set" class="timer-mini-btn">設定</button>
      </div>
      <div class="timer-actions">
        <button id="timer-start" class="timer-btn timer-btn-start">
          <i class="fa-solid fa-play mr-1"></i>スタート
        </button>
        <button id="timer-reset" class="timer-btn timer-btn-reset">
          <i class="fa-solid fa-rotate-left mr-1"></i>リセット
        </button>
      </div>
      <div class="timer-tip text-[10px] text-gray-400 mt-2 text-center">
        ⏰ 0になるとアラームが鳴ります
      </div>
    `;
    document.body.appendChild(panel);

    // ドラッグで移動
    setupDrag();

    // ボタンハンドラ
    document.getElementById('timer-close').addEventListener('click', () => hide());
    document.getElementById('timer-start').addEventListener('click', toggleStart);
    document.getElementById('timer-reset').addEventListener('click', reset);
    document.getElementById('timer-set').addEventListener('click', setFromInputs);
    panel.querySelectorAll('.timer-preset').forEach(btn => {
      btn.addEventListener('click', () => {
        const ms = parseInt(btn.dataset.ms, 10);
        STATE.totalMs = ms;
        STATE.remainingMs = ms;
        stopInterval();
        STATE.running = false;
        updateDisplay();
        updateButtons();
      });
    });
  }

  function setupDrag() {
    const handle = document.getElementById('timer-drag-handle');
    let startX, startY, origX, origY, dragging = false;
    handle.style.cursor = 'move';
    handle.addEventListener('mousedown', (e) => {
      dragging = true;
      startX = e.clientX;
      startY = e.clientY;
      const rect = panel.getBoundingClientRect();
      origX = rect.left;
      origY = rect.top;
      e.preventDefault();
    });
    document.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      const nx = Math.max(8, Math.min(window.innerWidth - panel.offsetWidth - 8, origX + dx));
      const ny = Math.max(8, Math.min(window.innerHeight - panel.offsetHeight - 8, origY + dy));
      panel.style.left = nx + 'px';
      panel.style.top = ny + 'px';
      panel.style.right = 'auto';
      panel.style.bottom = 'auto';
    });
    document.addEventListener('mouseup', () => { dragging = false; });
  }

  function show() {
    if (!panel) buildPanel();
    panel.classList.remove('hidden');
    visible = true;
    updateDisplay();
    updateButtons();
  }
  function hide() {
    if (!panel) return;
    panel.classList.add('hidden');
    visible = false;
  }
  function toggle() {
    visible ? hide() : show();
  }

  function fmt(ms) {
    if (ms < 0) ms = 0;
    const totalSec = Math.ceil(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  function updateDisplay() {
    const display = document.getElementById('timer-display');
    if (!display) return;
    display.textContent = fmt(STATE.remainingMs);
    // 残り時間で色変化
    display.classList.remove('warn', 'danger');
    if (STATE.remainingMs <= 10 * 1000 && STATE.remainingMs > 0) {
      display.classList.add('danger');
    } else if (STATE.remainingMs <= 30 * 1000 && STATE.remainingMs > 10 * 1000) {
      display.classList.add('warn');
    }
    // プログレスバー
    const prog = document.getElementById('timer-progress');
    if (prog && STATE.totalMs > 0) {
      const ratio = Math.max(0, Math.min(1, STATE.remainingMs / STATE.totalMs));
      prog.style.width = (ratio * 100) + '%';
    }
  }

  function updateButtons() {
    const startBtn = document.getElementById('timer-start');
    if (!startBtn) return;
    if (STATE.running) {
      startBtn.innerHTML = '<i class="fa-solid fa-pause mr-1"></i>一時停止';
      startBtn.classList.remove('timer-btn-start');
      startBtn.classList.add('timer-btn-pause');
    } else {
      startBtn.innerHTML = '<i class="fa-solid fa-play mr-1"></i>スタート';
      startBtn.classList.remove('timer-btn-pause');
      startBtn.classList.add('timer-btn-start');
    }
  }

  function toggleStart() {
    if (STATE.running) {
      pause();
    } else {
      start();
    }
  }

  function start() {
    if (STATE.remainingMs <= 0) {
      // 0秒からはスタートしない（リセットしてください）
      STATE.remainingMs = STATE.totalMs;
    }
    STATE.endsAt = Date.now() + STATE.remainingMs;
    STATE.running = true;
    stopInterval();
    STATE.intervalId = setInterval(tick, 100);
    updateButtons();
    // ユーザー操作のついでにAudioContextを準備（自動再生制限対策）
    primeAudio();
  }

  function pause() {
    STATE.running = false;
    stopInterval();
    updateButtons();
  }

  function stopInterval() {
    if (STATE.intervalId) {
      clearInterval(STATE.intervalId);
      STATE.intervalId = null;
    }
  }

  function reset() {
    pause();
    STATE.remainingMs = STATE.totalMs;
    updateDisplay();
  }

  function setFromInputs() {
    const m = parseInt(document.getElementById('timer-min').value, 10) || 0;
    const s = parseInt(document.getElementById('timer-sec').value, 10) || 0;
    const ms = (m * 60 + s) * 1000;
    if (ms <= 0) {
      if (typeof showToast === 'function') showToast('⚠️ 1秒以上を設定してください');
      return;
    }
    STATE.totalMs = ms;
    STATE.remainingMs = ms;
    pause();
    updateDisplay();
    updateButtons();
  }

  function tick() {
    STATE.remainingMs = STATE.endsAt - Date.now();
    if (STATE.remainingMs <= 0) {
      STATE.remainingMs = 0;
      pause();
      updateDisplay();
      onFinished();
      return;
    }
    updateDisplay();
  }

  // ===== アラーム音（Web Audio APIでビープ生成、ファイル不要） =====
  let audioCtx = null;
  function primeAudio() {
    try {
      if (!audioCtx) {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (Ctx) audioCtx = new Ctx();
      }
      if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    } catch (e) {}
  }

  function beep(freq, duration, when, type) {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type || 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, when);
    gain.gain.linearRampToValueAtTime(0.4, when + 0.02);
    gain.gain.linearRampToValueAtTime(0, when + duration);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(when);
    osc.stop(when + duration + 0.05);
  }

  function playAlarm() {
    primeAudio();
    if (!audioCtx) return;
    const t0 = audioCtx.currentTime;
    // ピポパポ的な3連
    [880, 1320, 880].forEach((f, i) => {
      beep(f, 0.18, t0 + i * 0.22, 'sine');
    });
    // 余韻
    setTimeout(() => beep(660, 0.6, audioCtx.currentTime, 'triangle'), 800);
  }

  function flashScreen() {
    const flash = document.createElement('div');
    flash.className = 'timer-flash';
    document.body.appendChild(flash);
    setTimeout(() => flash.remove(), 1600);
  }

  function onFinished() {
    playAlarm();
    flashScreen();
    if (typeof showToast === 'function') {
      showToast('⏰ 時間です！おつかれさま', 4000);
    }
    // パネルを点滅
    const display = document.getElementById('timer-display');
    if (display) {
      display.classList.add('finished');
      setTimeout(() => display.classList.remove('finished'), 3000);
    }
    // ブラウザ通知（許可されていれば）
    if ('Notification' in window && Notification.permission === 'granted') {
      try { new Notification('みんなのジャム', { body: '⏰ タイマー終了しました', icon: '' }); } catch (e) {}
    }
  }

  // ===== セットアップ =====
  function setup() {
    const btn = document.getElementById('btn-timer');
    if (btn) btn.addEventListener('click', toggle);

    // 通知許可をそっと依頼（ブロックされていなければ）
    if ('Notification' in window && Notification.permission === 'default') {
      // ボタンクリック時にrequestした方がよいが、ここでは控えめに保留
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setup);
  } else {
    setup();
  }

  // 公開
  window.MNJTimer = { show, hide, toggle, start, pause, reset };
})();
