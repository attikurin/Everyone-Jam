/* =========================================
   みんなのジャム - アプリ初期化とイベント設定
   ========================================= */

// ===== PWA: Service Worker 登録（Phase 6 / v1.6.0） =====
// オフライン動作・ホーム画面追加・古いキャッシュ自動更新に対応
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js', { scope: './' })
      .then(reg => {
        console.log('[PWA] Service Worker 登録成功:', reg.scope);

        // 更新検知：新しいSWがインストールされたらユーザーに通知
        reg.addEventListener('updatefound', () => {
          const newSW = reg.installing;
          if (!newSW) return;
          newSW.addEventListener('statechange', () => {
            if (newSW.state === 'installed' && navigator.serviceWorker.controller) {
              console.log('[PWA] 新しいバージョンが利用可能');
              showUpdateBanner(reg);
            }
          });
        });

        // 1時間ごとに更新チェック（長時間使用するセッション向け）
        setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
      })
      .catch(err => console.warn('[PWA] Service Worker 登録失敗:', err));

    // SWからのメッセージ受信
    navigator.serviceWorker.addEventListener('message', (event) => {
      const msg = event.data || {};
      if (msg.type === 'CACHE_CLEARED') {
        if (typeof showToast === 'function') showToast('🔄 キャッシュをクリアしました。再読み込みします…');
        setTimeout(() => location.reload(), 800);
      }
    });

    // 制御権が変わったら（新SWが有効化されたら）リロード推奨
    let _reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (_reloading) return;
      _reloading = true;
      console.log('[PWA] SW更新を反映するためリロード');
      // ユーザーの作業中は強制リロードしない（バナー経由）
    });
  });
}

// 新バージョン通知バナー
function showUpdateBanner(reg) {
  // 重複防止
  if (document.getElementById('pwa-update-banner')) return;
  const banner = document.createElement('div');
  banner.id = 'pwa-update-banner';
  banner.innerHTML = `
    <span><i class="fa-solid fa-sparkles"></i> 新しいバージョンが利用可能です</span>
    <button id="pwa-update-now" class="pwa-update-btn">今すぐ更新</button>
    <button id="pwa-update-later" class="pwa-update-btn pwa-update-btn-secondary">あとで</button>
  `;
  document.body.appendChild(banner);
  document.getElementById('pwa-update-now').addEventListener('click', () => {
    if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
    setTimeout(() => location.reload(), 400);
  });
  document.getElementById('pwa-update-later').addEventListener('click', () => {
    banner.remove();
  });
}

// ===== PWA: オンライン/オフライン状態の表示 =====
window.addEventListener('online', () => updateOnlineStatus(true));
window.addEventListener('offline', () => updateOnlineStatus(false));
function updateOnlineStatus(isOnline) {
  document.body.classList.toggle('is-offline', !isOnline);
  const badge = document.getElementById('offline-badge');
  if (badge) badge.style.display = isOnline ? 'none' : 'inline-flex';
  if (typeof showToast === 'function') {
    showToast(isOnline ? '🌐 オンラインに戻りました' : '📡 オフラインです（ローカル保存は継続します）');
  }
}
// 初期状態を反映
document.addEventListener('DOMContentLoaded', () => {
  updateOnlineStatus(navigator.onLine);
});

// ===== PWA: インストール促進（beforeinstallprompt） =====
let _deferredInstallPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  _deferredInstallPrompt = e;
  window._deferredInstallPrompt = e; // 他モジュールから参照可能に
  const btn = document.getElementById('btn-pwa-install');
  if (btn) btn.style.display = 'inline-flex';
  const btnMobile = document.getElementById('btn-pwa-install-mobile');
  if (btnMobile) btnMobile.style.display = 'flex';
  console.log('[PWA] インストール可能');
});
window.addEventListener('appinstalled', () => {
  console.log('[PWA] インストール完了');
  _deferredInstallPrompt = null;
  window._deferredInstallPrompt = null;
  const btn = document.getElementById('btn-pwa-install');
  if (btn) btn.style.display = 'none';
  const btnMobile = document.getElementById('btn-pwa-install-mobile');
  if (btnMobile) btnMobile.style.display = 'none';
  if (typeof showToast === 'function') showToast('🎉 ホーム画面に追加しました！');
});

// 「インストール」ボタンが押されたら
async function promptPwaInstall() {
  if (!_deferredInstallPrompt) {
    // iOS Safariはbeforeinstallpromptが無いので案内のみ
    if (/iPhone|iPad|iPod/.test(navigator.userAgent)) {
      alert('iPhone/iPadの場合：\n\n1. Safariの「共有」ボタン（□↑）をタップ\n2. 「ホーム画面に追加」をタップ\n\nアプリのように使えます！');
    } else {
      alert('お使いのブラウザではインストール案内が表示できません。\nメニュー → 「アプリをインストール」「ホーム画面に追加」を探してください。');
    }
    return;
  }
  _deferredInstallPrompt.prompt();
  const result = await _deferredInstallPrompt.userChoice;
  console.log('[PWA] ユーザー選択:', result.outcome);
  _deferredInstallPrompt = null;
}
window.promptPwaInstall = promptPwaInstall;

document.addEventListener('DOMContentLoaded', init);

// 初期化済みかどうか（重複初期化防止）
let _appInitialized = false;

