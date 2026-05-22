/* =========================================
   みんなのジャム - 教材インポート（PDF / 画像）
   v1.8.0 / Phase 8
   ========================================= */
/*
   既存のプリント教材（PDF / JPEG / PNG）を「背景画像」として
   ボードページに取り込みます。Konva オブジェクトとは別の
   page.backgroundImage = { src, opacity, fit } に保存され、
   描画・選択・削除はオブジェクトと分離されています。
*/

// ===== 設定 =====
const IMPORT_MAX_DIMENSION = 1920;   // 画像は最長辺1920pxに縮小
const IMPORT_JPEG_QUALITY = 0.82;    // JPEG圧縮率
const IMPORT_PDF_MAX_PAGES = 10;     // PDF読み込み上限ページ数
const IMPORT_PDF_RENDER_SCALE = 1.6; // PDFレンダリング解像度

// ===== ヘルパー：File → DataURL（縮小+圧縮） =====
function _importLoadImageFile(file) {
  return new Promise((resolve, reject) => {
    if (!file) return reject(new Error('ファイルが指定されていません'));
    if (!file.type || !file.type.startsWith('image/')) return reject(new Error('画像ファイルではありません'));
    if (file.size > 20 * 1024 * 1024) return reject(new Error('画像が大きすぎます（20MBまで）'));

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let w = img.width, h = img.height;
        if (w < 1 || h < 1) return reject(new Error('画像が空です'));
        // 縮小
        const max = IMPORT_MAX_DIMENSION;
        if (w > max || h > max) {
          const r = Math.min(max / w, max / h);
          w = Math.round(w * r);
          h = Math.round(h * r);
        }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        const needAlpha = /png|gif|webp|svg/i.test(file.type);
        if (needAlpha) {
          ctx.clearRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);
          resolve({ src: canvas.toDataURL('image/png'), width: w, height: h });
        } else {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);
          resolve({ src: canvas.toDataURL('image/jpeg', IMPORT_JPEG_QUALITY), width: w, height: h });
        }
      };
      img.onerror = () => reject(new Error('画像の読み込みに失敗しました'));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error('ファイル読み込みエラー'));
    reader.readAsDataURL(file);
  });
}

// ===== ヘルパー：PDF → 画像 DataURL 配列 =====
async function _importLoadPdfFile(file, onProgress) {
  if (!file) throw new Error('ファイルが指定されていません');
  if (!file.type || (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name))) {
    throw new Error('PDFファイルではありません');
  }
  if (file.size > 30 * 1024 * 1024) throw new Error('PDFが大きすぎます（30MBまで）');

  // PDF.js が読み込まれているか確認
  if (typeof window.pdfjsLib === 'undefined') {
    throw new Error('PDF.jsライブラリが読み込まれていません');
  }

  // workerSrc 設定（CDN経由）
  if (window.pdfjsLib.GlobalWorkerOptions && !window.pdfjsLib.GlobalWorkerOptions.workerSrc) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
  }

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const totalPages = Math.min(pdf.numPages, IMPORT_PDF_MAX_PAGES);
  const pages = [];

  for (let i = 1; i <= totalPages; i++) {
    if (onProgress) onProgress(i, totalPages);
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: IMPORT_PDF_RENDER_SCALE });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport }).promise;
    // 1920px超なら縮小
    let dataUrl;
    const w = canvas.width, h = canvas.height;
    if (w > IMPORT_MAX_DIMENSION || h > IMPORT_MAX_DIMENSION) {
      const r = Math.min(IMPORT_MAX_DIMENSION / w, IMPORT_MAX_DIMENSION / h);
      const nw = Math.round(w * r), nh = Math.round(h * r);
      const c2 = document.createElement('canvas');
      c2.width = nw; c2.height = nh;
      const ctx2 = c2.getContext('2d');
      ctx2.fillStyle = '#ffffff';
      ctx2.fillRect(0, 0, nw, nh);
      ctx2.drawImage(canvas, 0, 0, nw, nh);
      dataUrl = c2.toDataURL('image/jpeg', IMPORT_JPEG_QUALITY);
    } else {
      dataUrl = canvas.toDataURL('image/jpeg', IMPORT_JPEG_QUALITY);
    }
    pages.push({ src: dataUrl, width: w, height: h, pageNum: i });
  }

  return pages;
}

// ===== 背景画像を現在のページに設定 =====
// opts._skipHistory=true の場合は履歴プッシをスキップ（バッチ処理用）
function setBackgroundImageOnCurrentPage(src, opts = {}) {
  const page = currentPage();
  if (!page) {
    if (typeof showToast === 'function') showToast('⚠️ ボードが準備できていません');
    return;
  }
  page.backgroundImage = {
    src,
    opacity: typeof opts.opacity === 'number' ? opts.opacity : 1,
    fit: opts.fit || 'contain',
  };
  if (typeof drawBackground === 'function') drawBackground();
  if (!opts._skipHistory && typeof pushHistory === 'function') pushHistory();
  if (typeof saveBoardToStorage === 'function') saveBoardToStorage();
  if (typeof broadcastChange === 'function') broadcastChange();
  if (typeof updatePageThumb === 'function') updatePageThumb(State.currentPageIndex);
}

