/* =========================================
   みんなのジャム - 本格的な共同編集 (WebRTC + PeerJS)
   -----------------------------------------
   ・スター型トポロジ：最初に入った人がホスト、後から来た人はホストへ接続
   ・ホストは全クライアントへメッセージを中継（リレー）
   ・URLの ?board=xxx を共有すると、誰でも同じボードに参加可能
   ・カーソル位置／参加者プレゼンス／全体スナップショットを送受信
   ・ホスト切断時は新ホスト昇格を試みる
   ========================================= */

const P2P = {
  peer: null,
  myId: null,
  hostId: null,
  isHost: false,
  connections: new Map(),
  hostConn: null,
  peers: new Map(),
  me: { name: '', color: '' },
  ready: false,
  reconnecting: false,
  cursorThrottle: 0,
  cursorLayer: null,
  cursors: new Map(),
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:global.stun.twilio.com:3478' },
  ],
};

const PRESENCE_COLORS = [
  '#FF6F61', '#FF9A76', '#9B7EBD', '#4FB6CA',
  '#7BC470', '#F2B33D', '#E76F9D', '#5B8DEF',
];

const ANIMAL_NAMES = [
  'うさぎ', 'くま', 'ねこ', 'いぬ', 'きつね', 'たぬき', 'りす', 'ぱんだ',
  'こあら', 'ぞう', 'らいおん', 'とら', 'ぺんぎん', 'いるか', 'くじら', 'ふくろう',
];

function loadOrCreateIdentity() {
  let myColor = localStorage.getItem('minnanojam_my_color');
  let myName = localStorage.getItem('minnanojam_my_name');
  if (!myColor) {
    myColor = PRESENCE_COLORS[Math.floor(Math.random() * PRESENCE_COLORS.length)];
    localStorage.setItem('minnanojam_my_color', myColor);
  }
  if (!myName) {
    myName = ANIMAL_NAMES[Math.floor(Math.random() * ANIMAL_NAMES.length)] + 'の先生';
    localStorage.setItem('minnanojam_my_name', myName);
  }
  P2P.me.color = myColor;
  P2P.me.name = myName;
}