function init() {
  try {
    // 起動診断ログ（Publish環境で問題があったときの確認用）
    console.log('[みんなのジャム v1.10.0] 起動診断:');
    console.log('  現在のURL:', window.location.href);
    console.log('  search:', window.location.search);
    console.log('  pathname:', window.location.pathname);

    // URLからボードIDを取得（無ければnull）
    const idFromUrl = getBoardId();
    console.log('  getBoardId()の結果:', idFromUrl);

    // スタート画面のイベントハンドラはいつでも有効化
    setupStartScreenHandlers();

    if (!idFromUrl) {
      // URLに ?board= が無い → スタート画面を表示して、選択を待つ
      console.log('  → スタート画面を表示します');
      showStartScreen();
      return;
    }

    // ボードIDが指定されていれば、そのボードでアプリを起動
    console.log('  → boardId="' + idFromUrl + '" でアプリ起動');
    bootApp(idFromUrl);
  } catch (err) {
    console.error('初期化エラー:', err);
    alert('アプリの初期化に失敗しました。ページを再読み込みしてください。\n' + err.message);
  }
}

// 指定されたboardIdでアプリ本体を起動する
function bootApp(boardId) {
  if (_appInitialized) {
    // 既に他のボードで起動済 → ボード切替
    switchToBoard(boardId);
    return;
  }
  _appInitialized = true;

  State.boardId = boardId;
  setBoardIdInUrl(boardId);

  // 既存データ読み込み
  const saved = loadBoardFromStorage(boardId);
  if (saved && saved.pages && Array.isArray(saved.pages) && saved.pages.length > 0) {
    State.pages = saved.pages;
    State.boardTitle = saved.title || '新しいボード';
  } else {
    State.pages = [createNewPage()];
    State.boardTitle = '新しいボード';
  }
  State.currentPageIndex = 0;
  const titleInput = document.getElementById('board-title');
  if (titleInput) titleInput.value = State.boardTitle;

  // Konvaステージ初期化
  initStage();

  // レンダリング
  renderCurrentPage();
  renderPagesList();

  // 初期履歴
  State.history = [];
  State.historyIndex = -1;
  pushHistory();

  // 初回保存（新規ボードでもlocalStorageに登録 → 整理機能のメタ更新が機能する）
  if (!saved) {
    try { saveBoardToStorage(); } catch (e) {}
  }

  // 同期初期化
  initSync();
  if (typeof initP2P === 'function') {
    try { initP2P(); } catch (e) { console.warn('P2P初期化失敗:', e); }
  }

  // イベント設定
  setupEventHandlers();
  if (typeof setupCollabUIHandlers === 'function') setupCollabUIHandlers();

  // ツール初期化
  renderToolOptions('select');

  // ウェルカムメッセージ
  if (!saved) {
    setTimeout(() => {
      showToast('👋 みんなのジャムへようこそ！左のツールで描いてみてください', 4000);
    }, 500);
  }
}

// 編集中に別のボードへ切り替える（リロードで実現）
function switchToBoard(boardId) {
  // 念のため現在のボードを保存
  try { saveBoardToStorage(); } catch (e) {}
  // P2P 接続をクリーンに切断
  try {
    if (typeof P2P !== 'undefined' && P2P.peer) {
      P2P.connections.forEach(c => { try { c.close(); } catch (_) {} });
      try { P2P.peer.destroy(); } catch (_) {}
    }
  } catch (e) {}
  // URLを書き換えてリロード（一番安全）
  const url = new URL(window.location);
  url.searchParams.set('board', boardId);
  window.location.href = url.toString();
}

// ===== スタート画面 =====
function showStartScreen() {
  const modal = document.getElementById('modal-start');
  if (!modal) return;
  renderRecentBoards('recent-boards', 'recent-empty', 'recent-count');
  modal.classList.remove('hidden');
}

function hideStartScreen() {
  const modal = document.getElementById('modal-start');
  if (modal) modal.classList.add('hidden');
}

// 最近のボード一覧を表示
function renderRecentBoards(listId, emptyId, countId) {
  const list = document.getElementById(listId);
  const empty = document.getElementById(emptyId);
  const count = countId ? document.getElementById(countId) : null;
  if (!list) return;

  const boards = listSavedBoards();
  list.innerHTML = '';
  if (count) count.textContent = boards.length > 0 ? `${boards.length}件` : '';

  if (boards.length === 0) {
    if (empty) empty.classList.remove('hidden');
    return;
  }
  if (empty) empty.classList.add('hidden');

  boards.forEach(b => {
    const row = document.createElement('div');
    row.className = 'flex items-center gap-2 bg-white rounded-lg px-3 py-2 hover:shadow-sm transition cursor-pointer group border border-transparent hover:border-orange-200';
    row.innerHTML = `
      <i class="fa-regular fa-file-lines text-orange-300 text-lg"></i>
      <div class="flex-1 min-w-0">
        <div class="text-sm font-bold text-gray-800 truncate">${escapeHtmlSafe(b.title)}</div>
        <div class="text-[10px] text-gray-400">
          ${b.pageCount}ページ・${formatRelativeTime(b.updatedAt)}
        </div>
      </div>
      <button class="open-btn px-2 py-1 text-[11px] font-bold text-orange-500 hover:bg-orange-50 rounded">開く</button>
      <button class="del-btn px-1.5 py-1 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded opacity-0 group-hover:opacity-100 transition" title="削除">
        <i class="fa-regular fa-trash-can text-xs"></i>
      </button>
    `;
    row.addEventListener('click', (e) => {
      if (e.target.closest('.del-btn')) return;
      openBoard(b.id);
    });
    row.querySelector('.del-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      if (confirm(`「${b.title}」を削除しますか？\nこの操作は取り消せません。`)) {
        deleteBoardFromStorage(b.id);
        renderRecentBoards(listId, emptyId, countId);
        showToast('🗑️ ボードを削除しました');
      }
    });
    list.appendChild(row);
  });
}

