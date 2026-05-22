/* =========================================
   みんなのジャム - ページ管理
   ========================================= */

const MAX_PAGES = 30;

function addPage(afterIndex) {
  if (State.pages.length >= MAX_PAGES) {
    showToast(`⚠️ ページは最大${MAX_PAGES}枚までです`);
    return;
  }
  const newPage = createNewPage();
  const insertAt = (afterIndex !== undefined ? afterIndex + 1 : State.pages.length);
  State.pages.splice(insertAt, 0, newPage);
  State.currentPageIndex = insertAt;
  renderCurrentPage();
  renderPagesList();
  pushHistory();
  saveBoardToStorage();
  broadcastChange();
  showToast('✨ 新しいページを追加しました');
}

// [B24修正] インデックス調整ロジックを整理
function deletePage(index) {
  if (State.pages.length <= 1) {
    showToast('❗ ページは最低1枚必要です');
    return;
  }
  if (!confirm('このページを削除しますか？')) return;

  // 削除前のインデックス関係を整理
  const wasCurrent = State.currentPageIndex;
  State.pages.splice(index, 1);

  // 現在ページの調整（1回だけ）
  let newCurrent = wasCurrent;
  if (index < wasCurrent) {
    newCurrent = wasCurrent - 1;
  } else if (index === wasCurrent) {
    newCurrent = Math.min(wasCurrent, State.pages.length - 1);
  }
  // 範囲外ガード
  newCurrent = Math.max(0, Math.min(newCurrent, State.pages.length - 1));
  State.currentPageIndex = newCurrent;

  renderCurrentPage();
  renderPagesList();
  pushHistory();
  saveBoardToStorage();
  broadcastChange();
}

function duplicatePage(index) {
  if (State.pages.length >= MAX_PAGES) {
    showToast(`⚠️ ページは最大${MAX_PAGES}枚までです`);
    return;
  }
  const clone = JSON.parse(JSON.stringify(State.pages[index]));
  clone.id = 'p_' + Math.random().toString(36).slice(2, 10);
  // オブジェクトのIDも再生成
  clone.objects.forEach(o => { o.id = uid(); });
  State.pages.splice(index + 1, 0, clone);
  State.currentPageIndex = index + 1;
  renderCurrentPage();
  renderPagesList();
  pushHistory();
  saveBoardToStorage();
  broadcastChange();
  showToast('✨ ページを複製しました');
}

function switchPage(index) {
  if (index < 0 || index >= State.pages.length) return;
  if (index === State.currentPageIndex) return;
  State.currentPageIndex = index;
  renderCurrentPage();
  renderPagesList();
  broadcastViewChange();
  // ページ切り替えで他参加者のリモートカーソルを一旦消す
  if (typeof clearAllRemoteCursors === 'function') {
    clearAllRemoteCursors();
  }
}

// [B14修正] 背景を今表示中のページに対して変更（インデックス操作を排除）
function changeBackgroundForPage(pageIndex, bg) {
  const page = State.pages[pageIndex];
  if (!page) return;
  page.background = bg;
  // 現在表示中のページなら再描画
  if (pageIndex === State.currentPageIndex) {
    drawBackground();
  }
  pushHistory();
  saveBoardToStorage();
  broadcastChange();
  updatePageThumb(pageIndex);
}

function renderPagesList() {
  const list = document.getElementById('pages-list');
  if (!list) return;
  list.innerHTML = '';
  State.pages.forEach((page, index) => {
    const thumb = document.createElement('div');
    thumb.className = 'page-thumb' + (index === State.currentPageIndex ? ' active' : '');
    thumb.dataset.index = index;
    thumb.innerHTML = `
      <div class="thumb-num">${index + 1}</div>
      <div class="thumb-actions">
        <button class="thumb-action" data-act="duplicate" title="複製"><i class="fa-regular fa-clone"></i></button>
        <button class="thumb-action" data-act="delete" title="削除"><i class="fa-regular fa-trash-can"></i></button>
      </div>
      <div class="thumb-canvas" id="thumb-canvas-${index}"></div>
      <div class="flex items-center justify-between mt-2 gap-1">
        <select class="flex-1 text-[10px] bg-orange-50 border border-orange-200 rounded px-1 py-0.5 focus:outline-none" data-bg="${index}">
          <optgroup label="基本">
            <option value="blank" ${page.background === 'blank' ? 'selected' : ''}>無地</option>
            <option value="grid" ${page.background === 'grid' ? 'selected' : ''}>方眼</option>
            <option value="dots" ${page.background === 'dots' ? 'selected' : ''}>ドット</option>
            <option value="lined" ${page.background === 'lined' ? 'selected' : ''}>罫線</option>
          </optgroup>
          <optgroup label="教材テンプレート">
            <option value="genko" ${page.background === 'genko' ? 'selected' : ''}>📖 原稿用紙</option>
            <option value="math-grid" ${page.background === 'math-grid' ? 'selected' : ''}>📐 算数方眼+座標</option>
            <option value="science" ${page.background === 'science' ? 'selected' : ''}>🔍 観察カード</option>
            <option value="music" ${page.background === 'music' ? 'selected' : ''}>🎵 5線譜</option>
            <option value="cross" ${page.background === 'cross' ? 'selected' : ''}>✏️ 書写ガイド</option>
          </optgroup>
        </select>
      </div>
    `;
    thumb.addEventListener('click', (e) => {
      if (e.target.closest('.thumb-action')) return;
      if (e.target.tagName === 'SELECT' || e.target.tagName === 'OPTION') return;
      switchPage(index);
    });
    thumb.querySelectorAll('.thumb-action').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const act = btn.dataset.act;
        if (act === 'duplicate') duplicatePage(index);
        if (act === 'delete') deletePage(index);
      });
    });
    const sel = thumb.querySelector('select');
    sel.addEventListener('click', (e) => e.stopPropagation());
    sel.addEventListener('change', (e) => {
      e.stopPropagation();
      changeBackgroundForPage(index, e.target.value);
    });
    list.appendChild(thumb);

    renderThumb(index);
  });
  updatePageCount();
}

