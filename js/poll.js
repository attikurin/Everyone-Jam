/* =========================================
   みんなのジャム - 投票・挙手機能
   v1.10.0 / Phase 10
   ========================================= */
/*
  授業で全員参加型の問いかけをするための投票カード機能。
  - 児童は選択肢をタップして即投票（1人1票、変更可、無記名）
  - リアルタイムで棒グラフが伸びる（P2Pで他端末にも反映）
  - 挙手モード：YES/NO 即答用の軽量バリエーション
  - 投票結果は付箋型カードとしてボードに残り、PNG/PDF書き出しにも含まれる
*/

// ===== 定数 =====
const POLL_DEFAULT_WIDTH = 380;
const POLL_HEADER_HEIGHT = 70;
const POLL_OPTION_HEIGHT = 56;
const POLL_FOOTER_HEIGHT = 38;
const POLL_PADDING = 16;

// 選択肢の色パレット（虹色・小学生にも親しみやすい）
const POLL_OPTION_COLORS = [
  '#FF8A80', // コーラル
  '#FFB74D', // オレンジ
  '#FFE082', // 黄
  '#A5D6A7', // 緑
  '#81D4FA', // 水色
  '#CE93D8', // 紫
];

const POLL_EMOJIS = ['🌸', '🍀', '🌟', '🐱', '🍎', '🚀', '🎵', '⚽', '🎨', '📚'];

// ===== 投票者ID（端末ごとにユニーク・名前と独立） =====
const VOTER_ID_KEY = 'minnanojam_voter_id';
function getVoterId() {
  let id = localStorage.getItem(VOTER_ID_KEY);
  if (!id) {
    id = 'v_' + Math.random().toString(36).slice(2, 12) + Date.now().toString(36).slice(-4);
    try { localStorage.setItem(VOTER_ID_KEY, id); } catch (e) {}
  }
  return id;
}

// ===== 投票オブジェクト作成（new） =====
function createPollObject({ question, options, variant = 'poll', multiSelect = false, anonymous = true, showResults = 'always' }) {
  const safeOpts = (options || []).filter(o => o && (o.text || '').trim().length > 0);
  const built = safeOpts.map((o, i) => ({
    id: 'opt_' + Math.random().toString(36).slice(2, 8),
    text: (o.text || '').trim(),
    emoji: o.emoji || POLL_EMOJIS[i % POLL_EMOJIS.length],
    color: o.color || POLL_OPTION_COLORS[i % POLL_OPTION_COLORS.length],
  }));
  return {
    id: uid(),
    type: 'poll',
    variant,
    question: (question || '').trim() || (variant === 'handsup' ? '挙手で答えよう' : '質問を入力してください'),
    options: built,
    votes: {},
    multiSelect: !!multiSelect,
    anonymous: !!anonymous,
    showResults,
    closed: false,
    createdAt: Date.now(),
    // 配置
    x: BOARD_WIDTH / 2 - POLL_DEFAULT_WIDTH / 2 + (Math.random() * 80 - 40),
    y: BOARD_HEIGHT / 2 - 200 + (Math.random() * 80 - 40),
    width: POLL_DEFAULT_WIDTH,
  };
}

// ===== 集計（票数を返す） =====
function tallyPoll(poll) {
  const counts = {};
  poll.options.forEach(o => { counts[o.id] = 0; });
  let total = 0;
  Object.values(poll.votes || {}).forEach(v => {
    // 複数選択時は配列、単一時は文字列
    if (Array.isArray(v)) {
      v.forEach(optId => {
        if (counts[optId] !== undefined) { counts[optId]++; total++; }
      });
    } else if (typeof v === 'string') {
      if (counts[v] !== undefined) { counts[v]++; total++; }
    }
  });
  const voters = Object.keys(poll.votes || {}).length;
  return { counts, total, voters };
}

// ===== 自分の投票を取得 =====
function getMyVote(poll) {
  if (!poll || !poll.votes) return null;
  return poll.votes[getVoterId()] || null;
}