function escapeHtmlSafe(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}

function formatRelativeTime(ts) {
  if (!ts) return '日時不明';
  const diff = Date.now() - ts;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return 'たった今';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}分前`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour}時間前`;
  const day = Math.floor(hour / 24);
  if (day < 30) return `${day}日前`;
  const d = new Date(ts);
  return `${d.getFullYear()}/${(d.getMonth()+1)}/${d.getDate()}`;
}

function openBoard(boardId) {
  if (_appInitialized) {
    switchToBoard(boardId);
  } else {
    setBoardIdInUrl(boardId);
    hideStartScreen();
    bootApp(boardId);
  }
}

function createAndOpenNewBoard() {
  const id = generateNewBoardId();
  openBoard(id);
}

function joinByInviteUrl(rawUrl) {
  if (!rawUrl || !String(rawUrl).trim()) {
    showToast('⚠️ 招待URLを貼り付けてください');
    return;
  }
  let id = null;
  try {
    const u = new URL(rawUrl.trim());
    id = u.searchParams.get('board');
  } catch (e) {
    // URLとしてパースできない場合、boardパラメータだけのケースをサポート
    const m = String(rawUrl).match(/[?&]board=([^&\s]+)/);
    if (m) id = decodeURIComponent(m[1]);
    else if (/^[a-zA-Z0-9_-]+$/.test(rawUrl.trim())) id = rawUrl.trim();
  }
  if (!id) {
    showToast('⚠️ 招待URLが正しくありません');
    return;
  }
  openBoard(id);
}

function setupStartScreenHandlers() {
  const btnNew = document.getElementById('btn-create-new');
  if (btnNew) btnNew.addEventListener('click', createAndOpenNewBoard);

  const btnNew2 = document.getElementById('btn-create-new-2');
  if (btnNew2) btnNew2.addEventListener('click', () => {
    document.getElementById('modal-board-list').classList.add('hidden');
    createAndOpenNewBoard();
  });

  const joinInput = document.getElementById('join-url');
  const btnJoin = document.getElementById('btn-join');
  if (btnJoin && joinInput) {
    btnJoin.addEventListener('click', () => joinByInviteUrl(joinInput.value));
    joinInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        joinByInviteUrl(joinInput.value);
      }
      e.stopPropagation();
    });
    // ペースト即実行はせず、ユーザーがボタン押下する形にする
  }
}

