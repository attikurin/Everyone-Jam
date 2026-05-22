/* =========================================
   みんなのジャム - 手書き文字認識（OCR）
   v1.9.0 / Phase 9
   ========================================= */
/*
  児童の答案・板書をテキスト化する機能。
  - Tesseract.js v5 でクライアントサイドOCR（API不要、サーバー不要）
  - 日本語(jpn) + 英語(eng) を初期サポート
  - 領域ドラッグ選択 → OCR → 修正可能なテキスト → ボードに挿入
*/

// ===== OCR エンジン管理 =====
const OCR_LANGS_DEFAULT = 'jpn+eng';
const OCR_WORKER_PATH = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/worker.min.js';
const OCR_CORE_PATH = 'https://cdn.jsdelivr.net/npm/tesseract.js-core@5';
const OCR_LANG_PATH = 'https://tessdata.projectnaptha.com/4.0.0';

// Worker のシングルトン（一度作ったら使い回す）
let _ocrWorker = null;
let _ocrLangsLoaded = '';
let _ocrInitializing = false;

// OCR モード状態
const OCRState = {
  mode: false,            // OCRモードON/OFF
  startX: null,
  startY: null,
  endX: null,
  endY: null,
  selectionRect: null,    // Konva.Rect（プレビュー枠）
  lastResult: '',         // 最後の認識結果テキスト
  lastBitmap: null,       // 最後にOCRした画像（プレビュー用）
};

// ===== Worker 初期化（遅延ロード） =====
async function initOcrWorker(langs = OCR_LANGS_DEFAULT, onProgress) {
  if (typeof Tesseract === 'undefined' || !Tesseract.createWorker) {
    throw new Error('Tesseract.js が読み込まれていません');
  }
  // 既存ワーカーで言語が同じならそのまま返す
  if (_ocrWorker && _ocrLangsLoaded === langs) {
    return _ocrWorker;
  }
  // 別言語が必要 → 既存ワーカーは破棄
  if (_ocrWorker && _ocrLangsLoaded !== langs) {
    try { await _ocrWorker.terminate(); } catch (e) {}
    _ocrWorker = null;
    _ocrLangsLoaded = '';
  }
  if (_ocrInitializing) {
    // 並行呼び出しガード
    while (_ocrInitializing) {
      await new Promise(r => setTimeout(r, 100));
    }
    if (_ocrWorker) return _ocrWorker;
  }
  _ocrInitializing = true;
  try {
    if (typeof onProgress === 'function') onProgress({ status: 'starting', progress: 0 });
    const worker = await Tesseract.createWorker(langs, 1, {
      workerPath: OCR_WORKER_PATH,
      corePath: OCR_CORE_PATH,
      langPath: OCR_LANG_PATH,
      logger: (m) => {
        if (typeof onProgress === 'function') onProgress(m);
      },
    });
    _ocrWorker = worker;
    _ocrLangsLoaded = langs;
    return worker;
  } finally {
    _ocrInitializing = false;
  }
}

// ===== OCR モード切替 =====
function toggleOcrMode(forceState) {
  const newState = (typeof forceState === 'boolean') ? forceState : !OCRState.mode;
  OCRState.mode = newState;
  document.body.classList.toggle('ocr-mode-active', newState);

  // ツールバーのOCRボタン active表示
  const btn = document.getElementById('btn-tool-ocr');
  if (btn) btn.classList.toggle('active', newState);

  // ステージカーソル
  if (State && State.stage) {
    State.stage.container().style.cursor = newState ? 'crosshair' : '';
  }

  // ガイドバナー
  let banner = document.getElementById('ocr-mode-banner');
  if (newState) {
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'ocr-mode-banner';
      banner.className = 'ocr-mode-banner';
      banner.innerHTML = `
        <i class="fa-solid fa-magnifying-glass-chart"></i>
        <span>OCRモード — 文字を読み取りたい範囲をドラッグで囲んでください</span>
        <button id="ocr-mode-banner-close" class="ocr-banner-close" title="OCRモードを終了">
          <i class="fa-solid fa-xmark"></i> 終了
        </button>
      `;
      document.body.appendChild(banner);
      document.getElementById('ocr-mode-banner-close').addEventListener('click', () => toggleOcrMode(false));
    }
    banner.style.display = 'flex';
  } else if (banner) {
    banner.style.display = 'none';
    // 選択中の枠を消す
    _clearSelectionPreview();
  }

  if (typeof showToast === 'function') {
    showToast(newState ? '🔍 OCRモード：範囲をドラッグして囲んでください' : '✋ OCRモードを終了しました');
  }
}

