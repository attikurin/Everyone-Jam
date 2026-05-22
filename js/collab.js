/* =========================================
   みんなのジャム - Phase 3 共同編集拡張
   - 他ユーザーの選択範囲表示
   - コメント機能（コメントピン）
   - 変更履歴タイムライン（クライアント単独機能）
   ========================================= */

(function () {
  'use strict';

  // ========== 共通：自分の情報取得 ==========
  function me() {
    if (typeof window.p2pGetMe === 'function') {
      return window.p2pGetMe();
    }
    return { id: 'local', name: '自分', color: '#ff9a8b', isReady: false, peerCount: 1 };
  }

  // ========================================================
  // ★ Phase 3-2: 他ユーザーの選択範囲表示
  // ========================================================
  const RemoteSelections = new Map(); // peerId -> {nodeId, page, name, color, ts}
  let _selectionLayer = null;
  let _selThrottle = 0;

  function ensureSelectionLayer() {
    if (!State.stage) return null;
    if (_selectionLayer && _selectionLayer.getStage()) return _selectionLayer;
    _selectionLayer = new Konva.Layer({ listening: false });
    State.stage.add(_selectionLayer);
    // メインと同じ変換に追従
    syncSelectionLayerTransform();
    return _selectionLayer;
  }

  function syncSelectionLayerTransform() {
    if (!_selectionLayer || !State.mainLayer) return;
    _selectionLayer.scale(State.mainLayer.scale());
    _selectionLayer.position(State.mainLayer.position());
  }

  // 自分の選択を他者へ送信
  window.broadcastMySelection = function () {
    const m = me();
    if (!m.isReady || m.peerCount <= 1) return;
    const now = performance.now();
    if (now - _selThrottle < 80) return;
    _selThrottle = now;

    const sel = State.selected;
    let nodeId = null, bbox = null;
    if (sel) {
      nodeId = sel.id();
      // ノードの実寸クライアント座標から、ボード座標のbboxを計算
      try {
        const cr = sel.getClientRect({ relativeTo: State.mainLayer });
        bbox = { x: cr.x, y: cr.y, w: cr.width, h: cr.height };
      } catch (e) { /* ignore */ }
    }
    if (typeof window.p2pBroadcast === 'function') {
      window.p2pBroadcast({
        type: 'selection',
        from: m.id,
        name: m.name,
        color: m.color,
        page: State.currentPageIndex,
        nodeId,
        bbox,
        ts: Date.now(),
      });
    }
  };

  // 他者からの選択範囲を受信して描画
  function onRemoteSelection(msg) {
    if (!msg || !msg.from) return;
    if (msg.from === me().id) return;
    if (!msg.nodeId || !msg.bbox) {
      RemoteSelections.delete(msg.from);
    } else {
      RemoteSelections.set(msg.from, {
        nodeId: msg.nodeId,
        page: msg.page,
        name: msg.name || 'ゲスト',
        color: msg.color || '#888',
        bbox: msg.bbox,
        ts: msg.ts || Date.now(),
      });
    }
    renderRemoteSelections();
  }

  function renderRemoteSelections() {
    const layer = ensureSelectionLayer();
    if (!layer) return;
    layer.destroyChildren();
    const currentPage = State.currentPageIndex;

    RemoteSelections.forEach((sel, peerId) => {
      // 別ページの選択は非表示
      if (sel.page !== currentPage) return;
      const { x, y, w, h } = sel.bbox;
      // 選択ボックス
      const rect = new Konva.Rect({
        x, y, width: w, height: h,
        stroke: sel.color, strokeWidth: 2.5,
        dash: [8, 4],
        cornerRadius: 4,
        listening: false,
      });
      layer.add(rect);
      // 名前ラベル
      const padding = 6;
      const fontSize = 12;
      const labelText = sel.name;
      const labelW = labelText.length * fontSize * 0.7 + padding * 2;
      const labelH = fontSize + padding;
      const tag = new Konva.Group({ x: x, y: y - labelH - 2, listening: false });
      tag.add(new Konva.Rect({
        width: labelW, height: labelH,
        fill: sel.color, cornerRadius: 4,
        listening: false,
      }));
      tag.add(new Konva.Text({
        text: labelText,
        fontSize,
        fontFamily: 'M PLUS Rounded 1c',
        fontStyle: 'bold',
        fill: '#fff',
        x: padding, y: padding / 2,
        listening: false,
      }));
      layer.add(tag);
    });
    layer.batchDraw();
  }

  // 古い選択を10秒で消す
  setInterval(() => {
    const now = Date.now();
    let changed = false;
    RemoteSelections.forEach((sel, id) => {
      if (now - sel.ts > 10000) {
        RemoteSelections.delete(id);
        changed = true;
      }
    });
    if (changed) renderRemoteSelections();
  }, 3000);

  // ピアが切断されたら選択範囲も消す
  window.clearRemoteSelection = function (peerId) {
    if (RemoteSelections.delete(peerId)) renderRemoteSelections();
  };

  // ========================================================
  // ★ Phase 3-3: コメント機能
  // ========================================================
  // コメントは page.comments[] として保存（既存pages配列の各pageに付随）
  // 構造: { id, x, y, author, color, text, replies:[{id,author,color,text,ts}], resolved, ts }

  const COMMENT_TOOL_ID = '__comment_tool__';
  let _commentMode = false;
  let _activeCommentId = null;

  function ensureCommentsArray(page) {
    if (!page) return [];
    if (!Array.isArray(page.comments)) page.comments = [];
    return page.comments;
  }

  // コメントピンの追加
  function addCommentPin(boardX, boardY, text) {
    const page = State.pages[State.currentPageIndex];
    if (!page) return null;
    const comments = ensureCommentsArray(page);
    const m = me();
    const c = {
      id: 'cm_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4),
      x: boardX, y: boardY,
      author: m.name, color: m.color, authorId: m.id,
      text: text || '',
      replies: [],
      resolved: false,
      ts: Date.now(),
    };
    comments.push(c);
    saveAndBroadcast();
    renderAllComments();
    return c;
  }

  function deleteComment(commentId) {
    const page = State.pages[State.currentPageIndex];
    if (!page || !Array.isArray(page.comments)) return;
    page.comments = page.comments.filter(c => c.id !== commentId);
    saveAndBroadcast();
    renderAllComments();
    closeCommentDetail();
  }

  function addReply(commentId, text) {
    const page = State.pages[State.currentPageIndex];
    if (!page) return;
    const c = (page.comments || []).find(x => x.id === commentId);
    if (!c) return;
    const m = me();
    c.replies = c.replies || [];
    c.replies.push({
      id: 'rp_' + Math.random().toString(36).slice(2, 8),
      author: m.name, color: m.color,
      text, ts: Date.now(),
    });
    saveAndBroadcast();
    renderCommentDetail(commentId);
    renderAllComments();
  }

  function toggleResolved(commentId) {
    const page = State.pages[State.currentPageIndex];
    if (!page) return;
    const c = (page.comments || []).find(x => x.id === commentId);
    if (!c) return;
    c.resolved = !c.resolved;
    saveAndBroadcast();
    renderCommentDetail(commentId);
    renderAllComments();
  }

  function saveAndBroadcast() {
    if (typeof saveBoardToStorage === 'function') saveBoardToStorage();
    // コメント変更は通常のboard-stateに含めて全体ブロードキャスト
    if (typeof broadcastChange === 'function') broadcastChange();
    // コメントだけの軽量同期も実施
    if (typeof window.p2pBroadcast === 'function') {
      const page = State.pages[State.currentPageIndex];
      window.p2pBroadcast({
        type: 'comment-update',
        from: me().id,
        page: State.currentPageIndex,
        comments: page ? (page.comments || []) : [],
      });
    }
  }

  // 他者からのコメント更新受信
  function onRemoteCommentUpdate(msg) {
    if (!msg || msg.from === me().id) return;
    const page = State.pages[msg.page];
    if (!page) return;
    page.comments = msg.comments || [];
    if (typeof saveBoardToStorage === 'function') saveBoardToStorage();
    if (msg.page === State.currentPageIndex) renderAllComments();
  }

  // ========== コメントピンの描画（HTML overlayで実装してKonvaに干渉しない） ==========
  function ensureCommentLayer() {
    let layer = document.getElementById('comment-overlay');
    if (!layer) {
      layer = document.createElement('div');
      layer.id = 'comment-overlay';
      layer.className = 'comment-overlay';
      const wrapper = document.getElementById('canvas-wrapper');
      if (wrapper) wrapper.appendChild(layer);
    }
    return layer;
  }

  function renderAllComments() {
    const layer = ensureCommentLayer();
    layer.innerHTML = '';
    const page = State.pages[State.currentPageIndex];
    if (!page || !Array.isArray(page.comments)) return;
    page.comments.forEach(c => {
      const pin = document.createElement('button');
      pin.className = 'comment-pin' + (c.resolved ? ' resolved' : '');
      pin.dataset.id = c.id;
      pin.style.background = c.color;
      pin.title = `${c.author}: ${c.text.slice(0, 40)}${c.text.length > 40 ? '…' : ''}`;
      pin.innerHTML = c.resolved
        ? '<i class="fa-solid fa-check"></i>'
        : `<span>${(c.replies && c.replies.length) ? (c.replies.length + 1) : ''}</span>`;
      // 位置をボード座標→画面座標に変換
      positionCommentPin(pin, c.x, c.y);
      pin.addEventListener('click', (e) => {
        e.stopPropagation();
        openCommentDetail(c.id);
      });
      layer.appendChild(pin);
    });
  }

  function positionCommentPin(pin, boardX, boardY) {
    if (!State.mainLayer) return;
    const scale = State.mainLayer.scaleX();
    const x = boardX * scale + State.mainLayer.x();
    const y = boardY * scale + State.mainLayer.y();
    pin.style.left = x + 'px';
    pin.style.top = y + 'px';
  }

  // 全ピンの位置を再計算（ズーム/パン時）
  function repositionAllComments() {
    const layer = document.getElementById('comment-overlay');
    if (!layer) return;
    const page = State.pages[State.currentPageIndex];
    if (!page || !Array.isArray(page.comments)) return;
    const map = {};
    page.comments.forEach(c => { map[c.id] = c; });
    layer.querySelectorAll('.comment-pin').forEach(pin => {
      const c = map[pin.dataset.id];
      if (c) positionCommentPin(pin, c.x, c.y);
    });
  }
  // 公開（board.jsのapplyTransformから呼ぶ）
  window.repositionAllComments = repositionAllComments;
  window.renderAllComments = renderAllComments;
  window.syncCollabLayers = function () {
    syncSelectionLayerTransform();
    if (_selectionLayer) _selectionLayer.batchDraw();
    repositionAllComments();
  };

  // ========== コメント詳細モーダル ==========
  function openCommentDetail(commentId) {
    _activeCommentId = commentId;
    const modal = document.getElementById('modal-comment');
    if (!modal) return;
    modal.classList.remove('hidden');
    renderCommentDetail(commentId);
  }
  function closeCommentDetail() {
    _activeCommentId = null;
    const modal = document.getElementById('modal-comment');
    if (modal) modal.classList.add('hidden');
  }

  function renderCommentDetail(commentId) {
    const page = State.pages[State.currentPageIndex];
    if (!page) return;
    const c = (page.comments || []).find(x => x.id === commentId);
    if (!c) { closeCommentDetail(); return; }

    const titleEl = document.getElementById('comment-detail-author');
    const dateEl = document.getElementById('comment-detail-date');
    const textEl = document.getElementById('comment-detail-text');
    const repliesEl = document.getElementById('comment-detail-replies');
    const colorEl = document.getElementById('comment-detail-color');
    const resolveBtn = document.getElementById('comment-resolve');

    if (titleEl) titleEl.textContent = c.author;
    if (colorEl) colorEl.style.background = c.color;
    if (dateEl) dateEl.textContent = formatTime(c.ts);
    if (textEl) textEl.textContent = c.text;
    if (resolveBtn) {
      resolveBtn.innerHTML = c.resolved
        ? '<i class="fa-solid fa-rotate-left mr-1"></i>未解決に戻す'
        : '<i class="fa-solid fa-check mr-1"></i>解決にする';
    }
    if (repliesEl) {
      repliesEl.innerHTML = '';
      (c.replies || []).forEach(r => {
        const div = document.createElement('div');
        div.className = 'comment-reply';
        div.innerHTML = `
          <div class="reply-meta">
            <span class="reply-color" style="background:${r.color}"></span>
            <strong>${escapeHtml(r.author)}</strong>
            <span class="reply-date">${formatTime(r.ts)}</span>
          </div>
          <div class="reply-text">${escapeHtml(r.text)}</div>
        `;
        repliesEl.appendChild(div);
      });
    }
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[ch]));
  }
  function formatTime(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    const diff = Date.now() - ts;
    const min = Math.floor(diff / 60000);
    if (min < 1) return 'たった今';
    if (min < 60) return `${min}分前`;
    if (min < 1440) return `${Math.floor(min/60)}時間前`;
    return `${d.getMonth()+1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2,'0')}`;
  }

  // ========== コメントモード ==========
  window.toggleCommentMode = function (on) {
    _commentMode = (typeof on === 'boolean') ? on : !_commentMode;
    document.body.classList.toggle('comment-mode', _commentMode);
    const btn = document.getElementById('btn-comment-mode');
    if (btn) btn.classList.toggle('active', _commentMode);
    if (_commentMode && typeof showToast === 'function') {
      showToast('💬 コメントモード：ボード上をクリックでコメント追加');
    }
  };
  window.isCommentMode = function () { return _commentMode; };

  // ========================================================
  // ★ Phase 3-4: 変更履歴タイムライン
  // ========================================================
  // State.history[] はスナップショット（{title, pages}）の配列。各エントリにメタを追加
  // タイムラインビューアは右パネルに開閉式で表示
  function renderHistoryList() {
    const list = document.getElementById('history-list');
    if (!list) return;
    list.innerHTML = '';
    const items = State.history || [];
    if (items.length === 0) {
      list.innerHTML = '<div class="text-center text-xs text-gray-400 py-6">履歴がありません</div>';
      return;
    }
    // State.historyはJSON文字列の配列。各要素をパースして使う
    // 新しい順
    [...items].reverse().forEach((rawSnap, i) => {
      const realIndex = items.length - 1 - i;
      const isCurrent = realIndex === State.historyIndex;
      const snap = parseSnap(rawSnap);
      const row = document.createElement('div');
      row.className = 'history-row' + (isCurrent ? ' current' : '');
      row.innerHTML = `
        <div class="history-thumb">${renderHistoryThumb(snap)}</div>
        <div class="history-meta">
          <div class="history-label">
            ${isCurrent ? '<span class="badge-now">いま</span>' : ''}
            ステップ ${realIndex + 1}
          </div>
          <div class="history-detail">
            ${describeSnap(snap)}
          </div>
          <button class="history-jump" data-index="${realIndex}">
            <i class="fa-solid fa-rotate-left mr-1"></i>このステップに戻す
          </button>
        </div>
      `;
      list.appendChild(row);
    });
    list.querySelectorAll('.history-jump').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.index, 10);
        jumpToHistory(idx);
      });
    });
  }

  function renderHistoryThumb(snap) {
    if (!snap || !Array.isArray(snap.pages) || !snap.pages.length) {
      return '<svg viewBox="0 0 80 50" width="80" height="50"><rect width="80" height="50" fill="#f5f5f5" rx="3"/></svg>';
    }
    const page = snap.pages[Math.min(State.currentPageIndex, snap.pages.length - 1)];
    const objs = (page && page.objects) || [];
    const sx = 80 / BOARD_WIDTH;
    const sy = 50 / BOARD_HEIGHT;
    let shapes = '';
    objs.slice(0, 30).forEach(o => {
      const x = (o.x || 0) * sx, y = (o.y || 0) * sy;
      if (o.type === 'sticky') {
        const w = (o.width || 180) * sx, h = (o.height || 180) * sy;
        shapes += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${o.color || '#ffe082'}" rx="1"/>`;
      } else if (o.type === 'pen' || o.type === 'marker') {
        if (o.points && o.points.length >= 4) {
          let d = `M ${o.points[0] * sx} ${o.points[1] * sy}`;
          for (let i = 2; i < o.points.length; i += 2) d += ` L ${o.points[i] * sx} ${o.points[i+1] * sy}`;
          shapes += `<path d="${d}" stroke="${o.color || '#333'}" stroke-width="0.5" fill="none"/>`;
        }
      } else if (o.type === 'text') {
        shapes += `<rect x="${x}" y="${y}" width="20" height="3" fill="${o.color || '#333'}" opacity="0.5"/>`;
      } else if (o.type === 'rect' || o.type === 'circle' || o.type === 'triangle') {
        const w = (o.width || 40) * sx, h = (o.height || 40) * sy;
        shapes += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="${o.color || '#333'}" stroke-width="0.4"/>`;
      }
    });
    return `<svg viewBox="0 0 80 50" width="80" height="50"><rect width="80" height="50" fill="#fff" rx="3" stroke="#eee"/>${shapes}</svg>`;
  }

  function describeSnap(snap) {
    if (!snap) return '-';
    const totalPages = (snap.pages || []).length;
    let totalObjs = 0;
    (snap.pages || []).forEach(p => { totalObjs += (p.objects || []).length; });
    return `${totalPages}ページ・${totalObjs}個`;
  }

  // State.history要素はJSON文字列（pages配列のシリアライズ）。安全にパース
  function parseSnap(raw) {
    if (!raw) return { pages: [] };
    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw);
        // 旧仕様（pages配列を直接）と新仕様（{title,pages}）両対応
        if (Array.isArray(parsed)) return { pages: parsed };
        return parsed;
      } catch (e) {
        return { pages: [] };
      }
    }
    if (Array.isArray(raw)) return { pages: raw };
    return raw;
  }

  function jumpToHistory(index) {
    if (!Array.isArray(State.history) || index < 0 || index >= State.history.length) return;
    if (!confirm('このステップに戻しますか？\n（現在の内容は新しい履歴として残ります）')) return;
    const snap = parseSnap(State.history[index]);
    if (!snap || !Array.isArray(snap.pages)) return;
    // ディープコピーで復元
    if (snap.title) State.boardTitle = snap.title;
    State.pages = JSON.parse(JSON.stringify(snap.pages));
    if (State.pages.length === 0) {
      // 安全網：空ページが復元されないように1ページ補完
      State.pages.push({ id: 'p_' + Date.now(), background: 'blank', objects: [], comments: [] });
    }
    if (State.currentPageIndex >= State.pages.length) {
      State.currentPageIndex = Math.max(0, State.pages.length - 1);
    }
    // 描画リセット
    if (typeof renderCurrentPage === 'function') renderCurrentPage();
    if (typeof renderPagesList === 'function') renderPagesList();
    const titleEl = document.getElementById('board-title');
    if (titleEl) titleEl.value = State.boardTitle;
    // 新しい履歴として登録
    if (typeof pushHistory === 'function') pushHistory();
    if (typeof saveBoardToStorage === 'function') saveBoardToStorage();
    if (typeof broadcastChange === 'function') broadcastChange();
    if (typeof showToast === 'function') showToast('🕒 ステップ ' + (index+1) + ' に戻しました');
    renderHistoryList();
  }

  function openHistoryPanel() {
    const panel = document.getElementById('history-panel');
    if (!panel) return;
    panel.classList.remove('hidden');
    renderHistoryList();
  }
  function closeHistoryPanel() {
    const panel = document.getElementById('history-panel');
    if (panel) panel.classList.add('hidden');
  }

  // ========================================================
  // セットアップ
  // ========================================================
  function setup() {
    // 拡張ハンドラを登録
    if (typeof window.p2pRegisterHandler === 'function') {
      window.p2pRegisterHandler('selection', onRemoteSelection);
      window.p2pRegisterHandler('comment-update', onRemoteCommentUpdate);
    }

    // 選択レイヤー初期化
    if (State && State.stage) ensureSelectionLayer();
    document.addEventListener('mnj:page-rendered', () => {
      ensureSelectionLayer();
      renderRemoteSelections();
      renderAllComments();
    });

    // === コメントモードボタン ===
    const btnComment = document.getElementById('btn-comment-mode');
    if (btnComment) btnComment.addEventListener('click', () => window.toggleCommentMode());

    // === 履歴パネルボタン ===
    const btnHistory = document.getElementById('btn-history');
    if (btnHistory) btnHistory.addEventListener('click', openHistoryPanel);
    const btnHistoryClose = document.getElementById('history-close');
    if (btnHistoryClose) btnHistoryClose.addEventListener('click', closeHistoryPanel);

    // === コメント詳細モーダル操作 ===
    const cmModal = document.getElementById('modal-comment');
    if (cmModal) {
      cmModal.querySelectorAll('[data-close]').forEach(b => {
        b.addEventListener('click', closeCommentDetail);
      });
      cmModal.addEventListener('click', (e) => {
        if (e.target === cmModal) closeCommentDetail();
      });
    }
    const replyForm = document.getElementById('comment-reply-form');
    if (replyForm) {
      replyForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const input = document.getElementById('comment-reply-input');
        const text = (input.value || '').trim();
        if (!text || !_activeCommentId) return;
        addReply(_activeCommentId, text);
        input.value = '';
      });
    }
    const resolveBtn = document.getElementById('comment-resolve');
    if (resolveBtn) resolveBtn.addEventListener('click', () => {
      if (_activeCommentId) toggleResolved(_activeCommentId);
    });
    const deleteBtn = document.getElementById('comment-delete');
    if (deleteBtn) deleteBtn.addEventListener('click', () => {
      if (_activeCommentId && confirm('このコメントを削除しますか？')) {
        deleteComment(_activeCommentId);
      }
    });

    // === キャンバスのクリックでコメント追加（コメントモード時のみ） ===
    setupCanvasCommentClick();
  }

  function setupCanvasCommentClick() {
    // setTimeout で State.stage 初期化を待つ
    const tryAttach = () => {
      if (!State || !State.stage) {
        setTimeout(tryAttach, 200);
        return;
      }
      State.stage.on('click tap', (e) => {
        if (!_commentMode) return;
        // 既存のオブジェクト/ピン/ボタンへのクリックは除外
        if (e.target && e.target !== State.stage && e.target.id && e.target.id() !== 'bg-group') return;
        // 背景ヒットや空白のときのみ
        const pos = (typeof getPointerBoardPos === 'function') ? getPointerBoardPos() : null;
        if (!pos) return;
        const text = prompt('コメント内容を入力してください：');
        if (text == null || !text.trim()) return;
        addCommentPin(pos.x, pos.y, text.trim());
        if (typeof showToast === 'function') showToast('💬 コメントを追加しました');
      });
    };
    tryAttach();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setup);
  } else {
    setup();
  }

  // 公開API
  window.Collab = {
    addCommentPin,
    deleteComment,
    addReply,
    openHistoryPanel,
    closeHistoryPanel,
    renderHistoryList,
    jumpToHistory,
    toggleCommentMode: window.toggleCommentMode,
  };
})();