function setupEventHandlers() {
  // ツールバー
  document.querySelectorAll('.tool-btn').forEach(btn => {
    // data-tool を持たない特殊ボタン（テンプレートなど）は除外
    if (!btn.dataset.tool) return;
    btn.addEventListener('click', () => setTool(btn.dataset.tool));
  });

  // 教材テンプレートボタン（Phase 7）
  const btnTplOpen = document.getElementById('btn-tool-template');
  if (btnTplOpen) {
    btnTplOpen.addEventListener('click', () => {
      if (typeof window.openTemplateModal === 'function') {
        window.openTemplateModal();
      }
    });
  }

  // 教材取り込みボタン（Phase 8）
  const btnImportOpen = document.getElementById('btn-tool-import');
  if (btnImportOpen) {
    btnImportOpen.addEventListener('click', () => {
      if (typeof window.openImportModal === 'function') {
        window.openImportModal();
      }
    });
  }
  // インポートモーダル内のイベント設定
  if (typeof window.setupImportModalHandlers === 'function') {
    window.setupImportModalHandlers();
  }

  // OCR（手書き文字認識）ボタン - Phase 9
  const btnOcrOpen = document.getElementById('btn-tool-ocr');
  if (btnOcrOpen) {
    btnOcrOpen.addEventListener('click', () => {
      if (typeof window.toggleOcrMode === 'function') {
        // ドラッグ選択モードをONに（もう一度押すとOFF）
        window.toggleOcrMode();
      } else if (typeof window.openOcrModal === 'function') {
        // フォールバック: 画像アップロードから始める為モーダルだけ開く
        window.openOcrModal();
      } else {
        console.warn('[OCR] ocr.js が読み込まれていません');
      }
    });
  }
  // OCRモーダル内のイベント設定
  if (typeof window.setupOcrModalHandlers === 'function') {
    window.setupOcrModalHandlers();
  }

  // 投票・挙手ボタン - Phase 10
  const btnPollOpen = document.getElementById('btn-tool-poll');
  if (btnPollOpen) {
    btnPollOpen.addEventListener('click', () => {
      if (typeof window.openPollCreatorModal === 'function') {
        window.openPollCreatorModal('poll');
      } else {
        console.warn('[poll] poll.js が読み込まれていません');
      }
    });
  }
  // 投票モーダル内のイベント設定
  if (typeof window.setupPollModalHandlers === 'function') {
    window.setupPollModalHandlers();
  }

  // ヘッダー
  document.getElementById('btn-undo').addEventListener('click', undo);
  document.getElementById('btn-redo').addEventListener('click', redo);
  document.getElementById('btn-clear').addEventListener('click', () => {
    const page = currentPage();
    if (!page) return;
    if (page.objects.length === 0) {
      showToast('ℹ️ このページはすでに空です');
      return;
    }
    if (confirm('このページの内容をすべて消去しますか？')) {
      page.objects = [];
      renderCurrentPage();
      pushHistory();
      saveBoardToStorage();
      broadcastChange();
      updatePageThumb(State.currentPageIndex);
      showToast('🧹 ページをクリアしました');
    }
  });
  document.getElementById('btn-export').addEventListener('click', () => {
    document.getElementById('modal-export').classList.remove('hidden');
  });
  document.getElementById('btn-help').addEventListener('click', () => {
    document.getElementById('modal-help').classList.remove('hidden');
    // 開く度に最初のタブにリセットしない（ユーザーが開いた最後のタブを保持）
  });

  // PWAインストールボタン（デスクトップ）
  const btnPwaInstall = document.getElementById('btn-pwa-install');
  if (btnPwaInstall) {
    btnPwaInstall.addEventListener('click', () => {
      if (window._deferredInstallPrompt || typeof window.promptPwaInstall === 'function') {
        window.promptPwaInstall();
      } else {
        showPwaInstallGuide();
      }
    });
  }

  // ヘルプモーダルのタブ切替（v1.5.0）
  document.querySelectorAll('#help-tabs .help-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.tab;
      // タブのアクティブ切替
      document.querySelectorAll('#help-tabs .help-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      // コンテンツの切替
      document.querySelectorAll('.help-tab-content').forEach(content => {
        if (content.dataset.tab === target) {
          content.classList.remove('hidden');
        } else {
          content.classList.add('hidden');
        }
      });
    });
  });

  // 新しいボード（ヘッダー）
  const btnNewBoard = document.getElementById('btn-new-board');
  if (btnNewBoard) {
    btnNewBoard.addEventListener('click', () => {
      if (confirm('新しいボードを作りますか？\n（今のボードは自動的に保存されます）')) {
        createAndOpenNewBoard();
      }
    });
  }

  // ボード一覧（ヘッダー）
  const btnBoardList = document.getElementById('btn-board-list');
  if (btnBoardList) {
    btnBoardList.addEventListener('click', () => {
      const container = document.getElementById('recent-boards-2');
      const emptyEl = document.getElementById('recent-empty-2');
      if (emptyEl) emptyEl.classList.add('hidden');
      if (container && typeof renderBoardListUI === 'function') {
        // v1.5.0: タグ・教科・学年で検索フィルタ可能な新UI
        renderBoardListUI(container, {
          onOpen: openBoard,
          onDelete: (id) => {
            deleteBoardFromStorage(id);
            if (typeof showToast === 'function') showToast('🗑️ ボードを削除しました');
          },
        });
      } else if (container) {
        renderRecentBoards('recent-boards-2', 'recent-empty-2', null);
      }
      document.getElementById('modal-board-list').classList.remove('hidden');
    });
  }

  // タイトル
  const titleInput = document.getElementById('board-title');
  let titleSaveTimer = null;
  titleInput.addEventListener('input', (e) => {
    State.boardTitle = e.target.value;
    clearTimeout(titleSaveTimer);
    titleSaveTimer = setTimeout(() => {
      saveBoardToStorage();
      broadcastChange();
    }, 300);
  });
  titleInput.addEventListener('blur', () => {
    if (!State.boardTitle.trim()) {
      State.boardTitle = '新しいボード';
      titleInput.value = State.boardTitle;
      saveBoardToStorage();
      broadcastChange();
    }
  });
  // Enterでフォーカス外す
  titleInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      titleInput.blur();
    }
    e.stopPropagation();
  });

  // ズーム
  document.getElementById('btn-zoom-in').addEventListener('click', () => zoom(0.15));
  document.getElementById('btn-zoom-out').addEventListener('click', () => zoom(-0.15));
  document.getElementById('btn-zoom-fit').addEventListener('click', fitToScreen);

  // ページ追加
  document.getElementById('btn-add-page').addEventListener('click', () => addPage());

  // 画像アップロード
  document.getElementById('image-upload').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) loadImageFile(file);
    e.target.value = '';
  });

  // ドラッグ＆ドロップ画像
  const canvasWrapper = document.getElementById('canvas-wrapper');
  canvasWrapper.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  });
  canvasWrapper.addEventListener('drop', (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files && e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      loadImageFile(file, e);
    }
  });

  // ペーストで画像
  document.addEventListener('paste', (e) => {
    // テキスト編集中は無視
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type && item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) loadImageFile(file);
        break;
      }
    }
  });

  // モーダル閉じる
  document.querySelectorAll('.modal-close').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = document.getElementById(btn.dataset.close);
      if (target) target.classList.add('hidden');
    });
  });
  document.querySelectorAll('.modal-backdrop').forEach(m => {
    m.addEventListener('click', (e) => {
      // スタート画面はバックドロップクリックで閉じない（必ず何か選択させる）
      if (m.id === 'modal-start') return;
      if (e.target === m) m.classList.add('hidden');
    });
  });

  // エクスポートカード
  document.querySelectorAll('.export-card').forEach(card => {
    card.addEventListener('click', async () => {
      document.getElementById('modal-export').classList.add('hidden');
      const type = card.dataset.export;
      try {
        if (type === 'png-current') await exportCurrentPagePNG();
        else if (type === 'png-all') await exportAllPagesPNG();
        else if (type === 'pdf') await exportPDF();
        else if (type === 'json') exportJSON();
      } catch (err) {
        console.error(err);
        showToast('⚠️ 書き出しに失敗しました');
      }
    });
  });

  // JSONインポート
  document.getElementById('import-json').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      importJSON(file);
      document.getElementById('modal-export').classList.add('hidden');
    }
    e.target.value = '';
  });

  // コンテキストメニュー
  document.querySelectorAll('.ctx-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      const action = item.dataset.ctx;
      if (action === 'front') bringToFront();
      else if (action === 'back') sendToBack();
      else if (action === 'duplicate') duplicateSelected();
      else if (action === 'delete') deleteSelected();
      else if (action === 'lock') {
        if (State.selected && typeof toggleObjectLock === 'function') {
          toggleObjectLock(State.selected.id());
        }
      }
      hideContextMenu();
    });
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('#context-menu')) hideContextMenu();
  });
  // 右クリック時も空白でメニュー閉じる
  document.addEventListener('contextmenu', (e) => {
    // キャンバス内は個別処理、それ以外は標準動作許可
    if (!e.target.closest('#canvas-wrapper')) {
      hideContextMenu();
    }
  });

  // キーボードショートカット
  document.addEventListener('keydown', (e) => {
    // テキスト入力中（INPUT/TEXTAREA/contenteditable）は無視
    const tag = e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target.isContentEditable) return;
    // スタート画面表示中もショートカットは無効
    if (!_appInitialized) return;

    // Ctrl/Cmd 系
    if (e.ctrlKey || e.metaKey) {
      const k = e.key.toLowerCase();
      if (k === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo(); else undo();
        return;
      }
      if (k === 'y') {
        e.preventDefault();
        redo();
        return;
      }
      if (k === 'd') {
        e.preventDefault();
        duplicateSelected();
        return;
      }
      if (k === 's') {
        e.preventDefault();
        // スタート画面表示中はCtrl+Sでエクスポートを開かない
        if (!_appInitialized) return;
        // [B22修正] 他のモーダルが開いていたら閉じてからエクスポートを開く
        document.querySelectorAll('.modal-backdrop').forEach(m => {
          if (m.id === 'modal-start') return;
          m.classList.add('hidden');
        });
        document.getElementById('modal-export').classList.remove('hidden');
        return;
      }
      return;
    }

    // 単体キー
    const map = {
      v: 'select', p: 'pen', m: 'marker', e: 'eraser',
      s: 'sticky', t: 'text',
    };
    const k = e.key.toLowerCase();
    if (map[k]) {
      e.preventDefault();
      setTool(map[k]);
      return;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (State.transformer && State.transformer.nodes().length) {
        e.preventDefault();
        deleteSelected();
      }
    }
    if (e.key === 'Escape') {
      clearSelection();
      hideContextMenu();
      document.querySelectorAll('.modal-backdrop').forEach(m => {
        // スタート画面はESCでも閉じない（必ず何か選択させる）
        if (m.id === 'modal-start') return;
        m.classList.add('hidden');
      });
    }
  });

  // ウィンドウ閉じる前の保存保証
  window.addEventListener('beforeunload', () => {
    try { saveBoardToStorage(); } catch (e) {}
  });

  // ===== モバイル/タブレット対応 (v1.5.1) =====
  setupMobileMenu();
}