function _clearSelectionPreview() {
  if (OCRState.selectionRect) {
    try { OCRState.selectionRect.destroy(); } catch (e) {}
    OCRState.selectionRect = null;
  }
  OCRState.startX = OCRState.startY = OCRState.endX = OCRState.endY = null;
  if (State && State.uiLayer) State.uiLayer.batchDraw();
}

// ===== ステージ上でのドラッグ選択処理 =====
// app.js から呼び出される（mousedown/mousemove/mouseup フック）
function handleOcrPointerDown(stagePos) {
  if (!OCRState.mode) return false;
  OCRState.startX = stagePos.x;
  OCRState.startY = stagePos.y;
  OCRState.endX = stagePos.x;
  OCRState.endY = stagePos.y;
  if (OCRState.selectionRect) OCRState.selectionRect.destroy();
  OCRState.selectionRect = new Konva.Rect({
    x: stagePos.x,
    y: stagePos.y,
    width: 0,
    height: 0,
    stroke: '#ff5a3c',
    strokeWidth: 2,
    dash: [6, 4],
    fill: 'rgba(255, 90, 60, 0.08)',
    listening: false,
  });
  if (State.uiLayer) {
    State.uiLayer.add(OCRState.selectionRect);
    State.uiLayer.batchDraw();
  }
  return true;
}

function handleOcrPointerMove(stagePos) {
  if (!OCRState.mode || !OCRState.selectionRect) return false;
  OCRState.endX = stagePos.x;
  OCRState.endY = stagePos.y;
  const x = Math.min(OCRState.startX, OCRState.endX);
  const y = Math.min(OCRState.startY, OCRState.endY);
  const w = Math.abs(OCRState.endX - OCRState.startX);
  const h = Math.abs(OCRState.endY - OCRState.startY);
  OCRState.selectionRect.setAttrs({ x, y, width: w, height: h });
  State.uiLayer.batchDraw();
  return true;
}

async function handleOcrPointerUp() {
  if (!OCRState.mode || !OCRState.selectionRect) return false;
  const x = Math.min(OCRState.startX, OCRState.endX);
  const y = Math.min(OCRState.startY, OCRState.endY);
  const w = Math.abs(OCRState.endX - OCRState.startX);
  const h = Math.abs(OCRState.endY - OCRState.startY);
  _clearSelectionPreview();
  if (w < 20 || h < 20) {
    if (typeof showToast === 'function') showToast('ℹ️ 範囲が小さすぎます（20×20px以上必要）');
    return true;
  }
  // 選択範囲を画像化してOCRモーダルへ
  try {
    const dataUrl = await _captureRegionAsImage(x, y, w, h);
    OCRState.lastBitmap = dataUrl;
    openOcrModal(dataUrl);
  } catch (e) {
    console.error('[OCR] 領域キャプチャ失敗:', e);
    if (typeof showToast === 'function') showToast('⚠️ 範囲の取得に失敗しました');
  }
  return true;
}

// ===== ボード領域を画像（DataURL）として抽出 =====
async function _captureRegionAsImage(x, y, w, h) {
  // 1) tempStage に該当ページを描画（exportのrenderPageToDataURLIndexを応用）
  //    → 必要な範囲だけクロップ
  if (typeof renderPageToDataURLIndex !== 'function') {
    throw new Error('renderPageToDataURLIndex がありません');
  }
  const fullDataUrl = await renderPageToDataURLIndex(State.currentPageIndex);
  // フルページを Image にロードしてクロップ
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      // renderPageToDataURLIndex は pixelRatio: 1.5 でレンダリングしている
      // 内部 BOARD_WIDTH×BOARD_HEIGHT を 1.5倍した画像 → クロップ座標も 1.5倍
      const scale = img.width / BOARD_WIDTH;
      const sx = Math.max(0, x * scale);
      const sy = Math.max(0, y * scale);
      const sw = Math.min(img.width - sx, w * scale);
      const sh = Math.min(img.height - sy, h * scale);
      // OCR精度向上のため、最低でも 800px 幅を確保（不足なら拡大）
      const MIN_W = 800;
      let outW = sw, outH = sh;
      if (sw < MIN_W) {
        const r = MIN_W / sw;
        outW = MIN_W;
        outH = sh * r;
      }
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(outW);
      canvas.height = Math.round(outH);
      const ctx = canvas.getContext('2d');
      // 白背景（透過対策）
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      // クロップ→拡大
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => reject(new Error('画像生成に失敗'));
    img.src = fullDataUrl;
  });
}