// ===== 投票を入れる/取り消す =====
function castVote(pollId, optionId) {
  const page = currentPage();
  if (!page || !Array.isArray(page.objects)) return false;
  const poll = page.objects.find(o => o.id === pollId && o.type === 'poll');
  if (!poll) return false;
  if (poll.closed) {
    if (typeof showToast === 'function') showToast('🔒 この投票は締め切られています');
    return false;
  }
  const vId = getVoterId();
  if (!poll.votes) poll.votes = {};

  if (poll.multiSelect) {
    // 複数選択：トグル
    const cur = Array.isArray(poll.votes[vId]) ? poll.votes[vId].slice() : [];
    const idx = cur.indexOf(optionId);
    if (idx >= 0) cur.splice(idx, 1);
    else cur.push(optionId);
    if (cur.length === 0) delete poll.votes[vId];
    else poll.votes[vId] = cur;
  } else {
    // 単一選択：同じ選択肢を再タップで取り消し、別を選ぶと変更
    if (poll.votes[vId] === optionId) {
      delete poll.votes[vId];
    } else {
      poll.votes[vId] = optionId;
    }
  }

  // 永続化＋同期
  if (typeof saveBoardToStorage === 'function') saveBoardToStorage();
  // 履歴はpush（後でundo可能に）
  if (typeof pushHistory === 'function') pushHistory();
  // P2Pで軽量メッセージを送信（state-update より高速）
  if (typeof window.p2pBroadcast === 'function') {
    window.p2pBroadcast({
      type: 'poll-vote',
      pageIndex: State.currentPageIndex,
      pollId,
      voterId: vId,
      vote: poll.votes[vId] || null,
    });
  }
  // ノードを再描画
  rerenderPollNode(pollId);
  // サムネ更新
  if (typeof updatePageThumb === 'function') updatePageThumb(State.currentPageIndex);
  return true;
}

// ===== 締切/再開 =====
function togglePollClosed(pollId) {
  const page = currentPage();
  if (!page) return;
  const poll = page.objects.find(o => o.id === pollId && o.type === 'poll');
  if (!poll) return;
  poll.closed = !poll.closed;
  if (typeof pushHistory === 'function') pushHistory();
  if (typeof saveBoardToStorage === 'function') saveBoardToStorage();
  if (typeof broadcastChange === 'function') broadcastChange();
  rerenderPollNode(pollId);
  if (typeof showToast === 'function') {
    showToast(poll.closed ? '🔒 投票を締め切りました' : '🔓 投票を再開しました');
  }
}

// ===== 投票結果リセット =====
function resetPollVotes(pollId) {
  const page = currentPage();
  if (!page) return;
  const poll = page.objects.find(o => o.id === pollId && o.type === 'poll');
  if (!poll) return;
  if (!confirm('この投票の集計をリセットします。よろしいですか？')) return;
  poll.votes = {};
  if (typeof pushHistory === 'function') pushHistory();
  if (typeof saveBoardToStorage === 'function') saveBoardToStorage();
  if (typeof broadcastChange === 'function') broadcastChange();
  rerenderPollNode(pollId);
  if (typeof showToast === 'function') showToast('🔄 集計をリセットしました');
}

// ===== リモートからの投票反映（p2p-vote ハンドラ） =====
function applyRemoteVote(msg) {
  if (!msg || msg.type !== 'poll-vote') return;
  const pageIdx = msg.pageIndex;
  if (pageIdx == null || !State.pages[pageIdx]) return;
  const page = State.pages[pageIdx];
  const poll = (page.objects || []).find(o => o.id === msg.pollId && o.type === 'poll');
  if (!poll) return;
  if (!poll.votes) poll.votes = {};
  if (msg.vote == null) {
    delete poll.votes[msg.voterId];
  } else {
    poll.votes[msg.voterId] = msg.vote;
  }
  // 表示中のページなら再描画
  if (pageIdx === State.currentPageIndex) {
    rerenderPollNode(msg.pollId);
  }
  // 永続化（リモート反映フラグ付き）
  const wasApplying = State.applyingRemote;
  State.applyingRemote = true;
  try {
    if (typeof saveBoardToStorage === 'function') saveBoardToStorage();
  } finally {
    State.applyingRemote = wasApplying;
  }
  if (typeof updatePageThumb === 'function') updatePageThumb(pageIdx);
}