// =========================================
// モバイル/タブレット: ハンバーガーメニュー + ボトムシート
// =========================================
function setupMobileMenu() {
  const drawer = document.getElementById('mobile-drawer');
  const drawerBackdrop = document.getElementById('mobile-drawer-backdrop');
  const btnOpen = document.getElementById('btn-mobile-menu');
  const btnClose = document.getElementById('btn-mobile-close');

  if (!drawer || !btnOpen) return;

  // ドロワー開閉
  function openDrawer() {
    drawer.classList.remove('hidden');
    drawer.classList.remove('closing');
    syncMobileStatus();
    // モバイルメニューを開く時、他のフロート系UI（ツールオプション）と衝突しないよう自動閉じはしない
  }
  function closeDrawer() {
    drawer.classList.add('closing');
    setTimeout(() => {
      drawer.classList.add('hidden');
      drawer.classList.remove('closing');
    }, 180);
  }
  btnOpen.addEventListener('click', openDrawer);
  if (btnClose) btnClose.addEventListener('click', closeDrawer);
  if (drawerBackdrop) drawerBackdrop.addEventListener('click', closeDrawer);

  // 各メニュー項目のアクション → 既存ボタンへディスパッチ
  drawer.querySelectorAll('.mobile-menu-item[data-action]').forEach(item => {
    item.addEventListener('click', () => {
      const action = item.dataset.action;
      // メニューを閉じてから実行（モーダルが開く時のフォーカス問題を避ける）
      closeDrawer();
      // アニメーション完了を待ってから実行
      setTimeout(() => dispatchMobileAction(action), 200);
    });
  });

  // モバイル用ページボトムシート
  const sheet = document.getElementById('mobile-pages-sheet');
  const sheetBackdrop = document.getElementById('mobile-pages-backdrop');
  const btnSheetClose = document.getElementById('btn-mobile-pages-close');
  const btnAddPageMobile = document.getElementById('mobile-btn-add-page');

  function openPagesSheet() {
    if (!sheet) return;
    sheet.classList.remove('hidden');
    sheet.classList.remove('closing');
    renderMobilePagesList();
  }
  function closePagesSheet() {
    if (!sheet) return;
    sheet.classList.add('closing');
    setTimeout(() => {
      sheet.classList.add('hidden');
      sheet.classList.remove('closing');
    }, 200);
  }
  if (btnSheetClose) btnSheetClose.addEventListener('click', closePagesSheet);
  if (sheetBackdrop) sheetBackdrop.addEventListener('click', closePagesSheet);
  if (btnAddPageMobile) {
    btnAddPageMobile.addEventListener('click', () => {
      const btn = document.getElementById('btn-add-page');
      if (btn) btn.click();
      // 追加後に再描画
      setTimeout(renderMobilePagesList, 60);
    });
  }

  // モバイルメニューハンドラを公開（他モジュールからも閉じられるように）
  window._mobileCloseDrawer = closeDrawer;
  window._mobileOpenPagesSheet = openPagesSheet;
  window._mobileClosePagesSheet = closePagesSheet;
  window._mobileRenderPages = renderMobilePagesList;

  // 初期状態を同期
  syncMobileStatus();

  // ヘッダーの sync/teacher-mode 変化を監視（軽量な定期同期）
  setInterval(syncMobileStatus, 1500);
}