// ===== OCR 実行 =====
async function runOcrOnDataUrl(dataUrl, langs, onProgress) {
  const worker = await initOcrWorker(langs || OCR_LANGS_DEFAULT, onProgress);
  const { data } = await worker.recognize(dataUrl);
  return {
    text: (data && data.text) ? data.text.trim() : '',
    confidence: (data && typeof data.confidence === 'number') ? data.confidence : 0,
    words: (data && data.words) ? data.words : [],
  };
}

// ===== モーダル制御 =====
function openOcrModal(initialImageDataUrl) {
  const modal = document.getElementById('modal-ocr');
  if (!modal) return;
  modal.classList.remove('hidden');

  // 初期表示
  const preview = document.getElementById('ocr-preview-img');
  if (preview && initialImageDataUrl) {
    preview.src = initialImageDataUrl;
    preview.style.display = 'block';
  }
  const resultArea = document.getElementById('ocr-result-textarea');
  if (resultArea) resultArea.value = '';
  _setOcrProgress('idle');
  _updateOcrActionButtons(false);

  // 自動でOCR開始（初期画像があるとき）
  if (initialImageDataUrl) {
    _runOcrWithUI(initialImageDataUrl);
  }
}

function closeOcrModal() {
  const modal = document.getElementById('modal-ocr');
  if (modal) modal.classList.add('hidden');
}

function _setOcrProgress(state, detail) {
  const bar = document.getElementById('ocr-progress-bar');
  const label = document.getElementById('ocr-progress-label');
  const pct = document.getElementById('ocr-progress-pct');
  const wrap = document.getElementById('ocr-progress');
  if (!wrap) return;
  detail = detail || {};
  if (state === 'idle') {
    wrap.style.display = 'none';
    if (bar) bar.style.width = '0%';
    if (label) label.textContent = '';
    if (pct) pct.textContent = '0%';
  } else if (state === 'loading') {
    wrap.style.display = 'block';
    const p = detail.pct || 0;
    if (bar) bar.style.width = p + '%';
    if (label) label.textContent = detail.label || '読み込み中...';
    if (pct) pct.textContent = p + '%';
  } else if (state === 'done') {
    wrap.style.display = 'block';
    if (bar) bar.style.width = '100%';
    if (label) label.textContent = '完了（信頼度 ' + (detail.confidence || 0).toFixed(0) + '%）';
    if (pct) pct.textContent = '100%';
    setTimeout(() => { wrap.style.display = 'none'; }, 1800);
  } else if (state === 'error') {
    wrap.style.display = 'block';
    if (bar) bar.style.width = '100%';
    if (label) label.textContent = '⚠️ ' + (detail.message || 'エラー');
    if (pct) pct.textContent = '!';
  }
}

function _updateOcrActionButtons(hasResult) {
  ['ocr-insert-text','ocr-insert-sticky','ocr-copy','ocr-rerun'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.disabled = !hasResult;
  });
}

async function _runOcrWithUI(dataUrl) {
  const langs = (document.getElementById('ocr-lang-select')?.value) || OCR_LANGS_DEFAULT;
  _setOcrProgress('loading', { pct: 0, label: 'OCRエンジンを準備中（初回は1分程度かかります）...' });
  _updateOcrActionButtons(false);

  try {
    const result = await runOcrOnDataUrl(dataUrl, langs, (m) => {
      // m.status: 'loading tesseract core'|'initializing tesseract'|'loading language traineddata'|'initializing api'|'recognizing text'
      const pct = typeof m.progress === 'number' ? Math.round(m.progress * 100) : 0;
      const label = _localizeProgress(m.status, pct);
      _setOcrProgress('loading', { pct, label });
    });
    const ta = document.getElementById('ocr-result-textarea');
    if (ta) ta.value = result.text;
    OCRState.lastResult = result.text;
    _setOcrProgress('done', { confidence: result.confidence });
    _updateOcrActionButtons(!!result.text);
    if (!result.text) {
      if (typeof showToast === 'function') showToast('ℹ️ テキストを検出できませんでした');
    }
  } catch (err) {
    console.error('[OCR] 認識失敗:', err);
    _setOcrProgress('error', { message: err.message || '認識に失敗しました' });
    if (typeof showToast === 'function') showToast('⚠️ OCRに失敗しました：' + (err.message || ''));
  }
}

