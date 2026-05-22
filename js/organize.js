/* =========================================
   みんなのジャム - ボード整理機能（v1.5.0 / Phase 4-2）

   主な機能:
   1. 教科タグ（国語/算数/理科/社会/英語/音楽/図工/体育/その他）
   2. 学年・クラス（1年〜6年 × クラス）
   3. フォルダ（自由記入）
   4. お気に入り
   5. 検索（タイトル・タグ・学年・教科をまたいだ検索）
   6. ボードカードUI（旧来の「最近のボード」一覧と統合）
   ========================================= */

(function () {
  'use strict';

  const Organize = {
    // 教科の定義
    SUBJECTS: [
      { id: '', label: '教科未設定', cls: 'subject-other' },
      { id: 'japanese', label: '国語', cls: 'subject-japanese' },
      { id: 'math',     label: '算数', cls: 'subject-math' },
      { id: 'science',  label: '理科', cls: 'subject-science' },
      { id: 'society',  label: '社会', cls: 'subject-society' },
      { id: 'english',  label: '英語', cls: 'subject-english' },
      { id: 'music',    label: '音楽', cls: 'subject-music' },
      { id: 'art',      label: '図工', cls: 'subject-art' },
      { id: 'pe',       label: '体育', cls: 'subject-pe' },
      { id: 'other',    label: 'その他', cls: 'subject-other' },
    ],
    GRADES: ['', '1年', '2年', '3年', '4年', '5年', '6年', '中1', '中2', '中3', '高1', '高2', '高3'],

    // 検索フィルタ状態
    filter: {
      keyword: '',
      subject: '',
      grade: '',
      folder: '',
      favoriteOnly: false,
    },
  };

  // ===== 教科ラベル取得 =====
  function getSubjectMeta(subjectId) {
    return Organize.SUBJECTS.find(s => s.id === subjectId) || Organize.SUBJECTS[0];
  }

  // ===== フィルタリング =====
  function applyFilter(boards) {
    const f = Organize.filter;
    return boards.filter(b => {
      if (f.favoriteOnly && !b.favorite) return false;
      if (f.subject && b.subject !== f.subject) return false;
      if (f.grade && b.grade !== f.grade) return false;
      if (f.folder && (b.folder || '') !== f.folder) return false;
      if (f.keyword) {
        const kw = f.keyword.toLowerCase();
        const haystack = [
          b.title || '',
          (b.tags || []).join(' '),
          getSubjectMeta(b.subject).label,
          b.grade || '',
          b.classroom || '',
          b.folder || '',
        ].join(' ').toLowerCase();
        if (!haystack.includes(kw)) return false;
      }
      return true;
    });
  }

  // ===== 全フォルダ一覧 =====
  function listAllFolders(boards) {
    const set = new Set();
    boards.forEach(b => { if (b.folder) set.add(b.folder); });
    return Array.from(set).sort();
  }

  // ===== ボードカードを描画 =====
  function renderBoardCard(board, onOpen, onDelete, onEdit) {
    const subj = getSubjectMeta(board.subject);
    const card = document.createElement('div');
    card.className = 'board-card';
    card.dataset.boardId = board.id;

    const tagsHtml = (board.tags || []).slice(0, 3).map(t =>
      `<span class="board-tag">${escapeHtml(t)}</span>`).join('');

    const folderChip = board.folder
      ? `<span class="board-folder-chip"><i class="fa-solid fa-folder"></i>${escapeHtml(board.folder)}</span>`
      : '';

    const favIcon = board.favorite
      ? '<i class="fa-solid fa-star" style="color:#ffb800;"></i>'
      : '<i class="fa-regular fa-star"></i>';

    const updated = formatRelative(board.updatedAt);

    card.innerHTML = `
      <div class="board-thumb-wrap">
        <svg viewBox="0 0 60 40" width="60" height="40">
          <rect width="60" height="40" fill="#fff"/>
          <rect width="60" height="6" fill="${getSubjectColor(subj.id)}"/>
        </svg>
      </div>
      <div class="board-info">
        <div class="board-title">${escapeHtml(board.title)}</div>
        <div class="board-meta">
          ${board.pageCount}ページ・${board.objectCount || 0}個 · ${updated}
        </div>
        <div class="board-tags">
          <span class="board-tag ${subj.cls}">${subj.label}</span>
          ${board.grade ? `<span class="board-tag">${escapeHtml(board.grade)}${board.classroom ? ' '+escapeHtml(board.classroom):''}</span>` : ''}
          ${folderChip}
          ${tagsHtml}
        </div>
      </div>
      <div class="board-actions">
        <button class="board-action-btn fav-btn" title="お気に入り">${favIcon}</button>
        <button class="board-action-btn edit-btn" title="編集"><i class="fa-solid fa-tag"></i></button>
        <button class="board-action-btn open-btn" title="開く"><i class="fa-solid fa-folder-open"></i></button>
        <button class="board-action-btn danger del-btn" title="削除"><i class="fa-solid fa-trash"></i></button>
      </div>
    `;

    card.querySelector('.open-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      if (onOpen) onOpen(board.id);
    });
    card.querySelector('.del-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      if (confirm(`「${board.title}」を削除しますか？\n（元に戻せません）`)) {
        if (onDelete) onDelete(board.id);
      }
    });
    card.querySelector('.fav-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      window.patchBoardMeta(board.id, { favorite: !board.favorite });
      board.favorite = !board.favorite;
      const icon = card.querySelector('.fav-btn i');
      icon.className = board.favorite ? 'fa-solid fa-star' : 'fa-regular fa-star';
      icon.style.color = board.favorite ? '#ffb800' : '';
      if (typeof showToast === 'function') {
        showToast(board.favorite ? '⭐ お気に入りに追加' : 'お気に入りから外しました');
      }
    });
    card.querySelector('.edit-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      if (onEdit) onEdit(board);
    });
    // カード本体クリックで開く
    card.addEventListener('click', () => { if (onOpen) onOpen(board.id); });

    return card;
  }

  function getSubjectColor(id) {
    const map = {
      japanese: '#d63031', math: '#0984e3', science: '#00875a',
      society: '#c08800', english: '#6c5ce7', music: '#d63384',
      art: '#00858f', pe: '#d35400', other: '#888',
    };
    return map[id] || '#ffd4b8';
  }

  // ===== ボード一覧モーダル全体を描画（フィルタバー込み）=====
  function renderBoardListUI(containerEl, options) {
    options = options || {};
    const onOpen = options.onOpen;
    const onDelete = options.onDelete;
    const allBoards = window.listSavedBoards();
    const folders = listAllFolders(allBoards);

    containerEl.innerHTML = '';
    // フィルタバー
    const bar = document.createElement('div');
    bar.className = 'board-filter-bar';
    bar.innerHTML = `
      <input type="text" id="bf-keyword" placeholder="🔍 タイトル・タグで検索" value="${escapeHtml(Organize.filter.keyword)}">
      <select id="bf-subject">
        <option value="">教科すべて</option>
        ${Organize.SUBJECTS.filter(s => s.id).map(s =>
          `<option value="${s.id}" ${Organize.filter.subject === s.id ? 'selected' : ''}>${s.label}</option>`).join('')}
      </select>
      <select id="bf-grade">
        <option value="">学年すべて</option>
        ${Organize.GRADES.filter(g => g).map(g =>
          `<option value="${g}" ${Organize.filter.grade === g ? 'selected' : ''}>${g}</option>`).join('')}
      </select>
      <select id="bf-folder">
        <option value="">フォルダすべて</option>
        ${folders.map(f => `<option value="${escapeHtml(f)}" ${Organize.filter.folder === f ? 'selected' : ''}>${escapeHtml(f)}</option>`).join('')}
      </select>
      <label style="display:inline-flex;align-items:center;gap:4px;font-size:13px;color:#666;">
        <input type="checkbox" id="bf-fav" ${Organize.filter.favoriteOnly ? 'checked' : ''}>
        ⭐のみ
      </label>
    `;
    containerEl.appendChild(bar);

    // 結果リスト
    const listWrap = document.createElement('div');
    listWrap.id = 'bf-list';
    listWrap.style.cssText = 'display:flex;flex-direction:column;gap:8px;margin-top:12px;max-height:50vh;overflow-y:auto;padding:4px;';
    containerEl.appendChild(listWrap);

    // 結果表示更新関数
    const renderList = () => {
      const filtered = applyFilter(allBoards);
      listWrap.innerHTML = '';
      if (filtered.length === 0) {
        listWrap.innerHTML = '<div style="text-align:center;color:#999;padding:30px;font-size:13px;">該当するボードがありません</div>';
        return;
      }
      filtered.forEach(b => {
        const card = renderBoardCard(b, onOpen, (id) => {
          if (onDelete) onDelete(id);
          renderList();
        }, openMetaEditor);
        listWrap.appendChild(card);
      });
    };

    // フィルタイベント
    bar.querySelector('#bf-keyword').addEventListener('input', (e) => {
      Organize.filter.keyword = e.target.value;
      renderList();
    });
    bar.querySelector('#bf-subject').addEventListener('change', (e) => {
      Organize.filter.subject = e.target.value;
      renderList();
    });
    bar.querySelector('#bf-grade').addEventListener('change', (e) => {
      Organize.filter.grade = e.target.value;
      renderList();
    });
    bar.querySelector('#bf-folder').addEventListener('change', (e) => {
      Organize.filter.folder = e.target.value;
      renderList();
    });
    bar.querySelector('#bf-fav').addEventListener('change', (e) => {
      Organize.filter.favoriteOnly = e.target.checked;
      renderList();
    });

    renderList();
  }

  // ===== メタデータ編集モーダル =====
  function openMetaEditor(board) {
    let modal = document.getElementById('modal-meta-edit');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'modal-meta-edit';
      modal.className = 'modal-backdrop hidden';
      modal.innerHTML = `
        <div class="modal-panel" style="max-width:500px;">
          <div class="flex items-center justify-between mb-3">
            <h3 class="text-lg font-bold">📝 ボードの整理情報</h3>
            <button class="modal-close"><i class="fa-solid fa-xmark"></i></button>
          </div>
          <div id="meta-form" style="display:flex;flex-direction:column;gap:10px;font-size:13px;">
            <label>ボード名
              <input id="meta-title" type="text" style="width:100%;padding:8px;border:2px solid #ffe8d6;border-radius:8px;margin-top:4px;">
            </label>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
              <label>教科
                <select id="meta-subject" style="width:100%;padding:8px;border:2px solid #ffe8d6;border-radius:8px;margin-top:4px;"></select>
              </label>
              <label>学年
                <select id="meta-grade" style="width:100%;padding:8px;border:2px solid #ffe8d6;border-radius:8px;margin-top:4px;"></select>
              </label>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
              <label>クラス
                <input id="meta-classroom" type="text" placeholder="例: A組" style="width:100%;padding:8px;border:2px solid #ffe8d6;border-radius:8px;margin-top:4px;">
              </label>
              <label>フォルダ
                <input id="meta-folder" type="text" placeholder="例: 2学期" style="width:100%;padding:8px;border:2px solid #ffe8d6;border-radius:8px;margin-top:4px;">
              </label>
            </div>
            <label>タグ（カンマ区切り）
              <input id="meta-tags" type="text" placeholder="例: 公開授業, 単元1, ふりかえり" style="width:100%;padding:8px;border:2px solid #ffe8d6;border-radius:8px;margin-top:4px;">
            </label>
            <label style="display:flex;align-items:center;gap:8px;">
              <input id="meta-fav" type="checkbox"> ⭐ お気に入り
            </label>
            <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:8px;">
              <button id="meta-cancel" class="header-btn">キャンセル</button>
              <button id="meta-save" class="header-btn header-btn-primary">保存</button>
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
      modal.querySelector('.modal-close').addEventListener('click', () => modal.classList.add('hidden'));
      modal.querySelector('#meta-cancel').addEventListener('click', () => modal.classList.add('hidden'));
    }

    // フォーム値設定
    modal.querySelector('#meta-title').value = board.title || '';
    const subjectSel = modal.querySelector('#meta-subject');
    subjectSel.innerHTML = Organize.SUBJECTS.map(s =>
      `<option value="${s.id}" ${board.subject === s.id ? 'selected':''}>${s.label || '教科未設定'}</option>`).join('');
    const gradeSel = modal.querySelector('#meta-grade');
    gradeSel.innerHTML = Organize.GRADES.map(g =>
      `<option value="${g}" ${board.grade === g ? 'selected':''}>${g || '学年未設定'}</option>`).join('');
    modal.querySelector('#meta-classroom').value = board.classroom || '';
    modal.querySelector('#meta-folder').value = board.folder || '';
    modal.querySelector('#meta-tags').value = (board.tags || []).join(', ');
    modal.querySelector('#meta-fav').checked = !!board.favorite;

    // 保存ボタン
    const saveBtn = modal.querySelector('#meta-save');
    const newSaveBtn = saveBtn.cloneNode(true);
    saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);
    newSaveBtn.addEventListener('click', () => {
      const patch = {
        title: modal.querySelector('#meta-title').value.trim() || '無題のボード',
        subject: modal.querySelector('#meta-subject').value,
        grade: modal.querySelector('#meta-grade').value,
        classroom: modal.querySelector('#meta-classroom').value.trim(),
        folder: modal.querySelector('#meta-folder').value.trim(),
        tags: modal.querySelector('#meta-tags').value.split(',').map(t => t.trim()).filter(Boolean),
        favorite: modal.querySelector('#meta-fav').checked,
      };
      window.patchBoardMeta(board.id, patch);
      // 現在開いているボードならState側も更新
      if (window.State && window.State.boardId === board.id) {
        window.State.boardTitle = patch.title;
        const titleInput = document.getElementById('board-title');
        if (titleInput) titleInput.value = patch.title;
      }
      modal.classList.add('hidden');
      if (typeof showToast === 'function') showToast('💾 整理情報を保存しました');
      // ボード一覧を再描画
      const listContainer = document.getElementById('recent-boards-2');
      if (listContainer && !document.getElementById('modal-board-list').classList.contains('hidden')) {
        renderBoardListUI(listContainer, {
          onOpen: window.openBoard || ((id) => location.href = '?board=' + encodeURIComponent(id)),
          onDelete: (id) => {
            window.deleteBoardFromStorage(id);
            if (typeof showToast === 'function') showToast('🗑️ 削除しました');
          },
        });
      }
    });

    modal.classList.remove('hidden');
  }

  // ===== ヘルパー =====
  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function formatRelative(ts) {
    if (!ts) return '-';
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'たった今';
    if (mins < 60) return mins + '分前';
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + '時間前';
    const days = Math.floor(hrs / 24);
    if (days < 30) return days + '日前';
    const d = new Date(ts);
    return `${d.getMonth()+1}/${d.getDate()}`;
  }

  // ===== 公開API =====
  window.Organize = Organize;
  window.renderBoardListUI = renderBoardListUI;
  window.openBoardMetaEditor = openMetaEditor;
  window.getSubjectMeta = getSubjectMeta;
})();