// モバイル用：データアクションを既存UIにディスパッチ
function dispatchMobileAction(action) {
  const map = {
    'new-board':    'btn-new-board',
    'board-list':   'btn-board-list',
    'export':       'btn-export',
    'clear':        'btn-clear',
    'teacher-mode': 'btn-teacher-mode',
    'timer':        'btn-timer',
    'comment':      'btn-comment-mode',
    'history':      'btn-history',
    'dashboard':    'btn-dashboard',
    'help':         'btn-help',
  };
  if (action === 'pages') {
    if (typeof window._mobileOpenPagesSheet === 'function') window._mobileOpenPagesSheet();
    return;
  }
  if (action === 'pwa-install') {
    if (typeof window.promptPwaInstall === 'function') window.promptPwaInstall();
    return;
  }
  if (action === 'pwa-install-guide') {
    showPwaInstallGuide();
    return;
  }
  if (action === 'template-gallery') {
    if (typeof window.openTemplateModal === 'function') window.openTemplateModal();
    return;
  }
  if (action === 'import-material') {
    if (typeof window.openImportModal === 'function') window.openImportModal();
    return;
  }
  if (action === 'ocr') {
    // Phase 9: 手書き文字認識を起動
    if (typeof window.toggleOcrMode === 'function') {
      window.toggleOcrMode(true);
      // モバイルではドラッグ選択しにくいので、ファイルアップロード主体のモーダルも開く
      if (typeof window.openOcrModal === 'function') {
        setTimeout(() => window.openOcrModal(), 100);
      }
    } else if (typeof window.openOcrModal === 'function') {
      window.openOcrModal();
    }
    return;
  }
  if (action === 'poll') {
    // Phase 10: 投票カードを作成
    if (typeof window.openPollCreatorModal === 'function') {
      window.openPollCreatorModal('poll');
    } else {
      console.warn('[poll] poll.js が読み込まれていません');
    }
    return;
  }
  if (action === 'handsup') {
    // Phase 10: 挙手モード（YES/NO即答）
    if (typeof window.openPollCreatorModal === 'function') {
      window.openPollCreatorModal('handsup');
    } else {
      console.warn('[poll] poll.js が読み込まれていません');
    }
    return;
  }
  const id = map[action];
  if (!id) return;
  const btn = document.getElementById(id);
  if (btn) {
    btn.click();
  } else if (action === 'dashboard' && typeof window.openTeacherDashboard === 'function') {
    // ダッシュボードボタンがまだ生成されていなければ直接呼び出す
    window.openTeacherDashboard();
  } else {
    console.warn('[mobile] アクションに対応するボタンが見つかりません:', action, id);
  }
}

// モバイル用：接続状態・モード・ページ数の同期
function syncMobileStatus() {
  // 同期インジケータ
  const mainDot   = document.getElementById('sync-dot');
  const mainLabel = document.getElementById('sync-label');
  const mDot      = document.getElementById('mobile-sync-dot');
  const mLabel    = document.getElementById('mobile-sync-label');
  const mStatus   = document.getElementById('mobile-sync-status');
  if (mainLabel && mLabel) mLabel.textContent = mainLabel.textContent;
  if (mainDot && mDot) {
    // クラス継承（背景色がインラインの場合もある）
    mDot.className = mainDot.className.replace(/w-2 h-2 /, 'inline-block w-2 h-2 mr-2 ');
  }
  if (mStatus && mainLabel) {
    const txt = mainLabel.textContent || '';
    if (/接続|オンライン|共同/.test(txt) && !/オフライン|未接続|切断/.test(txt)) {
      mStatus.classList.add('is-online');
      mStatus.classList.remove('is-offline');
    } else {
      mStatus.classList.add('is-offline');
      mStatus.classList.remove('is-online');
    }
  }

  // 先生/生徒モードラベル
  const modeLabelMain = document.querySelector('#btn-teacher-mode .mode-label');
  const modeLabelMob  = document.getElementById('mobile-mode-label');
  if (modeLabelMain && modeLabelMob) modeLabelMob.textContent = modeLabelMain.textContent;

  // ページ数
  const pageCountMain = document.getElementById('page-count');
  const pageCountMob  = document.getElementById('mobile-page-count');
  if (pageCountMain && pageCountMob) pageCountMob.textContent = pageCountMain.textContent;
}