function updatePageCount() {
  const el = document.getElementById('page-count');
  if (el) {
    el.textContent = `${State.currentPageIndex + 1} / ${State.pages.length}`;
  }
}

// サムネイル描画（SVGで軽量）
function renderThumb(index) {
  const container = document.getElementById('thumb-canvas-' + index);
  if (!container) return;
  const page = State.pages[index];
  if (!page) return;

  const bgColor = '#ffffff';
  // v1.8.0 (Phase 8): 取り込み背景画像のサムネ表示
  let bgImage = '';
  if (page.backgroundImage && page.backgroundImage.src) {
    const op = typeof page.backgroundImage.opacity === 'number' ? page.backgroundImage.opacity : 1;
    // SVGのpreserveAspectRatio で fit を再現
    const fit = page.backgroundImage.fit || 'contain';
    let par = 'xMidYMid meet'; // contain
    if (fit === 'cover') par = 'xMidYMid slice';
    else if (fit === 'stretch') par = 'none';
    bgImage = `<image href="${page.backgroundImage.src}" x="0" y="0" width="400" height="250" preserveAspectRatio="${par}" opacity="${op}"/>`;
  }
  let bgPattern = '';
  if (page.background === 'grid') {
    bgPattern = `<defs><pattern id="g${index}" width="16" height="16" patternUnits="userSpaceOnUse"><path d="M 16 0 L 0 0 0 16" fill="none" stroke="#e8f0ff" stroke-width="0.5"/></pattern></defs><rect width="100%" height="100%" fill="url(#g${index})"/>`;
  } else if (page.background === 'dots') {
    bgPattern = `<defs><pattern id="d${index}" width="16" height="16" patternUnits="userSpaceOnUse"><circle cx="8" cy="8" r="0.8" fill="#c8d4e8"/></pattern></defs><rect width="100%" height="100%" fill="url(#d${index})"/>`;
  } else if (page.background === 'lined') {
    bgPattern = `<defs><pattern id="l${index}" width="100" height="20" patternUnits="userSpaceOnUse"><line x1="4" y1="18" x2="96" y2="18" stroke="#e0e8f0" stroke-width="0.5"/></pattern></defs><rect width="100%" height="100%" fill="url(#l${index})"/>`;
  } else if (page.background === 'genko') {
    bgPattern = `<defs><pattern id="gk${index}" width="10" height="10" patternUnits="userSpaceOnUse"><rect width="10" height="10" fill="none" stroke="#f0a8a3" stroke-width="0.4"/></pattern></defs><rect width="100%" height="100%" fill="url(#gk${index})"/>`;
  } else if (page.background === 'math-grid') {
    bgPattern = `<defs><pattern id="mg${index}" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M 20 0 L 0 0 0 20" fill="none" stroke="#b8d0e8" stroke-width="0.5"/></pattern></defs><rect width="100%" height="100%" fill="url(#mg${index})"/><line x1="50%" y1="0" x2="50%" y2="100%" stroke="#5a8fc0" stroke-width="0.6"/><line x1="0" y1="50%" x2="100%" y2="50%" stroke="#5a8fc0" stroke-width="0.6"/>`;
  } else if (page.background === 'science') {
    bgPattern = `<rect x="6" y="6" width="92%" height="20%" fill="none" stroke="#9ed09e" stroke-width="0.6" rx="2"/><rect x="6" y="34%" width="44%" height="60%" fill="none" stroke="#9ed09e" stroke-width="0.5" stroke-dasharray="2 1" rx="2"/><rect x="52%" y="34%" width="44%" height="60%" fill="none" stroke="#9ed09e" stroke-width="0.5" stroke-dasharray="2 1" rx="2"/>`;
  } else if (page.background === 'music') {
    let lines = '';
    for (let s = 0; s < 4; s++) {
      const cy = 25 + s * 60;
      for (let i = 0; i < 5; i++) {
        lines += `<line x1="10" y1="${cy + i * 5}" x2="390" y2="${cy + i * 5}" stroke="#3c3c5a" stroke-width="0.4"/>`;
      }
    }
    bgPattern = lines;
  } else if (page.background === 'cross') {
    bgPattern = `<line x1="50%" y1="0" x2="50%" y2="100%" stroke="#e0c8d8" stroke-width="0.6" stroke-dasharray="3 2"/><line x1="0" y1="50%" x2="100%" y2="50%" stroke="#e0c8d8" stroke-width="0.6" stroke-dasharray="3 2"/><line x1="0" y1="0" x2="100%" y2="100%" stroke="#f0e0e8" stroke-width="0.4"/><line x1="100%" y1="0" x2="0" y2="100%" stroke="#f0e0e8" stroke-width="0.4"/>`;
  }

  const scaleX = 400 / BOARD_WIDTH;
  const scaleY = 250 / BOARD_HEIGHT;
  let shapes = '';
  page.objects.forEach(obj => {
    const x = (obj.x || 0) * scaleX;
    const y = (obj.y || 0) * scaleY;
    if (obj.type === 'sticky') {
      const w = (obj.width || 180) * scaleX;
      const h = (obj.height || 180) * scaleY;
      shapes += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${obj.color}" rx="2"/>`;
    } else if (obj.type === 'pen' || obj.type === 'marker') {
      if (obj.points && obj.points.length >= 4) {
        let d = `M ${obj.points[0] * scaleX} ${obj.points[1] * scaleY}`;
        for (let i = 2; i < obj.points.length; i += 2) {
          d += ` L ${obj.points[i] * scaleX} ${obj.points[i + 1] * scaleY}`;
        }
        const sw = Math.max(0.5, (obj.size || 4) * scaleX * 1.5);
        shapes += `<path d="${d}" stroke="${obj.color}" stroke-width="${sw}" fill="none" opacity="${obj.type === 'marker' ? 0.45 : 1}" stroke-linecap="round" stroke-linejoin="round"/>`;
      }
    } else if (obj.type === 'rect') {
      const w = (obj.width || 40) * scaleX;
      const h = (obj.height || 40) * scaleY;
      shapes += `<rect x="${x}" y="${y}" width="${w}" height="${h}" stroke="${obj.color}" fill="${obj.fill || 'none'}" stroke-width="1"/>`;
    } else if (obj.type === 'circle') {
      const w = (obj.width || 40) * scaleX;
      const h = (obj.height || 40) * scaleY;
      shapes += `<ellipse cx="${x + w / 2}" cy="${y + h / 2}" rx="${w / 2}" ry="${h / 2}" stroke="${obj.color}" fill="${obj.fill || 'none'}" stroke-width="1"/>`;
    } else if (obj.type === 'triangle') {
      const w = (obj.width || 40) * scaleX;
      const h = (obj.height || 40) * scaleY;
      shapes += `<polygon points="${x + w / 2},${y} ${x + w},${y + h} ${x},${y + h}" stroke="${obj.color}" fill="${obj.fill || 'none'}" stroke-width="1"/>`;
    } else if (obj.type === 'line' || obj.type === 'arrow') {
      if (obj.points && obj.points.length >= 4) {
        shapes += `<line x1="${obj.points[0] * scaleX}" y1="${obj.points[1] * scaleY}" x2="${obj.points[2] * scaleX}" y2="${obj.points[3] * scaleY}" stroke="${obj.color}" stroke-width="1"/>`;
      }
    } else if (obj.type === 'text') {
      const txt = escapeXml((obj.text || '').substring(0, 20));
      shapes += `<text x="${x}" y="${y + 10}" fill="${obj.color || '#3a3a3a'}" font-size="8">${txt}</text>`;
    } else if (obj.type === 'image') {
      const w = (obj.width || 100) * scaleX;
      const h = (obj.height || 100) * scaleY;
      shapes += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#f0f0f0" stroke="#ccc" stroke-width="0.5"/><text x="${x + w/2}" y="${y + h/2 + 3}" text-anchor="middle" fill="#999" font-size="7">IMG</text>`;
    }
  });

  container.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 250" preserveAspectRatio="xMidYMid meet" style="width:100%;height:100%;background:${bgColor}">${bgImage}${bgPattern}${shapes}</svg>`;
}

function updatePageThumb(index) {
  renderThumb(index);
}

function escapeXml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