function _localizeProgress(status, pct) {
  const map = {
    'loading tesseract core': 'OCRエンジン本体を読み込み中',
    'initializing tesseract': 'OCRエンジン初期化中',
    'loading language traineddata': '言語データを読み込み中（jpn 約13MB）',
    'initialized lang model': '言語モデル準備完了',
    'initializing api': 'API初期化中',
    'recognizing text': '文字を認識中',
  };
  const ja = map[status] || status || '処理中';
  return `${ja}... ${pct}%`;
}

// ===== ファイルアップロードからOCR =====
function handleOcrFileInput(file) {
  if (!file) return;
  if (!file.type || !file.type.startsWith('image/')) {
    if (typeof showToast === 'function') showToast('⚠️ 画像ファイルを選んでください');
    return;
  }
  if (file.size > 20 * 1024 * 1024) {
    if (typeof showToast === 'function') showToast('⚠️ 画像が大きすぎます（20MBまで）');
    return;
  }
  const reader = new FileReader();
  reader.onload = (e) => {
    const dataUrl = e.target.result;
    OCRState.lastBitmap = dataUrl;
    const preview = document.getElementById('ocr-preview-img');
    if (preview) {
      preview.src = dataUrl;
      preview.style.display = 'block';
    }
    _runOcrWithUI(dataUrl);
  };
  reader.readAsDataURL(file);
}

// ===== 結果をボードに挿入 =====
function insertOcrResultAsText() {
  const ta = document.getElementById('ocr-result-textarea');
  const text = (ta?.value || OCRState.lastResult || '').trim();
  if (!text) return;
  if (typeof addObjectToPage !== 'function') return;

  // 中央付近に配置（既存テキストと被らないよう少しランダムオフセット）
  const offsetX = 80 + Math.random() * 80;
  const offsetY = 80 + Math.random() * 80;
  const obj = {
    id: uid(),
    type: 'text',
    x: BOARD_WIDTH / 2 - 240 + offsetX,
    y: BOARD_HEIGHT / 2 - 60 + offsetY,
    width: 480,
    text,
    fontSize: 28,
    color: '#2C3E50',
  };
  addObjectToPage(obj);
  closeOcrModal();
  if (OCRState.mode) toggleOcrMode(false);
  if (typeof showToast === 'function') showToast('✏️ テキストとして挿入しました');
}

function insertOcrResultAsSticky() {
  const ta = document.getElementById('ocr-result-textarea');
  const text = (ta?.value || OCRState.lastResult || '').trim();
  if (!text) return;
  if (typeof addObjectToPage !== 'function') return;
  // 選択された付箋色（swatch UIから取得）
  const color = _getSelectedStickyColor();

  // テキスト量に応じて付箋サイズを調整
  const len = text.length;
  let w = 220, h = 220;
  if (len > 60) { w = 320; h = 280; }
  if (len > 150) { w = 420; h = 360; }
  const offsetX = 60 + Math.random() * 80;
  const offsetY = 60 + Math.random() * 80;

  const obj = {
    id: uid(),
    type: 'sticky',
    x: BOARD_WIDTH / 2 - w / 2 + offsetX,
    y: BOARD_HEIGHT / 2 - h / 2 + offsetY,
    width: w,
    height: h,
    color,
    text,
    fontSize: 22,
  };
  addObjectToPage(obj);
  closeOcrModal();
  if (OCRState.mode) toggleOcrMode(false);
  if (typeof showToast === 'function') showToast('🟨 付箋として挿入しました');
}

function copyOcrResultToClipboard() {
  const ta = document.getElementById('ocr-result-textarea');
  const text = (ta?.value || OCRState.lastResult || '').trim();
  if (!text) return;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => {
      if (typeof showToast === 'function') showToast('📋 クリップボードにコピーしました');
    }).catch(() => {
      _fallbackCopy(text);
    });
  } else {
    _fallbackCopy(text);
  }
}

function _fallbackCopy(text) {
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    if (typeof showToast === 'function') showToast('📋 クリップボードにコピーしました');
  } catch (e) {
    if (typeof showToast === 'function') showToast('⚠️ コピーに失敗しました');
  }
}