function makeHostPeerId(boardId) {
  const cleaned = String(boardId).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40);
  return 'mnj-host-' + cleaned;
}
function makeClientPeerId() {
  return 'mnj-c-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

// ====== 初期化 ======
function initP2P() {
  if (typeof Peer === 'undefined') {
    console.warn('PeerJS が読み込まれていません。共同編集は無効です。');
    setSyncState('offline', 'オフライン');
    return;
  }
  loadOrCreateIdentity();
  setupShareUI();
  setupCursorLayer();
  setSyncState('connecting', '接続中…');
  tryBecomeHost();
}

function tryBecomeHost() {
  const hostPeerId = makeHostPeerId(State.boardId);
  P2P.hostId = hostPeerId;

  let peer;
  try {
    peer = new Peer(hostPeerId, {
      debug: 0,
      config: { iceServers: P2P.iceServers },
    });
  } catch (e) {
    console.warn('Peer生成失敗:', e);
    setSyncState('offline', '共同編集 利用不可');
    return;
  }

  peer.on('open', (id) => {
    P2P.peer = peer;
    P2P.myId = id;
    P2P.isHost = true;
    P2P.ready = true;
    setSyncState('online', 'ホスト：あなた');
    addPresence(P2P.myId, { name: P2P.me.name, color: P2P.me.color, joinedAt: Date.now(), self: true });
    updateConnectionUI();
  });

  peer.on('connection', (conn) => handleIncomingConnection(conn));

  peer.on('error', (err) => {
    if (err && (err.type === 'unavailable-id' || /is taken|is unavailable/i.test(err.message || ''))) {
      try { peer.destroy(); } catch (_) {}
      connectAsClient();
    } else if (err && err.type === 'network') {
      setSyncState('offline', 'ネット未接続');
      scheduleReconnect();
    } else if (err && err.type === 'browser-incompatible') {
      setSyncState('offline', '共同編集 非対応');
    } else if (err && err.type === 'server-error') {
      setSyncState('offline', 'サーバーエラー');
      scheduleReconnect();
    } else {
      console.warn('PeerJSエラー:', err);
    }
  });

  peer.on('disconnected', () => {
    setSyncState('connecting', '再接続中…');
    try { peer.reconnect(); } catch (_) {}
  });

  peer.on('close', () => {
    setSyncState('offline', '切断されました');
  });
}

function connectAsClient() {
  const clientId = makeClientPeerId();
  let peer;
  try {
    peer = new Peer(clientId, {
      debug: 0,
      config: { iceServers: P2P.iceServers },
    });
  } catch (e) {
    setSyncState('offline', '共同編集 利用不可');
    return;
  }

  peer.on('open', (id) => {
    P2P.peer = peer;
    P2P.myId = id;
    P2P.isHost = false;
    addPresence(id, { name: P2P.me.name, color: P2P.me.color, joinedAt: Date.now(), self: true });

    const conn = peer.connect(P2P.hostId, {
      reliable: true,
      metadata: { name: P2P.me.name, color: P2P.me.color },
    });
    P2P.hostConn = conn;
    setupClientConnection(conn);
  });

  peer.on('connection', (conn) => handleIncomingConnection(conn));

  peer.on('error', (err) => {
    if (err && err.type === 'peer-unavailable') {
      try { peer.destroy(); } catch (_) {}
      setTimeout(() => tryBecomeHost(), 300 + Math.random() * 700);
    } else if (err && err.type === 'network') {
      setSyncState('offline', 'ネット未接続');
      scheduleReconnect();
    } else {
      console.warn('PeerJSクライアントエラー:', err);
    }
  });

  peer.on('disconnected', () => {
    setSyncState('connecting', '再接続中…');
    try { peer.reconnect(); } catch (_) {}
  });
}

function setupClientConnection(conn) {
  conn.on('open', () => {
    P2P.ready = true;
    setSyncState('online', 'みんなと接続中');
    safeSend(conn, { type: 'hello', from: P2P.myId, name: P2P.me.name, color: P2P.me.color });
    safeSend(conn, { type: 'request-snapshot', from: P2P.myId });
    updateConnectionUI();
  });
  conn.on('data', (data) => onMessageFromHost(data));
  conn.on('close', () => {
    setSyncState('connecting', 'ホストが切れました');
    setTimeout(() => tryBecomeHost(), 400 + Math.random() * 1200);
  });
  conn.on('error', (err) => console.warn('クライアント接続エラー:', err));
}

function handleIncomingConnection(conn) {
  conn.on('open', () => {
    P2P.connections.set(conn.peer, conn);
    const meta = conn.metadata || {};
    addPresence(conn.peer, {
      name: meta.name || '名無しさん',
      color: meta.color || '#888',
      joinedAt: Date.now(),
    });

    if (P2P.isHost) {
      safeSend(conn, {
        type: 'snapshot',
        from: P2P.myId,
        title: State.boardTitle,
        pages: State.pages,
        peers: Array.from(P2P.peers.entries()).map(([id, p]) => ({ id, name: p.name, color: p.color })),
        hostId: P2P.myId,
      });
      relayToOthers(conn.peer, {
        type: 'peer-joined',
        peerId: conn.peer,
        name: meta.name,
        color: meta.color,
      });
      showToast('👋 ' + (meta.name || 'ゲスト') + ' さんが参加しました');
    }
    updateConnectionUI();
  });

  conn.on('data', (data) => {
    if (P2P.isHost) onMessageAtHost(conn, data);
    else onMessageFromHost(data);
  });

  conn.on('close', () => {
    P2P.connections.delete(conn.peer);
    if (P2P.isHost) {
      relayToOthers(null, { type: 'peer-left', peerId: conn.peer });
    }
    removePresence(conn.peer);
    removeRemoteCursor(conn.peer);
    updateConnectionUI();
  });

  conn.on('error', (err) => console.warn('接続エラー:', err));
}

// ====== メッセージ ======
function onMessageAtHost(conn, msg) {
  if (!msg || !msg.type) return;
  switch (msg.type) {
    case 'hello': break;
    case 'request-snapshot':
      safeSend(conn, {
        type: 'snapshot',
        from: P2P.myId,
        title: State.boardTitle,
        pages: State.pages,
        peers: Array.from(P2P.peers.entries()).map(([id, p]) => ({ id, name: p.name, color: p.color })),
        hostId: P2P.myId,
      });
      break;
    case 'state-update':
      applyRemoteFullState(msg);
      relayToOthers(conn.peer, msg);
      break;
    case 'cursor':
      relayToOthers(conn.peer, msg);
      drawRemoteCursor(msg);
      break;
    case 'presence':
      updatePresence(msg.from, { name: msg.name, color: msg.color });
      relayToOthers(conn.peer, msg);
      break;
    case 'selection':
    case 'comment-update':
    case 'poll-vote':
      // 拡張メッセージは外部ハンドラに委譲＋他者へ中継
      relayToOthers(conn.peer, msg);
      handleExtMessage(msg);
      break;
  }
}

function onMessageFromHost(msg) {
  if (!msg || !msg.type) return;
  switch (msg.type) {
    case 'snapshot':
      if (Array.isArray(msg.peers)) {
        msg.peers.forEach(p => {
          if (p.id !== P2P.myId) addPresence(p.id, { name: p.name, color: p.color, joinedAt: Date.now() });
        });
      }
      P2P.hostId = msg.hostId || P2P.hostId;
      applyHostSnapshot(msg);
      updateConnectionUI();
      break;
    case 'state-update': applyRemoteFullState(msg); break;
    case 'cursor': drawRemoteCursor(msg); break;
    case 'selection':
    case 'comment-update':
    case 'poll-vote':
      handleExtMessage(msg);
      break;
    case 'peer-joined':
      addPresence(msg.peerId, { name: msg.name, color: msg.color, joinedAt: Date.now() });
      updateConnectionUI();
      showToast('👋 ' + (msg.name || 'ゲスト') + ' さんが参加しました');
      break;
    case 'peer-left':
      removePresence(msg.peerId);
      removeRemoteCursor(msg.peerId);
      updateConnectionUI();
      break;
    case 'presence':
      updatePresence(msg.from, { name: msg.name, color: msg.color });
      updateConnectionUI();
      break;
  }
}

function relayToOthers(excludePeerId, msg) {
  P2P.connections.forEach((c, peerId) => {
    if (peerId === excludePeerId) return;
    safeSend(c, msg);
  });
}

// ====== ボード適用 ======
function applyHostSnapshot(msg) {
  State.applyingRemote = true;
  try {
    if (typeof msg.title === 'string') {
      State.boardTitle = msg.title;
      const titleInput = document.getElementById('board-title');
      if (titleInput && document.activeElement !== titleInput) titleInput.value = msg.title;
    }
    if (Array.isArray(msg.pages) && msg.pages.length > 0) {
      State.pages = msg.pages;
      if (State.currentPageIndex >= State.pages.length) State.currentPageIndex = State.pages.length - 1;
      if (State.currentPageIndex < 0) State.currentPageIndex = 0;
      renderCurrentPage();
      renderPagesList();
      try {
        localStorage.setItem(STORAGE_PREFIX + State.boardId, JSON.stringify({
          id: State.boardId, title: State.boardTitle, pages: State.pages, updatedAt: Date.now(),
        }));
      } catch (_) {}
    }
    flashConnIndicator();
  } finally {
    State.applyingRemote = false;
  }
}

function applyRemoteFullState(msg) {
  if (typeof applyRemoteUpdate === 'function') {
    applyRemoteUpdate({ title: msg.title, pages: msg.pages });
  } else {
    applyHostSnapshot(msg);
  }
}

// ====== 配信 ======
let p2pBroadcastTimer = null;
function p2pBroadcast() {
  if (!P2P.peer || !P2P.ready) return;
  if (State.applyingRemote) return;
  clearTimeout(p2pBroadcastTimer);
  p2pBroadcastTimer = setTimeout(() => {
    const msg = {
      type: 'state-update', from: P2P.myId,
      title: State.boardTitle, pages: State.pages, ts: Date.now(),
    };
    if (P2P.isHost) {
      P2P.connections.forEach(c => safeSend(c, msg));
    } else if (P2P.hostConn && P2P.hostConn.open) {
      safeSend(P2P.hostConn, msg);
    }
    flashConnIndicator();
  }, 80);
}

function p2pSendCursor(boardX, boardY, visible) {
  if (!P2P.peer || !P2P.ready) return;
  if (P2P.peers.size <= 1) return;
  const now = performance.now();
  if (now - P2P.cursorThrottle < 50) return;
  P2P.cursorThrottle = now;
  const msg = {
    type: 'cursor', from: P2P.myId,
    name: P2P.me.name, color: P2P.me.color,
    x: boardX, y: boardY, visible: !!visible,
    page: State.currentPageIndex, ts: Date.now(),
  };
  if (P2P.isHost) {
    P2P.connections.forEach(c => safeSend(c, msg));
  } else if (P2P.hostConn && P2P.hostConn.open) {
    safeSend(P2P.hostConn, msg);
  }
}

function safeSend(conn, msg) {
  if (!conn || !conn.open) return;
  try { conn.send(msg); } catch (e) { console.warn('送信失敗:', e); }
}

// ====== 拡張メッセージ機構（Phase3: 選択範囲・コメント・履歴ジャンプ） ======
const _extHandlers = {};
window.p2pRegisterHandler = function (type, fn) {
  _extHandlers[type] = fn;
};
function handleExtMessage(msg) {
  const fn = _extHandlers[msg.type];
  if (typeof fn === 'function') {
    try { fn(msg); } catch (e) { console.warn('拡張ハンドラ例外:', msg.type, e); }
  }
}

// 汎用ブロードキャスト（cursor以外の任意メッセージ）
window.p2pBroadcast = function (msg) {
  if (!P2P.peer || !P2P.ready || !msg || !msg.type) return;
  if (P2P.peers.size <= 1) return;
  msg.from = msg.from || P2P.myId;
  if (P2P.isHost) {
    P2P.connections.forEach(c => safeSend(c, msg));
  } else if (P2P.hostConn && P2P.hostConn.open) {
    safeSend(P2P.hostConn, msg);
  }
};

// 自分の情報取得（外部から）
window.p2pGetMe = function () {
  return {
    id: P2P.myId,
    name: (P2P.me && P2P.me.name) || 'ゲスト',
    color: (P2P.me && P2P.me.color) || '#ff9a8b',
    isReady: !!P2P.ready,
    peerCount: P2P.peers.size,
  };
};

// ====== プレゼンス ======
function addPresence(peerId, info) {
  P2P.peers.set(peerId, Object.assign({}, P2P.peers.get(peerId) || {}, info));
  updateConnectionUI();
}
function updatePresence(peerId, patch) {
  if (!peerId) return;
  const cur = P2P.peers.get(peerId) || {};
  P2P.peers.set(peerId, Object.assign(cur, patch));
  updateConnectionUI();
}
function removePresence(peerId) {
  P2P.peers.delete(peerId);
  updateConnectionUI();
}

// ====== UI ======
function setSyncState(state, label) {
  const ind = document.getElementById('sync-indicator');
  const dot = document.getElementById('sync-dot');
  const labelEl = document.getElementById('sync-label');
  if (!ind || !dot || !labelEl) return;
  ind.classList.remove('hidden');
  ind.classList.remove('bg-gray-100', 'text-gray-500',
    'bg-orange-100', 'text-orange-600',
    'bg-green-50', 'text-green-600',
    'bg-red-50', 'text-red-500');
  dot.classList.remove('bg-gray-400', 'bg-orange-500', 'bg-green-500', 'bg-red-500');
  if (state === 'online') {
    ind.classList.add('bg-green-50', 'text-green-600');
    dot.classList.add('bg-green-500');
  } else if (state === 'connecting') {
    ind.classList.add('bg-orange-100', 'text-orange-600');
    dot.classList.add('bg-orange-500');
  } else {
    ind.classList.add('bg-red-50', 'text-red-500');
    dot.classList.add('bg-red-500');
  }
  labelEl.textContent = label || '';
}

let _flashTmr = null;
function flashConnIndicator() {
  const ind = document.getElementById('sync-indicator');
  const dot = document.getElementById('sync-dot');
  if (!ind || !dot) return;
  const wasGreen = ind.classList.contains('bg-green-50');
  ind.classList.remove('bg-green-50', 'text-green-600');
  ind.classList.add('bg-orange-100', 'text-orange-600');
  dot.classList.remove('bg-green-500');
  dot.classList.add('bg-orange-500');
  clearTimeout(_flashTmr);
  _flashTmr = setTimeout(() => {
    if (wasGreen) {
      ind.classList.remove('bg-orange-100', 'text-orange-600');
      ind.classList.add('bg-green-50', 'text-green-600');
      dot.classList.remove('bg-orange-500');
      dot.classList.add('bg-green-500');
    }
  }, 400);
}

function updateConnectionUI() {
  const avatarsEl = document.getElementById('user-avatars');
  if (avatarsEl) {
    avatarsEl.innerHTML = '';
    const list = Array.from(P2P.peers.entries()).slice(0, 5);
    list.forEach(([id, p]) => {
      const a = document.createElement('div');
      a.className = 'avatar-chip';
      a.style.background = p.color;
      a.title = (p.name || '?') + (p.self ? '（あなた）' : '');
      a.textContent = (p.name || '?').trim().slice(0, 1);
      avatarsEl.appendChild(a);
    });
    if (P2P.peers.size > 5) {
      const more = document.createElement('div');
      more.className = 'avatar-chip avatar-more';
      more.textContent = '+' + (P2P.peers.size - 5);
      avatarsEl.appendChild(more);
    }
    avatarsEl.classList.toggle('hidden', P2P.peers.size === 0);
  }

  const status = document.getElementById('conn-status');
  const role = document.getElementById('conn-role');
  const count = document.getElementById('conn-count');
  if (status) status.textContent = P2P.ready ? 'オンライン' : '接続中…';
  if (role) role.textContent = P2P.isHost ? 'ホスト（あなた）' : 'ゲスト';
  if (count) count.textContent = (P2P.peers.size || 1) + '人';

  const usersList = document.getElementById('users-list');
  if (usersList) {
    usersList.innerHTML = '';
    Array.from(P2P.peers.entries()).forEach(([id, p]) => {
      const row = document.createElement('div');
      row.className = 'flex items-center gap-2 text-xs';
      row.innerHTML = `
        <span class="w-3 h-3 rounded-full inline-block" style="background:${p.color}"></span>
        <span class="font-bold">${escapeHtml(p.name || '名無しさん')}</span>
        ${p.self ? '<span class="text-gray-400">（あなた）</span>' : ''}
      `;
      usersList.appendChild(row);
    });
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}

// ====== 共有ダイアログ ======
function setupShareUI() {
  const btnShare = document.getElementById('btn-share');
  const modal = document.getElementById('modal-share');
  const urlInput = document.getElementById('share-url');
  const copyBtn = document.getElementById('btn-copy-url');
  const myNameInput = document.getElementById('my-name');
  const myColorChip = document.getElementById('my-color-chip');

  if (myColorChip) myColorChip.style.background = P2P.me.color;
  if (myNameInput) myNameInput.value = P2P.me.name;

  if (btnShare && modal && urlInput) {
    btnShare.addEventListener('click', () => {
      const url = new URL(window.location.href);
      url.searchParams.set('board', State.boardId);
      urlInput.value = url.toString();
      modal.classList.remove('hidden');
      updateConnectionUI();
    });
  }

  if (copyBtn && urlInput) {
    copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(urlInput.value);
        showToast('🔗 招待リンクをコピーしました');
      } catch (e) {
        urlInput.select();
        try { document.execCommand('copy'); showToast('🔗 招待リンクをコピーしました'); } catch (_) {}
      }
    });
  }

  if (myNameInput) {
    let nameTimer = null;
    myNameInput.addEventListener('input', () => {
      clearTimeout(nameTimer);
      nameTimer = setTimeout(() => {
        const newName = myNameInput.value.trim() || (ANIMAL_NAMES[0] + 'の先生');
        P2P.me.name = newName;
        localStorage.setItem('minnanojam_my_name', newName);
        if (P2P.myId) updatePresence(P2P.myId, { name: newName, self: true });
        broadcastPresence();
      }, 250);
    });
    myNameInput.addEventListener('keydown', (e) => e.stopPropagation());
  }

  if (myColorChip) {
    myColorChip.style.cursor = 'pointer';
    myColorChip.title = 'クリックで色を変更';
    myColorChip.addEventListener('click', () => {
      const idx = (PRESENCE_COLORS.indexOf(P2P.me.color) + 1) % PRESENCE_COLORS.length;
      P2P.me.color = PRESENCE_COLORS[idx];
      localStorage.setItem('minnanojam_my_color', P2P.me.color);
      myColorChip.style.background = P2P.me.color;
      if (P2P.myId) updatePresence(P2P.myId, { color: P2P.me.color, self: true });
      broadcastPresence();
    });
  }
}

