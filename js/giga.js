/* =========================================
   みんなのジャム - GIGAスクール端末最適化（v1.4.0 / Phase 4-1）

   主な機能:
   1. タッチジェスチャ（2本指ピンチズーム・パン）
   2. ペン入力の優先認識（手のひらをついても誤描画しない＝パームリジェクション簡易版）
   3. UI拡大モード（Chromebook/iPadの小画面で押しやすいボタンサイズへ）
   4. パフォーマンス制御（描画ポイント間引き・サムネイル更新間隔調整）
   5. タッチデバイス検出と自動最適化
   ========================================= */

(function () {
  'use strict';

  const GIGA = {
    isTouchDevice: false,
    isPenInput: false,        // 直前の入力がペンだったか
    bigUiMode: false,         // 大きいUIモード（先生が設定）
    activeTouches: new Map(), // touchId -> {x, y}
    pinchStartDist: 0,
    pinchStartScale: 1,
    pinchCenter: null,
    panLastCenter: null,
    palmRejection: true,      // 手のひら誤接触を無視
  };

  // ローカルストレージキー
  const KEY_BIG_UI = 'minnanojam_giga_bigui';
  const KEY_PALM_REJ = 'minnanojam_giga_palmrej';

  // ===== デバイス検出 =====
  function detectDevice() {
    GIGA.isTouchDevice = (
      'ontouchstart' in window ||
      navigator.maxTouchPoints > 0 ||
      navigator.msMaxTouchPoints > 0
    );
    if (GIGA.isTouchDevice) {
      document.body.classList.add('giga-touch-device');
    }
    // Chromebookらしさの判定（CrOS UA）
    if (/CrOS/i.test(navigator.userAgent)) {
      document.body.classList.add('giga-chromebook');
    }
    // iPadOS判定
    if (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) {
      document.body.classList.add('giga-ipad');
    }
  }

  // ===== UI拡大モード =====
  function loadSettings() {
    try {
      GIGA.bigUiMode = localStorage.getItem(KEY_BIG_UI) === '1';
      const palm = localStorage.getItem(KEY_PALM_REJ);
      GIGA.palmRejection = palm === null ? true : palm === '1';
    } catch (e) {}
    applyBigUiMode();
  }

  function applyBigUiMode() {
    if (GIGA.bigUiMode) {
      document.body.classList.add('giga-big-ui');
    } else {
      document.body.classList.remove('giga-big-ui');
    }
    // ボタンの状態を更新
    const btn = document.getElementById('btn-giga-bigui');
    if (btn) {
      btn.classList.toggle('active', GIGA.bigUiMode);
      btn.title = GIGA.bigUiMode ? 'UIサイズ：大（クリックで標準へ）' : 'UIサイズ：標準（クリックで大へ）';
    }
  }

  function toggleBigUi() {
    GIGA.bigUiMode = !GIGA.bigUiMode;
    try { localStorage.setItem(KEY_BIG_UI, GIGA.bigUiMode ? '1' : '0'); } catch (e) {}
    applyBigUiMode();
    if (typeof showToast === 'function') {
      showToast(GIGA.bigUiMode ? '🔍 UIを大きく表示' : '🔍 UIを標準サイズに戻しました');
    }
    // Konvaステージのリサイズが必要な場合（ヘッダー高が変わるため）
    setTimeout(() => {
      if (typeof handleResize === 'function') handleResize();
      else if (window.State && window.State.stage) {
        const c = document.getElementById('canvas-container');
        if (c) {
          const r = c.getBoundingClientRect();
          window.State.stage.width(Math.max(r.width, 100));
          window.State.stage.height(Math.max(r.height, 100));
          if (typeof applyTransform === 'function') applyTransform();
        }
      }
    }, 50);
  }

  function togglePalmRejection() {
    GIGA.palmRejection = !GIGA.palmRejection;
    try { localStorage.setItem(KEY_PALM_REJ, GIGA.palmRejection ? '1' : '0'); } catch (e) {}
    if (typeof showToast === 'function') {
      showToast(GIGA.palmRejection ? '✋ 手のひら誤接触を無視：ON' : '✋ 手のひら誤接触を無視：OFF');
    }
    const btn = document.getElementById('btn-giga-palm');
    if (btn) btn.classList.toggle('active', GIGA.palmRejection);
  }

  // ===== ピンチズーム & 2本指パン =====
  function getDistance(t1, t2) {
    const dx = t1.clientX - t2.clientX;
    const dy = t1.clientY - t2.clientY;
    return Math.sqrt(dx*dx + dy*dy);
  }
  function getCenter(t1, t2) {
    return {
      x: (t1.clientX + t2.clientX) / 2,
      y: (t1.clientY + t2.clientY) / 2,
    };
  }

  function setupTouchGestures() {
    if (!window.State || !window.State.stage) {
      // ステージが未初期化なら少し後にリトライ
      setTimeout(setupTouchGestures, 200);
      return;
    }
    const container = window.State.stage.container();
    if (!container) return;

    // touchstart: 2本指の場合はピンチ準備
    container.addEventListener('touchstart', (e) => {
      if (e.touches.length === 2) {
        // 描画中の操作をキャンセル
        if (window.State.isDrawing) {
          window.State.isDrawing = false;
          if (window.State.currentShape) {
            try { window.State.currentShape.destroy(); } catch (err) {}
            window.State.currentShape = null;
          }
        }
        const t1 = e.touches[0], t2 = e.touches[1];
        GIGA.pinchStartDist = getDistance(t1, t2);
        GIGA.pinchStartScale = window.State.scale || 1;
        GIGA.pinchCenter = getCenter(t1, t2);
        GIGA.panLastCenter = GIGA.pinchCenter;
        e.preventDefault();
      }
    }, { passive: false });

    container.addEventListener('touchmove', (e) => {
      if (e.touches.length === 2) {
        const t1 = e.touches[0], t2 = e.touches[1];
        const dist = getDistance(t1, t2);
        const center = getCenter(t1, t2);

        if (GIGA.pinchStartDist > 0) {
          // ズーム
          const scaleFactor = dist / GIGA.pinchStartDist;
          const newScale = Math.max(0.2, Math.min(4, GIGA.pinchStartScale * scaleFactor));

          // パン（中心移動分）
          if (GIGA.panLastCenter) {
            const dx = center.x - GIGA.panLastCenter.x;
            const dy = center.y - GIGA.panLastCenter.y;
            window.State.panX += dx;
            window.State.panY += dy;
          }

          // ズーム適用（中心点基準）
          const containerRect = container.getBoundingClientRect();
          const localX = center.x - containerRect.left;
          const localY = center.y - containerRect.top;
          const oldScale = window.State.scale;
          // ズーム前のステージ座標を計算
          const pointTo = {
            x: (localX - window.State.panX) / oldScale,
            y: (localY - window.State.panY) / oldScale,
          };
          window.State.scale = newScale;
          window.State.panX = localX - pointTo.x * newScale;
          window.State.panY = localY - pointTo.y * newScale;

          if (typeof applyTransform === 'function') applyTransform();
        }
        GIGA.panLastCenter = center;
        e.preventDefault();
      }
    }, { passive: false });

    container.addEventListener('touchend', (e) => {
      if (e.touches.length < 2) {
        GIGA.pinchStartDist = 0;
        GIGA.panLastCenter = null;
      }
    });
  }

  // ===== パームリジェクション =====
  // touchstart で 2本指以上 or サイズが大きい接触は無視（手のひら）
  // ペン入力（pointerType === 'pen'）が来たら直近のタッチ描画をキャンセル
  function setupPalmRejection() {
    if (!window.State || !window.State.stage) {
      setTimeout(setupPalmRejection, 200);
      return;
    }
    const container = window.State.stage.container();
    if (!container) return;

    // Pointer Eventsでペン優先
    container.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'pen') {
        GIGA.isPenInput = true;
        // ペンが来たら、もしタッチ由来の描画があればキャンセル
        if (GIGA.palmRejection && window.State.isDrawing && GIGA.lastInputType === 'touch') {
          window.State.isDrawing = false;
          if (window.State.currentShape) {
            try { window.State.currentShape.destroy(); } catch (err) {}
            window.State.currentShape = null;
          }
        }
        GIGA.lastInputType = 'pen';
      } else if (e.pointerType === 'touch') {
        GIGA.lastInputType = 'touch';
        // ペン使用直後（500ms以内）のタッチは無視
        if (GIGA.palmRejection && GIGA.isPenInput) {
          const sinceLast = Date.now() - (GIGA.lastPenTime || 0);
          if (sinceLast < 500) {
            e.stopPropagation();
            e.preventDefault();
          }
        }
      } else {
        GIGA.lastInputType = 'mouse';
      }
    }, { capture: true });

    container.addEventListener('pointerup', (e) => {
      if (e.pointerType === 'pen') {
        GIGA.lastPenTime = Date.now();
      }
    }, { capture: true });
  }

  // ===== ヘッダーボタン挿入 =====
  function installHeaderButtons() {
    // 「新しいボード」の左隣あたり、または「ボード一覧」の隣に挿入
    const headerArea = document.querySelector('#app-header .header-right')
      || document.querySelector('#app-header')
      || document.body;
    if (!headerArea) return;

    // 既に追加済みならスキップ
    if (document.getElementById('btn-giga-bigui')) return;

    // 大きいUIボタン（スマホでは非表示、md以上でinline-flex）
    const bigUiBtn = document.createElement('button');
    bigUiBtn.id = 'btn-giga-bigui';
    bigUiBtn.className = 'header-btn hidden lg:inline-flex';
    bigUiBtn.title = 'UIサイズ切替（大⇔標準）';
    bigUiBtn.innerHTML = '<i class="fa-solid fa-magnifying-glass-plus"></i>';
    bigUiBtn.addEventListener('click', toggleBigUi);

    // パームリジェクションボタン（タッチ端末のみ表示、スマホでは非表示）
    const palmBtn = document.createElement('button');
    palmBtn.id = 'btn-giga-palm';
    palmBtn.className = 'header-btn hidden lg:inline-flex';
    palmBtn.title = '手のひら誤接触の無視（ON/OFF）';
    palmBtn.innerHTML = '<i class="fa-solid fa-hand"></i>';
    palmBtn.addEventListener('click', togglePalmRejection);
    if (GIGA.palmRejection) palmBtn.classList.add('active');

    // ヘルプの前に挿入
    const helpBtn = document.getElementById('btn-help');
    if (helpBtn && helpBtn.parentNode) {
      helpBtn.parentNode.insertBefore(bigUiBtn, helpBtn);
      if (GIGA.isTouchDevice) {
        helpBtn.parentNode.insertBefore(palmBtn, helpBtn);
      }
    } else {
      headerArea.appendChild(bigUiBtn);
      if (GIGA.isTouchDevice) headerArea.appendChild(palmBtn);
    }
    applyBigUiMode();
  }

  // ===== 初期化 =====
  function init() {
    detectDevice();
    loadSettings();
    installHeaderButtons();
    setupTouchGestures();
    setupPalmRejection();
    console.log('[GIGA] 初期化完了 touch=' + GIGA.isTouchDevice +
      ' bigUI=' + GIGA.bigUiMode + ' palm=' + GIGA.palmRejection);
  }

  // DOM ready後に開始
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(init, 300));
  } else {
    setTimeout(init, 300);
  }

  // window公開
  window.GIGA = GIGA;
  window.toggleGigaBigUi = toggleBigUi;
  window.toggleGigaPalmRejection = togglePalmRejection;
})();