// ===== Konva 描画 =====
// board.js の createNodeFromData() から case 'poll' で呼ばれる
function createPollNode(obj) {
  const isHandsUp = obj.variant === 'handsup';
  const showResults = obj.showResults || 'always';
  const myVote = obj.votes && obj.votes[getVoterId()];
  const hasVoted = !!myVote;
  const visible = showResults === 'always'
    || (showResults === 'after-vote' && hasVoted)
    || (showResults === 'after-close' && obj.closed);

  const width = obj.width || POLL_DEFAULT_WIDTH;
  const optCount = (obj.options || []).length;
  const height = POLL_HEADER_HEIGHT + (optCount * POLL_OPTION_HEIGHT) + POLL_FOOTER_HEIGHT + POLL_PADDING;

  const group = new Konva.Group({
    id: obj.id,
    name: 'object',
    x: obj.x || 0,
    y: obj.y || 0,
    rotation: obj.rotation || 0,
    draggable: true,
  });

  // 背景パネル
  group.add(new Konva.Rect({
    width,
    height,
    fill: '#ffffff',
    stroke: isHandsUp ? '#ff7eb3' : '#ffa07a',
    strokeWidth: 3,
    cornerRadius: 16,
    shadowColor: 'rgba(0,0,0,0.15)',
    shadowBlur: 12,
    shadowOffsetY: 4,
  }));

  // ヘッダーバー
  group.add(new Konva.Rect({
    x: 0, y: 0,
    width,
    height: POLL_HEADER_HEIGHT,
    fill: isHandsUp ? '#fff0f5' : '#fff5ef',
    cornerRadius: [16, 16, 0, 0],
    listening: false,
  }));
  // アイコン
  group.add(new Konva.Text({
    x: 16, y: 14,
    text: isHandsUp ? '✋' : '🗳️',
    fontSize: 28,
    listening: false,
  }));
  // 質問文
  group.add(new Konva.Text({
    x: 56, y: 14,
    width: width - 70,
    height: POLL_HEADER_HEIGHT - 22,
    text: obj.question || '',
    fontSize: 16,
    fontFamily: 'M PLUS Rounded 1c',
    fontStyle: 'bold',
    fill: '#3a3a3a',
    align: 'left',
    verticalAlign: 'middle',
    lineHeight: 1.25,
    wrap: 'word',
    ellipsis: true,
    listening: false,
  }));

  // 締切バッジ
  if (obj.closed) {
    const badgeW = 60, badgeH = 22;
    group.add(new Konva.Rect({
      x: width - badgeW - 12, y: 10,
      width: badgeW, height: badgeH,
      fill: '#9ca3af',
      cornerRadius: 11,
      listening: false,
    }));
    group.add(new Konva.Text({
      x: width - badgeW - 12, y: 10,
      width: badgeW, height: badgeH,
      text: '締切',
      fontSize: 12,
      fontFamily: 'M PLUS Rounded 1c',
      fontStyle: 'bold',
      fill: '#fff',
      align: 'center',
      verticalAlign: 'middle',
      listening: false,
    }));
  }

  // 集計
  const tally = tallyPoll(obj);

  // 選択肢
  (obj.options || []).forEach((opt, i) => {
    const oy = POLL_HEADER_HEIGHT + i * POLL_OPTION_HEIGHT + 6;
    const ow = width - POLL_PADDING * 2;
    const oh = POLL_OPTION_HEIGHT - 8;
    const count = tally.counts[opt.id] || 0;
    const ratio = tally.total > 0 ? count / tally.total : 0;

    const isMyChoice = obj.multiSelect
      ? (Array.isArray(myVote) && myVote.includes(opt.id))
      : (myVote === opt.id);

    // 選択肢グループ（クリック対象）
    const optGroup = new Konva.Group({
      x: POLL_PADDING,
      y: oy,
      name: 'poll-option',
    });
    // 背景（薄いベース）
    optGroup.add(new Konva.Rect({
      width: ow, height: oh,
      fill: '#f7f8fa',
      cornerRadius: 10,
      stroke: isMyChoice ? opt.color : '#e5e7eb',
      strokeWidth: isMyChoice ? 3 : 1.5,
    }));
    // 棒グラフ（結果表示時のみ）
    if (visible && ratio > 0) {
      optGroup.add(new Konva.Rect({
        width: Math.max(2, ow * ratio),
        height: oh,
        fill: opt.color,
        opacity: 0.35,
        cornerRadius: 10,
        listening: false,
      }));
    }
    // 絵文字
    optGroup.add(new Konva.Text({
      x: 10, y: 0, width: 32, height: oh,
      text: opt.emoji || '•',
      fontSize: 22,
      align: 'center',
      verticalAlign: 'middle',
      listening: false,
    }));
    // テキスト
    optGroup.add(new Konva.Text({
      x: 46, y: 0,
      width: ow - 110,
      height: oh,
      text: opt.text,
      fontSize: 15,
      fontFamily: 'M PLUS Rounded 1c',
      fontStyle: isMyChoice ? 'bold' : 'normal',
      fill: '#3a3a3a',
      align: 'left',
      verticalAlign: 'middle',
      wrap: 'none',
      ellipsis: true,
      listening: false,
    }));
    // 票数（結果表示時のみ）
    if (visible) {
      optGroup.add(new Konva.Text({
        x: ow - 60, y: 0,
        width: 56, height: oh,
        text: count + '票',
        fontSize: 14,
        fontFamily: 'M PLUS Rounded 1c',
        fontStyle: 'bold',
        fill: count > 0 ? '#e84e1f' : '#9ca3af',
        align: 'right',
        verticalAlign: 'middle',
        listening: false,
      }));
    }
    // チェックマーク（自分が選んでいる場合）
    if (isMyChoice) {
      optGroup.add(new Konva.Text({
        x: ow - 28, y: 0,
        width: 24, height: oh,
        text: '✓',
        fontSize: 20,
        fontStyle: 'bold',
        fill: opt.color,
        align: 'center',
        verticalAlign: 'middle',
        listening: false,
      }));
    }
    // クリックハンドラ
    optGroup.on('click tap', (e) => {
      // ドラッグと区別するため、ステージドラッグ中はスキップ
      if (group.isDragging()) return;
      e.cancelBubble = true;
      castVote(obj.id, opt.id);
    });
    optGroup.on('mouseenter', () => {
      const stage = group.getStage();
      if (stage) stage.container().style.cursor = obj.closed ? 'not-allowed' : 'pointer';
    });
    optGroup.on('mouseleave', () => {
      const stage = group.getStage();
      if (stage) stage.container().style.cursor = '';
    });

    group.add(optGroup);
  });

  // フッター（人数表示）
  const footerY = POLL_HEADER_HEIGHT + optCount * POLL_OPTION_HEIGHT + 8;
  group.add(new Konva.Text({
    x: POLL_PADDING, y: footerY,
    width: width - POLL_PADDING * 2,
    height: 20,
    text: visible
      ? `👥 ${tally.voters}人が投票・合計 ${tally.total}票`
      : (hasVoted ? '✅ 投票ありがとう！結果は締切後に表示されます'
                  : '👇 選択肢をタップして投票しよう'),
    fontSize: 11,
    fontFamily: 'M PLUS Rounded 1c',
    fill: '#6b7280',
    align: 'center',
    verticalAlign: 'middle',
    listening: false,
  }));

  return group;
}