function broadcastPresence() {
  if (!P2P.peer || !P2P.ready) return;
  const msg = { type: 'presence', from: P2P.myId, name: P2P.me.name, color: P2P.me.color };
  if (P2P.isHost) {
    P2P.connections.forEach(c => safeSend(c, msg));
  } else if (P2P.hostConn && P2P.hostConn.open) {
    safeSend(P2P.hostConn, msg);
  }
}

// ====== カーソル描画 ======
function setupCursorLayer() {
  setTimeout(() => {
    if (!State.stage) return;
    P2P.cursorLayer = new Konva.Layer({ listening: false });
    State.stage.add(P2P.cursorLayer);
    // 既存の pan/zoom を即時反映
    P2P.cursorLayer.scale({ x: State.scale, y: State.scale });
    P2P.cursorLayer.position({ x: State.panX, y: State.panY });

    State.stage.on('mousemove touchmove', () => {
      const pos = (typeof getPointerBoardPos === 'function') ? getPointerBoardPos() : null;
      if (!pos) return;
      p2pSendCursor(pos.x, pos.y, true);
    });
    const container = State.stage.container();
    if (container) {
      container.addEventListener('mouseleave', () => {
        p2pSendCursor(0, 0, false);
      });
    }
    setInterval(cleanStaleCursors, 3000);
  }, 200);
}

