/* =========================================
   みんなのジャム - 疑似共同編集（BroadcastChannel）
   同じブラウザの別タブ間で同期する
   ========================================= */

let syncChannel = null;
const SYNC_SOURCE_ID = 'client_' + Math.random().toString(36).slice(2, 10);
let lastBroadcast = 0;
let broadcastTimer = null;

function initSync() {
  if (!('BroadcastChannel' in window)) {
    console.warn('BroadcastChannel非対応のブラウザです（P2P共同編集は引き続き利用可能）');
    return;
  }

  try {
    syncChannel = new BroadcastChannel(STORAGE_PREFIX + State.boardId);
  } catch (err) {
    console.warn('BroadcastChannel 作成失敗:', err);
    return;
  }

  syncChannel.onmessage = (event) => {
    const msg = event.data;
    if (!msg || msg.source === SYNC_SOURCE_ID) return;

    if (msg.type === 'board-update') {
      applyRemoteUpdate(msg.data);
    } else if (msg.type === 'request-sync') {
      // 新規参加者への同期応答
      try {
        syncChannel.postMessage({
          type: 'board-update',
          source: SYNC_SOURCE_ID,
          data: { title: State.boardTitle, pages: State.pages },
        });
      } catch (e) {}
    }
  };

  // 起動時に他のタブからの現状を要求
  setTimeout(() => {
    try {
      syncChannel.postMessage({
        type: 'request-sync',
        source: SYNC_SOURCE_ID,
      });
    } catch (e) {}
  }, 300);

  // [B15修正] storageイベントは別ウィンドウ専用、自ブラウザ判定追加
  window.addEventListener('storage', (e) => {
    if (e.key !== STORAGE_PREFIX + State.boardId) return;
    if (!e.newValue || e.newValue === e.oldValue) return;
    try {
      const data = JSON.parse(e.newValue);
      // 更新時刻が新しいものだけ反映
      applyRemoteUpdate({ title: data.title, pages: data.pages });
    } catch (err) {}
  });
}

function broadcastChange() {
  if (State.applyingRemote) return; // リモート適用中は再送しない

  // スロットリング
  const now = Date.now();
  if (now - lastBroadcast < 80) {
    clearTimeout(broadcastTimer);
    broadcastTimer = setTimeout(() => doBroadcast(), 100);
    return;
  }
  lastBroadcast = now;
  doBroadcast();
}

function doBroadcast() {
  // BroadcastChannel（同一ブラウザ内タブ間）
  if (syncChannel) {
    try {
      syncChannel.postMessage({
        type: 'board-update',
        source: SYNC_SOURCE_ID,
        data: { title: State.boardTitle, pages: State.pages },
      });
    } catch (err) {
      console.warn('broadcast失敗:', err);
    }
  }
  // P2P（別端末・ブラウザ間の本格的共同編集）
  if (typeof p2pBroadcastChange === 'function') {
    try { p2pBroadcastChange(); } catch (e) {}
  }
  flashSyncIndicator();
}

function broadcastViewChange() {
  // ビューの変更は各自のビューを維持（現在は何もしない）
}

function applyRemoteUpdate(data) {
  if (!data || !data.pages || !Array.isArray(data.pages)) return;

  // 現在の状態と比較（無変化ならスキップ）
  const incoming = JSON.stringify(data.pages);
  const current = JSON.stringify(State.pages);
  const titleSame = (data.title === State.boardTitle);
  if (incoming === current && titleSame) return;

  // リモート適用中フラグでループ防止
  State.applyingRemote = true;
  try {
    if (data.title !== undefined && data.title !== State.boardTitle) {
      State.boardTitle = data.title;
      const titleInput = document.getElementById('board-title');
      if (titleInput && document.activeElement !== titleInput) {
        titleInput.value = data.title;
      }
    }
    State.pages = data.pages;
    if (State.currentPageIndex >= State.pages.length) {
      State.currentPageIndex = State.pages.length - 1;
    }
    if (State.currentPageIndex < 0) State.currentPageIndex = 0;
    renderCurrentPage();
    renderPagesList();

    // localStorageへも反映（履歴には積まない）
    try {
      localStorage.setItem(STORAGE_PREFIX + State.boardId, JSON.stringify({
        id: State.boardId,
        title: State.boardTitle,
        pages: State.pages,
        updatedAt: Date.now(),
      }));
    } catch (e) {}
    flashSyncIndicator();
  } finally {
    State.applyingRemote = false;
  }
}

let flashTimer = null;
function flashSyncIndicator() {
  // インジケーターのドットを一瞬光らせる（接続状態の色とは独立）
  const ind = document.getElementById('sync-indicator');
  if (!ind) return;
  const dot = ind.querySelector('span.w-2');
  if (!dot) return;
  dot.classList.remove('animate-pulse');
  // reflow
  void dot.offsetWidth;
  dot.classList.add('animate-pulse');
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => {
    // pulseは持続させる（接続状態を表すため）
  }, 700);
}