// ===== 既存の投票ノードを差し替え（再描画） =====
function rerenderPollNode(pollId) {
  if (!State || !State.mainLayer) return;
  const oldNode = State.mainLayer.findOne('#' + pollId);
  if (!oldNode) return;
  const page = currentPage();
  if (!page) return;
  const obj = (page.objects || []).find(o => o.id === pollId && o.type === 'poll');
  if (!obj) return;
  const x = oldNode.x(), y = oldNode.y(), rot = oldNode.rotation();
  obj.x = x; obj.y = y; obj.rotation = rot;
  oldNode.destroy();
  const newNode = createPollNode(obj);
  if (typeof attachObjectHandlers === 'function') attachObjectHandlers(newNode, obj);
  State.mainLayer.add(newNode);
  State.mainLayer.batchDraw();
  // Transformerの選択を維持
  if (State.transformer) {
    const sel = State.transformer.nodes();
    if (sel.some(n => n.id() === pollId)) {
      State.transformer.nodes([...sel.filter(n => n.id() !== pollId), newNode]);
    }
  }
}

// ===== モーダル：新規作成 =====
function openPollCreatorModal(presetVariant) {
  const modal = document.getElementById('modal-poll');
  if (!modal) return;
  modal.classList.remove('hidden');

  // フォーム初期化
  const variant = presetVariant || 'poll';
  modal.dataset.variant = variant;
  // タイトル切り替え
  const titleEl = document.getElementById('poll-modal-title');
  if (titleEl) {
    titleEl.textContent = variant === 'handsup' ? '✋ 挙手をつくる' : '🗳️ 投票をつくる';
  }
  // 質問
  const qEl = document.getElementById('poll-question');
  if (qEl) {
    qEl.value = '';
    qEl.placeholder = variant === 'handsup'
      ? '例：今日の発表、よく聞こえましたか？'
      : '例：放課後の係活動、どれをやりたい？';
  }
  // 選択肢
  if (variant === 'handsup') {
    _initPollOptionsList([
      { text: 'はい！', emoji: '✋' },
      { text: 'まだです', emoji: '🙅' },
    ]);
  } else {
    _initPollOptionsList([
      { text: '', emoji: POLL_EMOJIS[0] },
      { text: '', emoji: POLL_EMOJIS[1] },
      { text: '', emoji: POLL_EMOJIS[2] },
    ]);
  }
  // 設定リセット
  const cb1 = document.getElementById('poll-multi'); if (cb1) cb1.checked = false;
  const cb2 = document.getElementById('poll-anonymous'); if (cb2) cb2.checked = true;
  const sel = document.getElementById('poll-show-results');
  if (sel) sel.value = variant === 'handsup' ? 'always' : 'always';

  // 一回フォーカス
  setTimeout(() => qEl && qEl.focus(), 80);
}