// ===== モーダル内のイベント設定 =====
function setupOcrModalHandlers() {
  const modal = document.getElementById('modal-ocr');
  if (!modal) return;

  // ファイルアップロード
  const fileInput = document.getElementById('ocr-file-input');
  if (fileInput) {
    fileInput.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (file) handleOcrFileInput(file);
      e.target.value = '';
    });
  }
  const uploadBtn = document.getElementById('ocr-upload-btn');
  if (uploadBtn) {
    uploadBtn.addEventListener('click', () => {
      if (fileInput) fileInput.click();
    });
  }

  // 再認識ボタン
  const rerunBtn = document.getElementById('ocr-rerun');
  if (rerunBtn) {
    rerunBtn.addEventListener('click', () => {
      if (OCRState.lastBitmap) _runOcrWithUI(OCRState.lastBitmap);
    });
  }

  // 言語変更時に自動再認識（任意：UXが煩いので手動再実行に任せる）
  // const langSel = document.getElementById('ocr-lang-select');
  // if (langSel) langSel.addEventListener('change', () => {
  //   if (OCRState.lastBitmap) _runOcrWithUI(OCRState.lastBitmap);
  // });

  // 挿入アクション
  const btnText = document.getElementById('ocr-insert-text');
  if (btnText) btnText.addEventListener('click', insertOcrResultAsText);
  const btnSticky = document.getElementById('ocr-insert-sticky');
  if (btnSticky) btnSticky.addEventListener('click', insertOcrResultAsSticky);
  const btnCopy = document.getElementById('ocr-copy');
  if (btnCopy) btnCopy.addEventListener('click', copyOcrResultToClipboard);

  // 付箋色swatchを初期化
  _renderStickyColorSwatches();

  // モーダル背景クリックで閉じない（誤操作防止）
  // 右上の×ボタンで閉じる
  const closeBtns = modal.querySelectorAll('[data-close="modal-ocr"]');
  closeBtns.forEach(b => b.addEventListener('click', closeOcrModal));
}

// ===== 付箋色スワッチャ（div + clickable spans） =====
let _ocrSelectedStickyColor = null;
function _renderStickyColorSwatches() {
  const wrap = document.getElementById('ocr-sticky-color');
  if (!wrap) return;
  const colors = (typeof STICKY_COLORS !== 'undefined' && Array.isArray(STICKY_COLORS))
    ? STICKY_COLORS
    : ['#FFE082','#FFAB91','#F8BBD0','#CE93D8','#A5D6F7','#C5E1A5'];
  if (!_ocrSelectedStickyColor) _ocrSelectedStickyColor = colors[0];
  wrap.innerHTML = '';
  colors.forEach((c) => {
    const sw = document.createElement('span');
    sw.className = 'ocr-color-swatch' + (c === _ocrSelectedStickyColor ? ' selected' : '');
    sw.style.backgroundColor = c;
    sw.dataset.color = c;
    sw.title = c;
    sw.addEventListener('click', () => {
      _ocrSelectedStickyColor = c;
      wrap.querySelectorAll('.ocr-color-swatch').forEach(s => s.classList.remove('selected'));
      sw.classList.add('selected');
    });
    wrap.appendChild(sw);
  });
}
function _getSelectedStickyColor() {
  if (_ocrSelectedStickyColor) return _ocrSelectedStickyColor;
  return (typeof STICKY_COLORS !== 'undefined' ? STICKY_COLORS[0] : '#FFE082');
}

// ===== グローバル公開 =====
if (typeof window !== 'undefined') {
  window.OCRState = OCRState;
  window.toggleOcrMode = toggleOcrMode;
  window.openOcrModal = openOcrModal;
  window.closeOcrModal = closeOcrModal;
  window.setupOcrModalHandlers = setupOcrModalHandlers;
  window.initOcrWorker = initOcrWorker;
  window.runOcrOnDataUrl = runOcrOnDataUrl;
  window.handleOcrPointerDown = handleOcrPointerDown;
  window.handleOcrPointerMove = handleOcrPointerMove;
  window.handleOcrPointerUp = handleOcrPointerUp;
  window.insertOcrResultAsText = insertOcrResultAsText;
  window.insertOcrResultAsSticky = insertOcrResultAsSticky;
  window.copyOcrResultToClipboard = copyOcrResultToClipboard;
  window.handleOcrFileInput = handleOcrFileInput;
}