// ===== 背景画像を別ページに展開（PDF複数ページ用） =====
// pages: [{src, ...}] → 現在のページに1枚目、以降は新ページに
// 履歴は最後に一度1回だけプッシ（複数ページでもワンクリック Undo で戻せる）
function distributePagesAsBackgrounds(pagesArr, opts = {}) {
  if (!Array.isArray(pagesArr) || pagesArr.length === 0) return;

  const opacity = typeof opts.opacity === 'number' ? opts.opacity : 1;
  const fit = opts.fit || 'contain';
  let added = 0;

  pagesArr.forEach((p, idx) => {
    if (idx === 0) {
      // 1枚目：現在のページにセット（履歴はスキップ）
      setBackgroundImageOnCurrentPage(p.src, { opacity, fit, _skipHistory: true });
    } else {
      // 2枚目以降：新ページを追加してセット
      if (typeof addPage === 'function') {
        addPage(State.currentPageIndex);
        // addPage 内で currentPageIndex が新ページに移動している前提
        setBackgroundImageOnCurrentPage(p.src, { opacity, fit, _skipHistory: true });
      }
    }
    added++;
  });

  // 履歴は最後に1回だけプッシ
  if (typeof pushHistory === 'function') pushHistory();

  if (typeof showToast === 'function') {
    showToast(`📄 ${added}ページを取り込みました`);
  }
}

// ===== 背景画像をクリア =====
function clearBackgroundImageOnCurrentPage() {
  const page = currentPage();
  if (!page) return;
  if (!page.backgroundImage) {
    if (typeof showToast === 'function') showToast('ℹ️ このページには背景画像がありません');
    return;
  }
  if (!confirm('このページの背景画像を削除しますか？\n（オブジェクト・付箋は残ります）')) return;
  page.backgroundImage = null;
  if (typeof drawBackground === 'function') drawBackground();
  if (typeof pushHistory === 'function') pushHistory();
  if (typeof saveBoardToStorage === 'function') saveBoardToStorage();
  if (typeof broadcastChange === 'function') broadcastChange();
  if (typeof updatePageThumb === 'function') updatePageThumb(State.currentPageIndex);
  if (typeof showToast === 'function') showToast('🗑️ 背景画像を削除しました');
}

// ===== 不透明度・配置調整 =====
function setBackgroundImageOpacity(opacity) {
  const page = currentPage();
  if (!page || !page.backgroundImage) return;
  page.backgroundImage.opacity = Math.max(0.1, Math.min(1, opacity));
  if (typeof drawBackground === 'function') drawBackground();
  if (typeof saveBoardToStorage === 'function') saveBoardToStorage();
  if (typeof broadcastChange === 'function') broadcastChange();
  if (typeof updatePageThumb === 'function') updatePageThumb(State.currentPageIndex);
}

function setBackgroundImageFit(fit) {
  const page = currentPage();
  if (!page || !page.backgroundImage) return;
  if (!['contain','cover','stretch'].includes(fit)) return;
  page.backgroundImage.fit = fit;
  if (typeof drawBackground === 'function') drawBackground();
  if (typeof saveBoardToStorage === 'function') saveBoardToStorage();
  if (typeof broadcastChange === 'function') broadcastChange();
  if (typeof updatePageThumb === 'function') updatePageThumb(State.currentPageIndex);
}

// ===== モーダル制御 =====
function openImportModal() {
  const modal = document.getElementById('modal-import');
  if (!modal) return;
  modal.classList.remove('hidden');
  // 初期状態：ファイル未選択
  _renderImportStatus('idle');
  syncImportControlsToCurrentPage();
}

function closeImportModal() {
  const modal = document.getElementById('modal-import');
  if (!modal) return;
  modal.classList.add('hidden');
}

// 現在ページに既に背景画像があれば、不透明度スライダーやフィットセレクタを同期
function syncImportControlsToCurrentPage() {
  const page = currentPage();
  const controls = document.getElementById('import-controls');
  const noImg = document.getElementById('import-no-image-msg');
  const opSlider = document.getElementById('import-opacity');
  const opValue = document.getElementById('import-opacity-value');
  const fitSel = document.getElementById('import-fit');

  if (page && page.backgroundImage && page.backgroundImage.src) {
    if (controls) controls.style.display = 'block';
    if (noImg) noImg.style.display = 'none';
    if (opSlider && opValue) {
      const op = typeof page.backgroundImage.opacity === 'number' ? page.backgroundImage.opacity : 1;
      opSlider.value = Math.round(op * 100);
      opValue.textContent = Math.round(op * 100) + '%';
    }
    if (fitSel) fitSel.value = page.backgroundImage.fit || 'contain';
  } else {
    if (controls) controls.style.display = 'none';
    if (noImg) noImg.style.display = 'block';
  }
}

