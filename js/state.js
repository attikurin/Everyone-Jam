/* =========================================
   みんなのジャム - 状態管理
   ========================================= */

const BOARD_WIDTH = 1920;
const BOARD_HEIGHT = 1200;

const STICKY_COLORS = [
  '#FFE082', // 黄
  '#FFAB91', // オレンジ
  '#F8BBD0', // ピンク
  '#CE93D8', // 紫
  '#A5D6F7', // 水色
  '#C5E1A5', // 緑
];

const PEN_COLORS = [
  '#2C3E50', // 黒
  '#E74C3C', // 赤
  '#3498DB', // 青
  '#27AE60', // 緑
  '#F39C12', // オレンジ
  '#9B59B6', // 紫
  '#FFFFFF', // 白
];

const MARKER_COLORS = [
  '#FFEB3B', '#FFC107', '#FF9800',
  '#F48FB1', '#CE93D8', '#90CAF9', '#A5D6A7',
];

const PEN_SIZES = [2, 4, 8, 14];
const MARKER_SIZES = [12, 20, 32];
const ERASER_SIZES = [20, 40, 80];

const BG_TEMPLATES = {
  blank: null,
  grid: 'grid',
  dots: 'dots',
  lined: 'lined',
  // 教材テンプレート（v1.3.0で追加）
  genko: 'genko',           // 原稿用紙
  'math-grid': 'math-grid', // 算数方眼+座標軸
  science: 'science',       // 観察カード
  music: 'music',           // 5線譜
  cross: 'cross',           // 書写ガイド
};

// アプリ全体の状態
const State = {
  boardId: null,
  boardTitle: '新しいボード',
  currentTool: 'select',
  currentPageIndex: 0,

  // ツール設定
  penColor: PEN_COLORS[0],
  penSize: PEN_SIZES[1],
  markerColor: MARKER_COLORS[0],
  markerSize: MARKER_SIZES[1],
  eraserSize: ERASER_SIZES[1],
  stickyColor: STICKY_COLORS[0],
  shapeType: 'rect', // rect, circle, triangle, line, arrow

  // ページデータ
  pages: [],

  // 履歴
  history: [],
  historyIndex: -1,
  maxHistory: 50,

  // Konva関連
  stage: null,
  mainLayer: null,
  drawLayer: null,
  uiLayer: null,
  transformer: null,

  // 描画中
  isDrawing: false,
  currentShape: null,

  // ビュー
  scale: 1,
  panX: 0,
  panY: 0,

  // リモート更新中フラグ（同期の無限ループ防止）
  applyingRemote: false,
};

// ID生成
function uid() {
  return 'o_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

// ストレージキー定数
const STORAGE_PREFIX = 'minnanojam_';
const LAST_BOARD_KEY = 'minnanojam_last_board';
const LEGACY_STORAGE_PREFIX = 'boardle_';
const LEGACY_LAST_BOARD_KEY = 'boardle_last_board';

// 旧バージョンからのマイグレーション
function migrateLegacyStorage() {
  try {
    // 最後に開いたボードID
    const legacyLast = localStorage.getItem(LEGACY_LAST_BOARD_KEY);
    if (legacyLast && !localStorage.getItem(LAST_BOARD_KEY)) {
      localStorage.setItem(LAST_BOARD_KEY, legacyLast);
    }
    // 各ボードデータ
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(LEGACY_STORAGE_PREFIX) && k !== LEGACY_LAST_BOARD_KEY) {
        keys.push(k);
      }
    }
    keys.forEach(oldKey => {
      const newKey = STORAGE_PREFIX + oldKey.slice(LEGACY_STORAGE_PREFIX.length);
      if (!localStorage.getItem(newKey)) {
        const val = localStorage.getItem(oldKey);
        if (val) localStorage.setItem(newKey, val);
      }
    });
  } catch (e) {
    console.warn('旧データのマイグレーションに失敗:', e);
  }
}

// ボードID取得（URLから）
// URLに ?board=xxx が無い場合は null を返し、呼び出し側でスタート画面を出す
function getBoardId() {
  migrateLegacyStorage();
  const params = new URLSearchParams(window.location.search);
  const id = params.get('board');
  if (!id) return null;
  // URLで指定されたIDをアクティブとして記憶（戻ってきた時の参考用）
  localStorage.setItem(LAST_BOARD_KEY, id);
  return id;
}