function closePollCreatorModal() {
  const modal = document.getElementById('modal-poll');
  if (modal) modal.classList.add('hidden');
}

function _initPollOptionsList(initialOpts) {
  const list = document.getElementById('poll-options-list');
  if (!list) return;
  list.innerHTML = '';
  (initialOpts || []).forEach((opt, i) => _appendOptionRow(opt.text || '', opt.emoji || POLL_EMOJIS[i % POLL_EMOJIS.length]));
}

function _appendOptionRow(text, emoji) {
  const list = document.getElementById('poll-options-list');
  if (!list) return;
  if (list.children.length >= 6) {
    if (typeof showToast === 'function') showToast('ℹ️ 選択肢は最大6個までです');
    return;
  }
  const idx = list.children.length;
  const row = document.createElement('div');
  row.className = 'poll-option-row';
  row.innerHTML = `
    <button type="button" class="poll-emoji-btn" data-emoji="${emoji}" title="絵文字を変える">${emoji}</button>
    <input type="text" class="poll-option-input" placeholder="選択肢 ${idx + 1}" value="${(text || '').replace(/"/g, '&quot;')}" maxlength="40" />
    <button type="button" class="poll-option-remove" title="この選択肢を削除"><i class="fa-solid fa-xmark"></i></button>
  `;
  list.appendChild(row);
  // 絵文字ボタンでパレットを開く
  row.querySelector('.poll-emoji-btn').addEventListener('click', () => _showEmojiPalette(row));
  // 削除
  row.querySelector('.poll-option-remove').addEventListener('click', () => {
    if (list.children.length <= 2) {
      if (typeof showToast === 'function') showToast('ℹ️ 選択肢は最低2個必要です');
      return;
    }
    row.remove();
  });
}

function _showEmojiPalette(row) {
  // 既存パレットがあれば閉じる
  document.querySelectorAll('.poll-emoji-palette').forEach(p => p.remove());
  const btn = row.querySelector('.poll-emoji-btn');
  const palette = document.createElement('div');
  palette.className = 'poll-emoji-palette';
  POLL_EMOJIS.forEach(e => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = e;
    b.addEventListener('click', () => {
      btn.textContent = e;
      btn.dataset.emoji = e;
      palette.remove();
    });
    palette.appendChild(b);
  });
  // 位置調整
  const rect = btn.getBoundingClientRect();
  palette.style.position = 'fixed';
  palette.style.left = rect.left + 'px';
  palette.style.top = (rect.bottom + 4) + 'px';
  palette.style.zIndex = 10000;
  document.body.appendChild(palette);
  // 外側クリックで閉じる
  setTimeout(() => {
    const onOutside = (e) => {
      if (!palette.contains(e.target) && e.target !== btn) {
        palette.remove();
        document.removeEventListener('mousedown', onOutside);
      }
    };
    document.addEventListener('mousedown', onOutside);
  }, 50);
}

// ===== 「作成」ボタン =====
function submitPollFromModal() {
  const modal = document.getElementById('modal-poll');
  if (!modal) return;
  const variant = modal.dataset.variant || 'poll';
  const question = (document.getElementById('poll-question')?.value || '').trim();
  const rows = document.querySelectorAll('#poll-options-list .poll-option-row');
  const options = [];
  rows.forEach(row => {
    const text = (row.querySelector('.poll-option-input')?.value || '').trim();
    const emoji = row.querySelector('.poll-emoji-btn')?.dataset.emoji || '';
    if (text.length > 0) options.push({ text, emoji });
  });
  if (!question) {
    if (typeof showToast === 'function') showToast('⚠️ 質問文を入力してください');
    document.getElementById('poll-question')?.focus();
    return;
  }
  if (options.length < 2) {
    if (typeof showToast === 'function') showToast('⚠️ 選択肢を2つ以上入れてください');
    return;
  }
  const multiSelect = !!document.getElementById('poll-multi')?.checked;
  const anonymous = !!document.getElementById('poll-anonymous')?.checked;
  const showResults = document.getElementById('poll-show-results')?.value || 'always';

  const obj = createPollObject({ question, options, variant, multiSelect, anonymous, showResults });
  if (typeof addObjectToPage === 'function') {
    addObjectToPage(obj);
  }
  closePollCreatorModal();
  if (typeof showToast === 'function') {
    showToast(variant === 'handsup' ? '✋ 挙手をボードに置きました' : '🗳️ 投票をボードに置きました');
  }
}

