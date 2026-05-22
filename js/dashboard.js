/* =========================================
   みんなのジャム - 先生用ダッシュボード（v1.5.0 / Phase 4-3）

   主な機能:
   1. ローカル保存全ボードの統計サマリ（ボード数・ページ数・オブジェクト数・コメント数）
   2. 一覧から複数選択（チェックボックス）
   3. 一括操作：JSONエクスポート / 削除 / フォルダ移動 / 教科一括設定
   4. 全データ一括バックアップJSON出力 / 復元

   制約：完全にローカル（クラウド/サーバーなし）。アカウント不要で1ブラウザ完結。
   ========================================= */

(function () {
  'use strict';

  let dashboardModal = null;
  const selectedIds = new Set();

  // ===== モーダル生成 =====
  function ensureModal() {
    if (dashboardModal) return dashboardModal;
    const modal = document.createElement('div');
    modal.id = 'modal-dashboard';
    modal.className = 'modal-backdrop hidden';
    modal.innerHTML = `
      <div class="modal-panel">
        <div class="flex items-center justify-between mb-3">
          <h3 class="text-lg font-bold">
            <i class="fa-solid fa-chalkboard-user" style="color:#ff7e5f;"></i>
            先生用ダッシュボード
          </h3>
          <button class="modal-close" id="dash-close"><i class="fa-solid fa-xmark"></i></button>
        </div>

        <!-- 統計サマリ -->
        <div class="dashboard-stats" id="dash-stats"></div>

        <!-- フィルタバー -->
        <div id="dash-filter-area"></div>

        <!-- 一覧 -->
        <div class="dashboard-board-list" id="dash-board-list"></div>

        <!-- 一括アクション -->
        <div class="dashboard-actions">
          <span id="dash-selected-count" style="font-size:13px;color:#666;align-self:center;">0件選択中</span>
          <button class="dashboard-action-btn" id="dash-select-all">
            <i class="fa-solid fa-check-double"></i>すべて選択
          </button>
          <button class="dashboard-action-btn" id="dash-deselect">
            <i class="fa-solid fa-square"></i>選択解除
          </button>
          <button class="dashboard-action-btn" id="dash-batch-folder">
            <i class="fa-solid fa-folder"></i>フォルダ設定
          </button>
          <button class="dashboard-action-btn" id="dash-batch-subject">
            <i class="fa-solid fa-tag"></i>教科設定
          </button>
          <button class="dashboard-action-btn" id="dash-batch-export">
            <i class="fa-solid fa-file-export"></i>選択をJSONエクスポート
          </button>
          <button class="dashboard-action-btn" id="dash-batch-delete" style="background:#ffe0e0;border-color:#ffb8b8;color:#d63031;">
            <i class="fa-solid fa-trash"></i>選択を削除
          </button>
          <span style="flex:1"></span>
          <button class="dashboard-action-btn" id="dash-backup-all" style="background:#fff5ec;">
            <i class="fa-solid fa-cloud-arrow-down"></i>全データバックアップ
          </button>
          <button class="dashboard-action-btn" id="dash-restore">
            <i class="fa-solid fa-cloud-arrow-up"></i>復元
          </button>
          <input type="file" id="dash-restore-file" accept="application/json" style="display:none;">
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    dashboardModal = modal;

    // 閉じるボタン
    modal.querySelector('#dash-close').addEventListener('click', closeDashboard);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeDashboard();
    });

    // 各種ボタン
    modal.querySelector('#dash-select-all').addEventListener('click', () => {
      const boards = window.listSavedBoards();
      boards.forEach(b => selectedIds.add(b.id));
      renderBoardList();
      updateSelectedCount();
    });
    modal.querySelector('#dash-deselect').addEventListener('click', () => {
      selectedIds.clear();
      renderBoardList();
      updateSelectedCount();
    });
    modal.querySelector('#dash-batch-folder').addEventListener('click', batchSetFolder);
    modal.querySelector('#dash-batch-subject').addEventListener('click', batchSetSubject);
    modal.querySelector('#dash-batch-export').addEventListener('click', batchExport);
    modal.querySelector('#dash-batch-delete').addEventListener('click', batchDelete);
    modal.querySelector('#dash-backup-all').addEventListener('click', backupAll);
    modal.querySelector('#dash-restore').addEventListener('click', () => {
      modal.querySelector('#dash-restore-file').click();
    });
    modal.querySelector('#dash-restore-file').addEventListener('change', restoreFromFile);

    return modal;
  }

  // ===== 統計算出 =====
  function computeStats(boards) {
    let totalPages = 0, totalObjects = 0, totalComments = 0;
    boards.forEach(b => {
      totalPages += b.pageCount || 0;
      totalObjects += b.objectCount || 0;
      totalComments += b.commentCount || 0;
    });
    return {
      boardCount: boards.length,
      totalPages,
      totalObjects,
      totalComments,
    };
  }

  function renderStats() {
    const boards = window.listSavedBoards();
    const stats = computeStats(boards);
    const el = document.getElementById('dash-stats');
    if (!el) return;
    el.innerHTML = `
      <div class="dashboard-stat-card">
        <div class="stat-num">${stats.boardCount}</div>
        <div class="stat-label">ボード数</div>
      </div>
      <div class="dashboard-stat-card">
        <div class="stat-num">${stats.totalPages}</div>
        <div class="stat-label">合計ページ</div>
      </div>
      <div class="dashboard-stat-card">
        <div class="stat-num">${stats.totalObjects}</div>
        <div class="stat-label">合計オブジェクト</div>
      </div>
      <div class="dashboard-stat-card">
        <div class="stat-num">${stats.totalComments}</div>
        <div class="stat-label">合計コメント</div>
      </div>
    `;
  }

  // ===== 一覧描画（チェックボックス付き）=====
  function renderBoardList() {
    const listEl = document.getElementById('dash-board-list');
    if (!listEl) return;
    const filterArea = document.getElementById('dash-filter-area');
    const allBoards = window.listSavedBoards();

    // フィルタバーを使い回し（organize.jsのスタイル）
    if (filterArea && filterArea.dataset.inited !== '1') {
      filterArea.dataset.inited = '1';
      filterArea.innerHTML = `
        <div class="board-filter-bar">
          <input type="text" id="dash-kw" placeholder="🔍 検索（タイトル・タグ・学年・教科）">
          <select id="dash-subj"><option value="">教科すべて</option></select>
          <select id="dash-grd"><option value="">学年すべて</option></select>
          <label style="font-size:13px;color:#666;display:inline-flex;align-items:center;gap:4px;">
            <input type="checkbox" id="dash-fav"> ⭐のみ
          </label>
        </div>
      `;
      // 教科・学年セレクトを populate
      const subjSel = filterArea.querySelector('#dash-subj');
      window.Organize.SUBJECTS.filter(s => s.id).forEach(s => {
        const o = document.createElement('option');
        o.value = s.id; o.textContent = s.label;
        subjSel.appendChild(o);
      });
      const gradeSel = filterArea.querySelector('#dash-grd');
      window.Organize.GRADES.filter(g => g).forEach(g => {
        const o = document.createElement('option');
        o.value = g; o.textContent = g;
        gradeSel.appendChild(o);
      });
      // イベント
      filterArea.querySelector('#dash-kw').addEventListener('input', renderBoardList);
      filterArea.querySelector('#dash-subj').addEventListener('change', renderBoardList);
      filterArea.querySelector('#dash-grd').addEventListener('change', renderBoardList);
      filterArea.querySelector('#dash-fav').addEventListener('change', renderBoardList);
    }

    // 現在のフィルタ取得
    const kw = (document.getElementById('dash-kw')?.value || '').toLowerCase();
    const subj = document.getElementById('dash-subj')?.value || '';
    const grd = document.getElementById('dash-grd')?.value || '';
    const favOnly = document.getElementById('dash-fav')?.checked;

    const filtered = allBoards.filter(b => {
      if (favOnly && !b.favorite) return false;
      if (subj && b.subject !== subj) return false;
      if (grd && b.grade !== grd) return false;
      if (kw) {
        const hay = [b.title, (b.tags||[]).join(' '),
          window.getSubjectMeta(b.subject).label,
          b.grade, b.classroom, b.folder].join(' ').toLowerCase();
        if (!hay.includes(kw)) return false;
      }
      return true;
    });

    listEl.innerHTML = '';
    if (filtered.length === 0) {
      listEl.innerHTML = '<div style="text-align:center;color:#999;padding:30px;font-size:13px;">該当するボードがありません</div>';
      return;
    }
    filtered.forEach(b => {
      const card = document.createElement('div');
      card.className = 'board-card';
      const subjMeta = window.getSubjectMeta(b.subject);
      const checked = selectedIds.has(b.id);
      const fav = b.favorite ? '<i class="fa-solid fa-star" style="color:#ffb800;"></i>' : '';
      card.innerHTML = `
        <input type="checkbox" class="dashboard-checkbox dash-cb" data-id="${b.id}" ${checked ? 'checked' : ''}>
        <div class="board-info">
          <div class="board-title">${fav} ${escapeHtml(b.title)}</div>
          <div class="board-meta">
            ${b.pageCount}ページ・${b.objectCount}個・💬${b.commentCount} ・ ${formatRelative(b.updatedAt)}
          </div>
          <div class="board-tags">
            <span class="board-tag ${subjMeta.cls}">${subjMeta.label}</span>
            ${b.grade ? `<span class="board-tag">${escapeHtml(b.grade)}${b.classroom ? ' '+escapeHtml(b.classroom) : ''}</span>` : ''}
            ${b.folder ? `<span class="board-folder-chip"><i class="fa-solid fa-folder"></i>${escapeHtml(b.folder)}</span>` : ''}
            ${(b.tags||[]).slice(0,3).map(t => `<span class="board-tag">${escapeHtml(t)}</span>`).join('')}
          </div>
        </div>
        <div class="board-actions">
          <button class="board-action-btn" title="開く" data-action="open"><i class="fa-solid fa-folder-open"></i></button>
          <button class="board-action-btn" title="編集" data-action="edit"><i class="fa-solid fa-tag"></i></button>
        </div>
      `;
      // チェック
      card.querySelector('.dash-cb').addEventListener('change', (e) => {
        if (e.target.checked) selectedIds.add(b.id);
        else selectedIds.delete(b.id);
        updateSelectedCount();
      });
      // アクション
      card.querySelector('[data-action="open"]').addEventListener('click', (e) => {
        e.stopPropagation();
        if (typeof window.openBoard === 'function') window.openBoard(b.id);
      });
      card.querySelector('[data-action="edit"]').addEventListener('click', (e) => {
        e.stopPropagation();
        if (typeof window.openBoardMetaEditor === 'function') window.openBoardMetaEditor(b);
      });
      listEl.appendChild(card);
    });
  }

  function updateSelectedCount() {
    const el = document.getElementById('dash-selected-count');
    if (el) el.textContent = `${selectedIds.size}件選択中`;
  }

  // ===== 一括操作: フォルダ設定 =====
  function batchSetFolder() {
    if (selectedIds.size === 0) {
      if (typeof showToast === 'function') showToast('⚠️ ボードを選択してください');
      return;
    }
    const folder = prompt('フォルダ名を入力（空欄でフォルダ解除）', '');
    if (folder === null) return;
    selectedIds.forEach(id => window.patchBoardMeta(id, { folder: folder.trim() }));
    if (typeof showToast === 'function') showToast(`📁 ${selectedIds.size}件のフォルダを設定しました`);
    renderBoardList();
  }

  // ===== 一括操作: 教科設定 =====
  function batchSetSubject() {
    if (selectedIds.size === 0) {
      if (typeof showToast === 'function') showToast('⚠️ ボードを選択してください');
      return;
    }
    const labels = window.Organize.SUBJECTS.map((s, i) => `${i}: ${s.label || '未設定'}`).join('\n');
    const idx = prompt('教科番号を入力\n' + labels, '0');
    if (idx === null) return;
    const i = parseInt(idx, 10);
    if (isNaN(i) || i < 0 || i >= window.Organize.SUBJECTS.length) {
      if (typeof showToast === 'function') showToast('⚠️ 不正な番号です');
      return;
    }
    const sid = window.Organize.SUBJECTS[i].id;
    selectedIds.forEach(id => window.patchBoardMeta(id, { subject: sid }));
    if (typeof showToast === 'function') showToast(`🏷️ ${selectedIds.size}件の教科を設定しました`);
    renderBoardList();
  }

  // ===== 一括操作: JSONエクスポート =====
  function batchExport() {
    if (selectedIds.size === 0) {
      if (typeof showToast === 'function') showToast('⚠️ ボードを選択してください');
      return;
    }
    const exportObj = {
      type: 'minnanojam-batch-export',
      version: '1.5.0',
      exportedAt: Date.now(),
      boards: [],
    };
    selectedIds.forEach(id => {
      const data = window.loadBoardFromStorage(id);
      if (data) exportObj.boards.push(data);
    });
    const blob = new Blob([JSON.stringify(exportObj, null, 2)], { type: 'application/json' });
    downloadBlob(blob, `minnanojam_export_${formatTimestamp()}.json`);
    if (typeof showToast === 'function') showToast(`📦 ${exportObj.boards.length}件をエクスポートしました`);
  }

  // ===== 一括操作: 削除 =====
  function batchDelete() {
    if (selectedIds.size === 0) {
      if (typeof showToast === 'function') showToast('⚠️ ボードを選択してください');
      return;
    }
    if (!confirm(`選択した ${selectedIds.size}件のボードを削除します。\n本当によろしいですか？\n（元に戻せません）`)) return;
    const ids = Array.from(selectedIds);
    ids.forEach(id => window.deleteBoardFromStorage(id));
    selectedIds.clear();
    if (typeof showToast === 'function') showToast(`🗑️ ${ids.length}件を削除しました`);
    renderStats();
    renderBoardList();
    updateSelectedCount();
  }

  // ===== 全データバックアップ =====
  function backupAll() {
    const boards = window.listSavedBoards();
    const exportObj = {
      type: 'minnanojam-full-backup',
      version: '1.5.0',
      exportedAt: Date.now(),
      boards: boards.map(b => window.loadBoardFromStorage(b.id)).filter(Boolean),
    };
    const blob = new Blob([JSON.stringify(exportObj, null, 2)], { type: 'application/json' });
    downloadBlob(blob, `minnanojam_backup_${formatTimestamp()}.json`);
    if (typeof showToast === 'function') showToast(`💾 全 ${exportObj.boards.length}件をバックアップしました`);
  }

  // ===== 復元 =====
  function restoreFromFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        if (!data.boards || !Array.isArray(data.boards)) {
          throw new Error('boards 配列がありません');
        }
        const overwrite = confirm(`${data.boards.length}件のボードを復元します。\n同じIDのボードがあれば上書きされます。\nよろしいですか？`);
        if (!overwrite) return;
        let imported = 0;
        data.boards.forEach(b => {
          if (!b || !b.id) return;
          try {
            localStorage.setItem(window.STORAGE_PREFIX + b.id, JSON.stringify(b));
            imported++;
          } catch (err) {
            console.warn('復元エラー:', err);
          }
        });
        if (typeof showToast === 'function') showToast(`📥 ${imported}件を復元しました`);
        renderStats();
        renderBoardList();
      } catch (err) {
        if (typeof showToast === 'function') showToast('⚠️ ファイルの読み込みに失敗しました：' + err.message);
        console.error(err);
      }
      // input をリセット
      e.target.value = '';
    };
    reader.readAsText(file);
  }

  // ===== ヘルパー =====
  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  }

  function formatTimestamp() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
  }

  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function formatRelative(ts) {
    if (!ts) return '-';
    const diff = Date.now() - ts;
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'たった今';
    if (m < 60) return m + '分前';
    const h = Math.floor(m / 60);
    if (h < 24) return h + '時間前';
    const day = Math.floor(h / 24);
    return day + '日前';
  }

  // ===== 公開 =====
  function openDashboard() {
    ensureModal();
    selectedIds.clear();
    renderStats();
    renderBoardList();
    updateSelectedCount();
    dashboardModal.classList.remove('hidden');
  }
  function closeDashboard() {
    if (dashboardModal) dashboardModal.classList.add('hidden');
  }

  window.openTeacherDashboard = openDashboard;
  window.closeTeacherDashboard = closeDashboard;

  // ヘッダーボタンを追加
  function installHeaderButton() {
    if (document.getElementById('btn-dashboard')) return;
    const btn = document.createElement('button');
    btn.id = 'btn-dashboard';
    btn.className = 'header-btn hidden lg:inline-flex';
    btn.title = '先生用ダッシュボード（全ボード一括管理）';
    btn.innerHTML = '<i class="fa-solid fa-chalkboard-user"></i>';
    btn.addEventListener('click', openDashboard);

    const helpBtn = document.getElementById('btn-help');
    if (helpBtn && helpBtn.parentNode) {
      helpBtn.parentNode.insertBefore(btn, helpBtn);
    } else {
      const header = document.getElementById('app-header');
      if (header) header.appendChild(btn);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(installHeaderButton, 350));
  } else {
    setTimeout(installHeaderButton, 350);
  }
})();