function _renderImportStatus(state, detail) {
  const el = document.getElementById('import-status');
  if (!el) return;
  if (state === 'idle') {
    el.innerHTML = '';
    el.classList.remove('active');
  } else if (state === 'loading') {
    el.classList.add('active');
    el.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-2"></i>${detail || '読み込み中...'}`;
  } else if (state === 'success') {
    el.classList.add('active');
    el.innerHTML = `<i class="fa-solid fa-circle-check text-green-500 mr-2"></i>${detail || '取り込み完了'}`;
    setTimeout(() => { el.classList.remove('active'); el.innerHTML = ''; }, 2000);
  } else if (state === 'error') {
    el.classList.add('active');
    el.innerHTML = `<i class="fa-solid fa-triangle-exclamation text-red-500 mr-2"></i>${detail || 'エラーが発生しました'}`;
  }
}

// ===== ファイル処理ハンドラ =====
async function handleImportFile(file, opts = {}) {
  if (!file) return;
  const isPdf = (file.type === 'application/pdf') || /\.pdf$/i.test(file.name);
  const isImg = file.type && file.type.startsWith('image/');

  if (!isPdf && !isImg) {
    _renderImportStatus('error', 'PDFまたは画像ファイルを選んでください');
    return;
  }

  try {
    if (isPdf) {
      _renderImportStatus('loading', 'PDFを読み込み中...');
      const pages = await _importLoadPdfFile(file, (i, total) => {
        _renderImportStatus('loading', `PDFを変換中... (${i}/${total}ページ)`);
      });
      _renderImportStatus('loading', `${pages.length}ページを配置中...`);
      // 取り込みモード：複数ページなら全部別ページに、1ページなら現在ページに
      distributePagesAsBackgrounds(pages, opts);
      _renderImportStatus('success', `PDFから${pages.length}ページを取り込みました`);
      syncImportControlsToCurrentPage();
    } else {
      _renderImportStatus('loading', '画像を読み込み中...');
      const imgData = await _importLoadImageFile(file);
      setBackgroundImageOnCurrentPage(imgData.src, opts);
      _renderImportStatus('success', '画像を背景に取り込みました');
      syncImportControlsToCurrentPage();
    }
  } catch (e) {
    console.error('[import]', e);
    _renderImportStatus('error', e.message || '取り込みに失敗しました');
  }
}

// ===== モーダル内のイベント設定 =====
function setupImportModalHandlers() {
  const modal = document.getElementById('modal-import');
  if (!modal) return;

  // ファイル選択
  const fileInput = document.getElementById('import-file-input');
  if (fileInput) {
    fileInput.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (file) {
        const opacity = parseFloat(document.getElementById('import-init-opacity')?.value || '1');
        const fit = document.getElementById('import-init-fit')?.value || 'contain';
        handleImportFile(file, { opacity, fit });
      }
      e.target.value = '';
    });
  }

  // ドロップゾーン
  const dropZone = document.getElementById('import-drop-zone');
  if (dropZone) {
    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.classList.add('dragover');
    });
    dropZone.addEventListener('dragleave', () => {
      dropZone.classList.remove('dragover');
    });
    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.classList.remove('dragover');
      const file = e.dataTransfer.files && e.dataTransfer.files[0];
      if (file) {
        const opacity = parseFloat(document.getElementById('import-init-opacity')?.value || '1');
        const fit = document.getElementById('import-init-fit')?.value || 'contain';
        handleImportFile(file, { opacity, fit });
      }
    });
    dropZone.addEventListener('click', () => {
      if (fileInput) fileInput.click();
    });
  }

  // 不透明度スライダー（既に取り込み済みの調整）
  const opSlider = document.getElementById('import-opacity');
  const opValue = document.getElementById('import-opacity-value');
  if (opSlider) {
    opSlider.addEventListener('input', () => {
      const v = parseInt(opSlider.value, 10) / 100;
      if (opValue) opValue.textContent = opSlider.value + '%';
      setBackgroundImageOpacity(v);
    });
  }

  // フィット選択
  const fitSel = document.getElementById('import-fit');
  if (fitSel) {
    fitSel.addEventListener('change', () => {
      setBackgroundImageFit(fitSel.value);
    });
  }

  // 削除ボタン
  const delBtn = document.getElementById('import-delete');
  if (delBtn) {
    delBtn.addEventListener('click', () => {
      clearBackgroundImageOnCurrentPage();
      syncImportControlsToCurrentPage();
    });
  }
}

// 初期化：ページ読み込み後にハンドラ設定
if (typeof window !== 'undefined') {
  window.openImportModal = openImportModal;
  window.closeImportModal = closeImportModal;
  window.setupImportModalHandlers = setupImportModalHandlers;
  window.handleImportFile = handleImportFile;
  window.setBackgroundImageOnCurrentPage = setBackgroundImageOnCurrentPage;
  window.clearBackgroundImageOnCurrentPage = clearBackgroundImageOnCurrentPage;
  window.setBackgroundImageOpacity = setBackgroundImageOpacity;
  window.setBackgroundImageFit = setBackgroundImageFit;
  window.syncImportControlsToCurrentPage = syncImportControlsToCurrentPage;
}