function drawRemoteCursor(msg) {
  if (!msg || msg.from === P2P.myId) return;
  if (!P2P.cursorLayer) return;
  if (msg.page !== undefined && msg.page !== State.currentPageIndex) {
    removeRemoteCursor(msg.from);
    return;
  }
  if (!msg.visible) {
    removeRemoteCursor(msg.from);
    return;
  }

  let cur = P2P.cursors.get(msg.from);
  if (!cur) {
    const group = new Konva.Group({ listening: false });
    const arrow = new Konva.Path({
      data: 'M 0 0 L 0 18 L 5 13 L 8 20 L 11 19 L 8 12 L 14 12 Z',
      fill: msg.color || '#FF6F61',
      stroke: '#fff',
      strokeWidth: 1.5,
      shadowColor: 'rgba(0,0,0,0.3)',
      shadowBlur: 4,
      shadowOffset: { x: 1, y: 1 },
    });
    const labelBg = new Konva.Rect({
      x: 14, y: 12, cornerRadius: 6,
      fill: msg.color || '#FF6F61',
    });
    const text = new Konva.Text({
      x: 18, y: 14,
      text: msg.name || '誰か',
      fontSize: 12,
      fontFamily: '"M PLUS Rounded 1c", sans-serif',
      fontStyle: 'bold',
      fill: '#fff',
    });
    labelBg.width(text.width() + 8);
    labelBg.height(text.height() + 4);

    group.add(arrow);
    group.add(labelBg);
    group.add(text);
    P2P.cursorLayer.add(group);

    cur = { group, arrow, labelBg, text, lastTs: Date.now() };
    P2P.cursors.set(msg.from, cur);
  } else {
    cur.arrow.fill(msg.color || cur.arrow.fill());
    cur.labelBg.fill(msg.color || cur.labelBg.fill());
    if (cur.text.text() !== (msg.name || '誰か')) {
      cur.text.text(msg.name || '誰か');
      cur.labelBg.width(cur.text.width() + 8);
    }
  }
  cur.group.position({ x: msg.x, y: msg.y });
  cur.lastTs = Date.now();
  P2P.cursorLayer.batchDraw();
}