// モバイル用：ページ一覧（ボトムシート）レンダリング
function renderMobilePagesList() {
  const container = document.getElementById('mobile-pages-list');
  if (!container) return;
  if (!State || !Array.isArray(State.pages)) {
    container.innerHTML = '<div class="text-center text-gray-400 text-sm py-8">ページがありません</div>';
    return;
  }
  container.innerHTML = '';
  State.pages.forEach((page, idx) => {
    const card = document.createElement('button');
    card.className = 'mobile-page-card' + (idx === State.currentPageIndex ? ' active' : '');
    card.innerHTML = `
      <span class="page-num">${idx + 1}</span>
      ${State.pages.length > 1 ? `<span class="page-del" data-del="${idx}" title="削除"><i class="fa-solid fa-xmark"></i></span>` : ''}
    `;
    card.addEventListener('click', (e) => {
      // 削除ボタンの判定
      if (e.target.closest('[data-del]')) {
        e.stopPropagation();
        if (State.pages.length <= 1) return;
        if (confirm(`ページ ${idx + 1} を削除しますか？`)) {
          State.pages.splice(idx, 1);
          if (State.currentPageIndex >= State.pages.length) {
            State.currentPageIndex = State.pages.length - 1;
          }
          if (typeof renderCurrentPage === 'function') renderCurrentPage();
          if (typeof renderPagesList === 'function') renderPagesList();
          if (typeof saveBoardToStorage === 'function') saveBoardToStorage();
          renderMobilePagesList();
        }
        return;
      }
      // ページ切替
      if (idx !== State.currentPageIndex) {
        State.currentPageIndex = idx;
        if (typeof renderCurrentPage === 'function') renderCurrentPage();
        if (typeof renderPagesList === 'function') renderPagesList();
        renderMobilePagesList();
      }
      // 切替後、シートを閉じる
      if (typeof window._mobileClosePagesSheet === 'function') {
        setTimeout(window._mobileClosePagesSheet, 150);
      }
    });
    container.appendChild(card);
  });
}

// =========================================
// PWA: インストール案内ダイアログ
// =========================================
function showPwaInstallGuide() {
  // 既存ダイアログがあれば閉じる
  const existing = document.getElementById('pwa-install-modal');
  if (existing) existing.remove();

  const ua = navigator.userAgent;
  const isIOS = /iPhone|iPad|iPod/.test(ua);
  const isAndroid = /Android/.test(ua);
  const isChrome = /Chrome\//.test(ua) && !/Edg\//.test(ua);
  const isSafari = /Safari/.test(ua) && !/Chrome|CriOS|FxiOS/.test(ua);
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches
                    || window.navigator.standalone === true;

  let content;
  if (isStandalone) {
    content = `
      <div class="text-center py-4">
        <i class="fa-solid fa-circle-check text-5xl text-green-500 mb-3"></i>
        <h3 class="text-lg font-bold text-gray-800 mb-2">既にアプリとしてインストール済みです 🎉</h3>
        <p class="text-sm text-gray-600">ホーム画面のアイコンから起動しています。</p>
      </div>`;
  } else if (isIOS) {
    content = `
      <h3 class="text-base font-bold text-gray-800 mb-3"><i class="fa-brands fa-apple text-gray-600 mr-1"></i> iPhone / iPad での追加方法</h3>
      <ol class="text-sm text-gray-700 space-y-3 list-decimal pl-5">
        <li>下のメニューバーにある <strong>共有ボタン <i class="fa-solid fa-arrow-up-from-bracket text-blue-500"></i></strong> をタップ</li>
        <li>メニューを下にスクロールし、<strong>「ホーム画面に追加」</strong>をタップ</li>
        <li>右上の <strong>「追加」</strong>をタップ</li>
      </ol>
      <p class="text-xs text-gray-500 mt-3"><i class="fa-solid fa-info-circle"></i> Safariブラウザでお試しください。Chromeアプリ内では追加できません。</p>`;
  } else if (isAndroid && isChrome) {
    content = `
      <h3 class="text-base font-bold text-gray-800 mb-3"><i class="fa-brands fa-android text-green-600 mr-1"></i> Android Chrome での追加方法</h3>
      <ol class="text-sm text-gray-700 space-y-3 list-decimal pl-5">
        <li>右上の <strong>メニュー（⋮）</strong>をタップ</li>
        <li><strong>「アプリをインストール」</strong>または<strong>「ホーム画面に追加」</strong>をタップ</li>
        <li>確認画面で <strong>「インストール」</strong>をタップ</li>
      </ol>
      <button id="pwa-guide-install-now" class="mt-4 w-full py-2.5 rounded-lg bg-orange-400 hover:bg-orange-500 text-white font-bold transition">
        <i class="fa-solid fa-download mr-1"></i>今すぐインストール
      </button>`;
  } else {
    content = `
      <h3 class="text-base font-bold text-gray-800 mb-3"><i class="fa-solid fa-desktop text-gray-600 mr-1"></i> パソコンでの追加方法</h3>
      <ol class="text-sm text-gray-700 space-y-3 list-decimal pl-5">
        <li>アドレスバー右側の <strong>インストールアイコン <i class="fa-solid fa-download text-blue-500"></i></strong> をクリック</li>
        <li>または、ブラウザメニューから <strong>「インストール」</strong>を選択</li>
        <li>確認画面で <strong>「インストール」</strong>をクリック</li>
      </ol>
      <p class="text-xs text-gray-500 mt-3"><i class="fa-solid fa-lightbulb text-yellow-500"></i> インストールするとデスクトップにアイコンができ、アプリのように使えます。</p>
      <button id="pwa-guide-install-now" class="mt-4 w-full py-2.5 rounded-lg bg-orange-400 hover:bg-orange-500 text-white font-bold transition">
        <i class="fa-solid fa-download mr-1"></i>今すぐインストール
      </button>`;
  }

  const modal = document.createElement('div');
  modal.id = 'pwa-install-modal';
  modal.className = 'fixed inset-0 z-50 flex items-center justify-center p-4';
  modal.innerHTML = `
    <div class="absolute inset-0 bg-black/40" data-close></div>
    <div class="relative bg-white rounded-2xl shadow-2xl max-w-md w-full p-5">
      <button class="absolute top-2 right-2 header-btn" data-close aria-label="閉じる"><i class="fa-solid fa-xmark"></i></button>
      <div class="flex items-center gap-3 mb-3">
        <img src="icons/icon-192.png" alt="" class="w-12 h-12 rounded-xl shadow" onerror="this.style.display='none'" />
        <div>
          <h2 class="text-lg font-extrabold text-gray-800">アプリとして使う</h2>
          <p class="text-xs text-gray-500">ホーム画面に追加すると、ブラウザを開かなくても起動できます。オフラインでも動きます。</p>
        </div>
      </div>
      <div class="border-t border-gray-100 pt-4">${content}</div>
    </div>
  `;
  document.body.appendChild(modal);

  // 閉じる
  modal.querySelectorAll('[data-close]').forEach(el => {
    el.addEventListener('click', () => modal.remove());
  });

  // 「今すぐインストール」ボタン
  const installNow = modal.querySelector('#pwa-guide-install-now');
  if (installNow) {
    installNow.addEventListener('click', () => {
      modal.remove();
      if (typeof window.promptPwaInstall === 'function') window.promptPwaInstall();
    });
  }
}
window.showPwaInstallGuide = showPwaInstallGuide;