// 新しいランダムIDを発行
function generateNewBoardId() {
  return 'board_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

// 現在のURLにboard IDをセットしてリロードせずに反映
function setBoardIdInUrl(id) {
  const url = new URL(window.location);
  url.searchParams.set('board', id);
  window.history.replaceState({}, '', url);
}

// 保存済みボードの一覧を取得（最近更新順）
function listSavedBoards() {
  const boards = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(STORAGE_PREFIX)) continue;
      if (k === LAST_BOARD_KEY) continue;
      // 設定系キーをスキップ
      if (k === 'minnanojam_my_color' || k === 'minnanojam_my_name') continue;
      try {
        const raw = localStorage.getItem(k);
        if (!raw) continue;
        const data = JSON.parse(raw);
        if (!data || !data.id) continue;
        // オブジェクト数とコメント数を集計
        let objectCount = 0, commentCount = 0;
        if (Array.isArray(data.pages)) {
          data.pages.forEach(p => {
            if (Array.isArray(p.objects)) objectCount += p.objects.length;
            if (Array.isArray(p.comments)) commentCount += p.comments.length;
          });
        }
        boards.push({
          id: data.id,
          title: data.title || '無題のボード',
          updatedAt: data.updatedAt || 0,
          createdAt: data.createdAt || data.updatedAt || 0,
          pageCount: Array.isArray(data.pages) ? data.pages.length : 0,
          objectCount,
          commentCount,
          // メタ情報（v1.5.0 Phase 4-2）
          subject: data.subject || '',
          tags: Array.isArray(data.tags) ? data.tags : [],
          folder: data.folder || '',
          grade: data.grade || '',
          classroom: data.classroom || '',
          favorite: !!data.favorite,
        });
      } catch (e) { /* skip */ }
    }
  } catch (e) {
    console.warn('ボード一覧取得失敗:', e);
  }
  // 最近更新順
  boards.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  return boards;
}

// ボードを削除
function deleteBoardFromStorage(id) {
  try {
    localStorage.removeItem(STORAGE_PREFIX + id);
    return true;
  } catch (e) { return false; }
}

// ボードのメタ情報を部分更新（v1.5.0 Phase 4-2）
// タグ・教科・フォルダ・学年などを他ボードを開かずに修正できる
function patchBoardMeta(id, patch) {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + id);
    if (!raw) return false;
    const data = JSON.parse(raw);
    Object.keys(patch || {}).forEach(k => { data[k] = patch[k]; });
    data.updatedAt = data.updatedAt || Date.now();
    localStorage.setItem(STORAGE_PREFIX + id, JSON.stringify(data));
    return true;
  } catch (e) {
    console.warn('メタ更新失敗:', e);
    return false;
  }
}

// 新しいページを作成
function createNewPage() {
  return {
    id: 'p_' + Math.random().toString(36).slice(2, 10),
    background: 'blank',
    // v1.8.0 (Phase 8): 教材PDF/画像を背景として取り込む
    // { src: 'data:image/...', opacity: 0.0-1.0, fit: 'contain'|'cover'|'stretch' }
    // null または undefined の場合は通常の背景パターンのみ表示
    backgroundImage: null,
    objects: [],
  };
}

// 現在のページ取得
function currentPage() {
  return State.pages[State.currentPageIndex];
}

// ===== 永続化 =====
function saveBoardToStorage() {
  // 既存のメタ情報を保持（ボード一覧侧で設定されたものを上書きしない）
  let existing = null;
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + State.boardId);
    if (raw) existing = JSON.parse(raw);
  } catch (e) {}

  const data = {
    id: State.boardId,
    title: State.boardTitle,
    pages: State.pages,
    updatedAt: Date.now(),
    createdAt: (existing && existing.createdAt) || Date.now(),
    // メタ情報は既存を引き継ぐ
    subject: existing ? (existing.subject || '') : '',
    tags: existing && Array.isArray(existing.tags) ? existing.tags : [],
    folder: existing ? (existing.folder || '') : '',
    grade: existing ? (existing.grade || '') : '',
    classroom: existing ? (existing.classroom || '') : '',
    favorite: existing ? !!existing.favorite : false,
  };
  try {
    localStorage.setItem(STORAGE_PREFIX + State.boardId, JSON.stringify(data));
  } catch (e) {
    console.warn('保存に失敗しました', e);
    if (typeof showToast === 'function') showToast('⚠️ 保存容量が不足しています。画像を減らしてください。');
  }
}