function removeRemoteCursor(peerId) {
  const cur = P2P.cursors.get(peerId);
  if (!cur) return;
  try { cur.group.destroy(); } catch (_) {}
  P2P.cursors.delete(peerId);
  if (P2P.cursorLayer) P2P.cursorLayer.batchDraw();
}

function cleanStaleCursors() {
  const now = Date.now();
  P2P.cursors.forEach((cur, id) => {
    if (now - cur.lastTs > 8000) removeRemoteCursor(id);
  });
}

function clearAllRemoteCursors() {
  P2P.cursors.forEach((cur) => { try { cur.group.destroy(); } catch (_) {} });
  P2P.cursors.clear();
  if (P2P.cursorLayer) P2P.cursorLayer.batchDraw();
}

// ====== 再接続 ======
let reconnectTimer = null;
function scheduleReconnect() {
  if (P2P.reconnecting) return;
  P2P.reconnecting = true;
  clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(() => {
    P2P.reconnecting = false;
    tryBecomeHost();
  }, 3000);
}

window.addEventListener('beforeunload', () => {
  try {
    P2P.connections.forEach(c => { try { c.close(); } catch (_) {} });
    if (P2P.peer) P2P.peer.destroy();
  } catch (_) {}
});

// 既存のsync.jsから呼ばれるエイリアス
function p2pBroadcastChange() {
  return p2pBroadcast();
}