// ===== 画像読み込み =====
function loadImageFile(file, dropEvent) {
  if (!file || !file.type || !file.type.startsWith('image/')) {
    showToast('⚠️ 画像ファイルを選んでください');
    return;
  }
  // 10MB超はエラー
  if (file.size > 10 * 1024 * 1024) {
    showToast('⚠️ 画像が大きすぎます（10MBまで）');
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      let w = img.width;
      let h = img.height;
      if (w < 1 || h < 1) {
        showToast('⚠️ 画像の読み込みに失敗しました');
        return;
      }
      const max = 600;
      if (w > max || h > max) {
        const ratio = Math.min(max / w, max / h);
        w = Math.round(w * ratio);
        h = Math.round(h * ratio);
      }
      // 配置位置
      let x = (BOARD_WIDTH - w) / 2;
      let y = (BOARD_HEIGHT - h) / 2;
      if (dropEvent) {
        const rect = State.stage.container().getBoundingClientRect();
        const px = dropEvent.clientX - rect.left;
        const py = dropEvent.clientY - rect.top;
        x = (px - State.panX) / State.scale - w / 2;
        y = (py - State.panY) / State.scale - h / 2;
      }
      // ボード範囲内にクランプ
      x = Math.max(-w / 2, Math.min(BOARD_WIDTH - w / 2, x));
      y = Math.max(-h / 2, Math.min(BOARD_HEIGHT - h / 2, y));

      // [B21修正] ストレージ容量節約のためJPEGで圧縮（透過が必要な場合はPNGに）
      try {
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        // 透過サポート判定：PNG/GIF/WebPなら透過保持
        const needAlpha = /png|gif|webp|svg/i.test(file.type);
        let compressedSrc;
        if (needAlpha) {
          ctx.clearRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);
          compressedSrc = canvas.toDataURL('image/png');
        } else {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);
          compressedSrc = canvas.toDataURL('image/jpeg', 0.85);
        }

        addObjectToPage({
          id: uid(),
          type: 'image',
          x, y,
          width: w,
          height: h,
          src: compressedSrc,
        });
        showToast('🖼️ 画像を追加しました');
      } catch (err) {
        console.error(err);
        showToast('⚠️ 画像の処理に失敗しました');
      }
    };
    img.onerror = () => {
      showToast('⚠️ 画像の読み込みに失敗しました');
    };
    img.src = e.target.result;
  };
  reader.onerror = () => {
    showToast('⚠️ ファイル読み込みに失敗しました');
  };
  reader.readAsDataURL(file);
}

// ===== 共同編集 UI ハンドラ =====
// 共同編集の主要ハンドラは js/p2p.js 内の setupShareUI() / setupCursorLayer() で扱う。
// 互換性のため空のスタブを残す。
function setupCollabUIHandlers() {
  // no-op (handled by p2p.js)
}