// ===== コンテキストメニュー的な操作（締切・リセット）=====
// 右クリックメニューは未整備なので、選択中にショートカット呼出し可能
function getSelectedPollId() {
  if (!State.transformer) return null;
  const nodes = State.transformer.nodes();
  if (!nodes || nodes.length === 0) return null;
  const node = nodes[0];
  const id = node.id && node.id();
  const page = currentPage();
  if (!page || !id) return null;
  const obj = (page.objects || []).find(o => o.id === id);
  return (obj && obj.type === 'poll') ? id : null;
}

// ===== モーダルハンドラ初期化 =====
function setupPollModalHandlers() {
  const modal = document.getElementById('modal-poll');
  if (!modal) return;

  // 閉じる
  modal.querySelectorAll('[data-close="modal-poll"]').forEach(b => {
    b.addEventListener('click', closePollCreatorModal);
  });

  // 選択肢追加ボタン
  const addBtn = document.getElementById('poll-add-option');
  if (addBtn) addBtn.addEventListener('click', () => _appendOptionRow('', POLL_EMOJIS[Math.floor(Math.random() * POLL_EMOJIS.length)]));

  // 作成ボタン
  const submitBtn = document.getElementById('poll-submit');
  if (submitBtn) submitBtn.addEventListener('click', submitPollFromModal);

  // 種類切替（投票 ⇄ 挙手）
  const tabs = modal.querySelectorAll('.poll-variant-tab');
  tabs.forEach(t => {
    t.addEventListener('click', () => {
      const v = t.dataset.variant;
      tabs.forEach(x => x.classList.toggle('active', x === t));
      // 挙手なら選択肢を YES/NO に
      if (v === 'handsup') {
        _initPollOptionsList([
          { text: 'はい！', emoji: '✋' },
          { text: 'まだです', emoji: '🙅' },
        ]);
        document.getElementById('poll-question').placeholder = '例：今日の発表、よく聞こえましたか？';
      } else {
        _initPollOptionsList([
          { text: '', emoji: POLL_EMOJIS[0] },
          { text: '', emoji: POLL_EMOJIS[1] },
          { text: '', emoji: POLL_EMOJIS[2] },
        ]);
        document.getElementById('poll-question').placeholder = '例：放課後の係活動、どれをやりたい？';
      }
      modal.dataset.variant = v;
      const titleEl = document.getElementById('poll-modal-title');
      if (titleEl) titleEl.textContent = v === 'handsup' ? '✋ 挙手をつくる' : '🗳️ 投票をつくる';
    });
  });
}

// ===== p2p ハンドラ登録 =====
function registerPollP2PHandler() {
  if (typeof window.p2pRegisterHandler === 'function') {
    window.p2pRegisterHandler('poll-vote', applyRemoteVote);
  }
}

// ===== グローバル公開 =====
if (typeof window !== 'undefined') {
  window.createPollObject = createPollObject;
  window.createPollNode = createPollNode;
  window.tallyPoll = tallyPoll;
  window.castVote = castVote;
  window.togglePollClosed = togglePollClosed;
  window.resetPollVotes = resetPollVotes;
  window.openPollCreatorModal = openPollCreatorModal;
  window.closePollCreatorModal = closePollCreatorModal;
  window.setupPollModalHandlers = setupPollModalHandlers;
  window.getVoterId = getVoterId;
  window.applyRemoteVote = applyRemoteVote;
  window.registerPollP2PHandler = registerPollP2PHandler;
  window.getSelectedPollId = getSelectedPollId;
  window.rerenderPollNode = rerenderPollNode;
  window.POLL_EMOJIS = POLL_EMOJIS;
  window.POLL_OPTION_COLORS = POLL_OPTION_COLORS;
}

// p2p ハンドラは load 時に登録（p2p.js が後で読み込まれても安全）
if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', registerPollP2PHandler);
  } else {
    setTimeout(registerPollP2PHandler, 100);
  }
}