function loadBoardFromStorage(id) {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + id);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

// ===== 履歴（Undo/Redo）=====
// [B05/B20修正] shift時のインデックス整合性を修正
function pushHistory() {
  // リモート適用中は履歴に積まない
  if (State.applyingRemote) return;
  const snapshot = JSON.stringify(State.pages);
  // 直前と同じなら積まない（無駄な履歴防止）
  if (State.history[State.historyIndex] === snapshot) return;

  // 現在位置より先を削除（分岐）
  State.history = State.history.slice(0, State.historyIndex + 1);
  State.history.push(snapshot);
  State.historyIndex = State.history.length - 1;

  // 上限を超えたら先頭削除（インデックスを対応して減らす）
  while (State.history.length > State.maxHistory) {
    State.history.shift();
    State.historyIndex--;
  }
  if (State.historyIndex < 0) State.historyIndex = 0;
  updateUndoRedoButtons();
}

function undo() {
  if (State.historyIndex <= 0) return;
  State.historyIndex--;
  const snapshot = State.history[State.historyIndex];
  State.pages = JSON.parse(snapshot);
  if (State.currentPageIndex >= State.pages.length) {
    State.currentPageIndex = State.pages.length - 1;
  }
  if (State.currentPageIndex < 0) State.currentPageIndex = 0;
  renderCurrentPage();
  renderPagesList();
  saveBoardToStorage();
  broadcastChange();
  updateUndoRedoButtons();
}

function redo() {
  if (State.historyIndex >= State.history.length - 1) return;
  State.historyIndex++;
  const snapshot = State.history[State.historyIndex];
  State.pages = JSON.parse(snapshot);
  if (State.currentPageIndex >= State.pages.length) {
    State.currentPageIndex = State.pages.length - 1;
  }
  if (State.currentPageIndex < 0) State.currentPageIndex = 0;
  renderCurrentPage();
  renderPagesList();
  saveBoardToStorage();
  broadcastChange();
  updateUndoRedoButtons();
}

function updateUndoRedoButtons() {
  const undoBtn = document.getElementById('btn-undo');
  const redoBtn = document.getElementById('btn-redo');
  if (undoBtn) undoBtn.disabled = State.historyIndex <= 0;
  if (redoBtn) redoBtn.disabled = State.historyIndex >= State.history.length - 1;
}

// ===== トースト =====
let toastTimer = null;
function showToast(message, duration = 2500) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.add('hidden');
  }, duration);
}

// ===== テスト・デバッグ用にwindowに公開 =====
// すべての宣言（const/let/function）が初期化された後に実行する必要があるため
// ファイル末尾に配置（TDZエラー防止）
if (typeof window !== 'undefined') {
  window.State = State;
  window.BOARD_WIDTH = BOARD_WIDTH;
  window.BOARD_HEIGHT = BOARD_HEIGHT;
  window.STICKY_COLORS = STICKY_COLORS;
  window.PEN_COLORS = PEN_COLORS;
  window.MARKER_COLORS = MARKER_COLORS;
  window.PEN_SIZES = PEN_SIZES;
  window.MARKER_SIZES = MARKER_SIZES;
  window.ERASER_SIZES = ERASER_SIZES;
  window.BG_TEMPLATES = BG_TEMPLATES;
  window.listSavedBoards = listSavedBoards;
  window.deleteBoardFromStorage = deleteBoardFromStorage;
  window.loadBoardFromStorage = loadBoardFromStorage;
  window.patchBoardMeta = patchBoardMeta;
  window.saveBoardToStorage = saveBoardToStorage;
  window.STORAGE_PREFIX = STORAGE_PREFIX;
  window.LAST_BOARD_KEY = LAST_BOARD_KEY;
  window.uid = uid;
  window.showToast = showToast;
}
