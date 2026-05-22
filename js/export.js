/* =========================================
   みんなのジャム - エクスポート機能
   ========================================= */

// [B01修正] 重複定義を整理し、async版のみ使用

async function exportCurrentPagePNG() {
  try {
    const dataURL = await renderPageToDataURLIndex(State.currentPageIndex);
    downloadDataURL(dataURL, `${sanitizeFilename(State.boardTitle)}_p${State.currentPageIndex + 1}.png`);
    showToast('📸 PNG画像を保存しました');
  } catch (err) {
    console.error(err);
    showToast('⚠️ 画像の書き出しに失敗しました');
  }
}

async function exportAllPagesPNG() {
  try {
    showToast(`📸 ${State.pages.length}枚の画像を書き出し中...`);
    for (let i = 0; i < State.pages.length; i++) {
      const dataURL = await renderPageToDataURLIndex(i);
      downloadDataURL(dataURL, `${sanitizeFilename(State.boardTitle)}_p${i + 1}.png`);
      await new Promise(r => setTimeout(r, 250));
    }
    showToast('✅ 全ページを保存しました');
  } catch (err) {
    console.error(err);
    showToast('⚠️ 画像の書き出しに失敗しました');
  }
}

async function exportPDF() {
  try {
    if (!window.jspdf || !window.jspdf.jsPDF) {
      showToast('⚠️ PDFライブラリの読み込みに失敗しました');
      return;
    }
    const { jsPDF } = window.jspdf;
    showToast('📄 PDFを作成中...');
    const pdf = new jsPDF({
      orientation: 'landscape',
      unit: 'px',
      format: [BOARD_WIDTH, BOARD_HEIGHT],
    });

    for (let i = 0; i < State.pages.length; i++) {
      const dataURL = await renderPageToDataURLIndex(i);
      if (i > 0) pdf.addPage([BOARD_WIDTH, BOARD_HEIGHT], 'landscape');
      pdf.addImage(dataURL, 'PNG', 0, 0, BOARD_WIDTH, BOARD_HEIGHT);
    }

    pdf.save(`${sanitizeFilename(State.boardTitle)}.pdf`);
    showToast('✅ PDFを保存しました');
  } catch (err) {
    console.error(err);
    showToast('⚠️ PDFの書き出しに失敗しました');
  }
}

function exportJSON() {
  try {
    const data = {
      app: 'みんなのジャム',
      version: 1,
      title: State.boardTitle,
      pages: State.pages,
      exportedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${sanitizeFilename(State.boardTitle)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // URL解放は少し後に
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast('💾 データを保存しました');
  } catch (err) {
    console.error(err);
    showToast('⚠️ データの保存に失敗しました');
  }
}

function importJSON(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      if (!data.pages || !Array.isArray(data.pages) || data.pages.length === 0) {
        showToast('⚠️ ファイルの形式が正しくありません');
        return;
      }
      if (!confirm('現在のボードは上書きされます。続けますか？')) return;
      State.boardTitle = data.title || '復元されたボード';
      State.pages = data.pages;
      State.currentPageIndex = 0;
      const titleInput = document.getElementById('board-title');
      if (titleInput) titleInput.value = State.boardTitle;
      renderCurrentPage();
      renderPagesList();
      pushHistory();
      saveBoardToStorage();
      broadcastChange();
      showToast('✅ ボードを復元しました');
    } catch (err) {
      console.error(err);
      showToast('⚠️ ファイルの読み込みに失敗しました');
    }
  };
  reader.onerror = () => {
    showToast('⚠️ ファイルの読み込みに失敗しました');
  };
  reader.readAsText(file);
}

// 任意のページを一時ステージに描画してDataURL化（画像待機対応）
function renderPageToDataURLIndex(index) {
  return new Promise((resolve, reject) => {
    try {
      const page = State.pages[index];
      if (!page) {
        reject(new Error('ページが見つかりません'));
        return;
      }

      const tempDiv = document.createElement('div');
      tempDiv.style.position = 'absolute';
      tempDiv.style.left = '-9999px';
      tempDiv.style.top = '0';
      tempDiv.style.width = BOARD_WIDTH + 'px';
      tempDiv.style.height = BOARD_HEIGHT + 'px';
      document.body.appendChild(tempDiv);

      const tempStage = new Konva.Stage({
        container: tempDiv,
        width: BOARD_WIDTH,
        height: BOARD_HEIGHT,
      });
      // v1.8.0 (Phase 8): 取り込み背景画像を独立した最下層に置く
      const bgLayer = new Konva.Layer();
      const tempLayer = new Konva.Layer();
      tempStage.add(bgLayer);
      tempStage.add(tempLayer);

      // 背景
      bgLayer.add(new Konva.Rect({
        x: 0, y: 0, width: BOARD_WIDTH, height: BOARD_HEIGHT, fill: '#ffffff',
      }));

      // v1.8.0 (Phase 8): 取り込み背景画像
      var _bgImgPromise = null;
      if (page.backgroundImage && page.backgroundImage.src) {
        const bi = page.backgroundImage;
        _bgImgPromise = new Promise((res) => {
          const imgEl = new Image();
          imgEl.onload = () => {
            const fit = bi.fit || 'contain';
            let dw = BOARD_WIDTH, dh = BOARD_HEIGHT, dx = 0, dy = 0;
            const ratio = imgEl.width / imgEl.height;
            const boardRatio = BOARD_WIDTH / BOARD_HEIGHT;
            if (fit === 'contain') {
              if (ratio > boardRatio) { dw = BOARD_WIDTH; dh = BOARD_WIDTH / ratio; }
              else { dh = BOARD_HEIGHT; dw = BOARD_HEIGHT * ratio; }
              dx = (BOARD_WIDTH - dw) / 2; dy = (BOARD_HEIGHT - dh) / 2;
            } else if (fit === 'cover') {
              if (ratio > boardRatio) { dh = BOARD_HEIGHT; dw = BOARD_HEIGHT * ratio; }
              else { dw = BOARD_WIDTH; dh = BOARD_WIDTH / ratio; }
              dx = (BOARD_WIDTH - dw) / 2; dy = (BOARD_HEIGHT - dh) / 2;
            }
            bgLayer.add(new Konva.Image({
              x: dx, y: dy, width: dw, height: dh,
              image: imgEl,
              opacity: typeof bi.opacity === 'number' ? bi.opacity : 1,
            }));
            bgLayer.batchDraw();
            res();
          };
          imgEl.onerror = () => res();
          imgEl.src = bi.src;
        });
      }

      if (page.background === 'grid') {
        const step = 40;
        for (let x = 0; x <= BOARD_WIDTH; x += step) {
          tempLayer.add(new Konva.Line({
            points: [x, 0, x, BOARD_HEIGHT],
            stroke: '#e8f0ff', strokeWidth: 1,
          }));
        }
        for (let y = 0; y <= BOARD_HEIGHT; y += step) {
          tempLayer.add(new Konva.Line({
            points: [0, y, BOARD_WIDTH, y],
            stroke: '#e8f0ff', strokeWidth: 1,
          }));
        }
      } else if (page.background === 'dots') {
        const step = 40;
        for (let x = step; x < BOARD_WIDTH; x += step) {
          for (let y = step; y < BOARD_HEIGHT; y += step) {
            tempLayer.add(new Konva.Circle({ x, y, radius: 1.5, fill: '#c8d4e8' }));
          }
        }
      } else if (page.background === 'lined') {
        const step = 50;
        for (let y = step; y < BOARD_HEIGHT; y += step) {
          tempLayer.add(new Konva.Line({
            points: [40, y, BOARD_WIDTH - 40, y],
            stroke: '#e0e8f0', strokeWidth: 1,
          }));
        }
      } else if (page.background === 'genko' && typeof drawGenkoPattern === 'function') {
        // v1.8.1: 教材テンプレ背景もエクスポートに含める
        const patternGroup = new Konva.Group();
        tempLayer.add(patternGroup);
        drawGenkoPattern(patternGroup);
      } else if (page.background === 'math-grid' && typeof drawMathGridPattern === 'function') {
        const patternGroup = new Konva.Group();
        tempLayer.add(patternGroup);
        drawMathGridPattern(patternGroup);
      } else if (page.background === 'science' && typeof drawSciencePattern === 'function') {
        const patternGroup = new Konva.Group();
        tempLayer.add(patternGroup);
        drawSciencePattern(patternGroup);
      } else if (page.background === 'music' && typeof drawMusicPattern === 'function') {
        const patternGroup = new Konva.Group();
        tempLayer.add(patternGroup);
        drawMusicPattern(patternGroup);
      } else if (page.background === 'cross' && typeof drawCrossPattern === 'function') {
        const patternGroup = new Konva.Group();
        tempLayer.add(patternGroup);
        drawCrossPattern(patternGroup);
      }

      // オブジェクト
      const pendingImages = [];
      // 背景画像のロード待ちも pendingImages に含める（Phase 8）
      if (typeof _bgImgPromise !== 'undefined' && _bgImgPromise) {
        pendingImages.push(_bgImgPromise);
      }
      page.objects.forEach(obj => {
        const node = createNodeFromDataNoHandler(obj, pendingImages);
        if (node) tempLayer.add(node);
      });

      const finalize = () => {
        try {
          tempLayer.batchDraw();
          const dataURL = tempStage.toDataURL({ pixelRatio: 1.5, mimeType: 'image/png' });
          tempStage.destroy();
          if (tempDiv.parentNode) tempDiv.remove();
          resolve(dataURL);
        } catch (err) {
          try { tempStage.destroy(); } catch (_) {}
          if (tempDiv.parentNode) tempDiv.remove();
          reject(err);
        }
      };

      if (pendingImages.length === 0) {
        // フォント描画のための微小待機
        setTimeout(finalize, 50);
      } else {
        // 画像待機（タイムアウト付き）
        const timeout = setTimeout(() => {
          console.warn('画像読み込みタイムアウト、続行します');
          finalize();
        }, 10000);
        Promise.all(pendingImages).then(() => {
          clearTimeout(timeout);
          finalize();
        }).catch(() => {
          clearTimeout(timeout);
          finalize();
        });
      }
    } catch (err) {
      reject(err);
    }
  });
}

// ハンドラなしのノード作成（エクスポート用）
function createNodeFromDataNoHandler(obj, pendingImages) {
  const common = {
    x: obj.x || 0,
    y: obj.y || 0,
    rotation: obj.rotation || 0,
  };
  switch (obj.type) {
    case 'sticky': {
      const group = new Konva.Group(common);
      group.add(new Konva.Rect({
        width: obj.width, height: obj.height,
        fill: obj.color,
        cornerRadius: 6,
        shadowColor: 'rgba(0,0,0,0.15)',
        shadowBlur: 8,
        shadowOffsetY: 3,
      }));
      group.add(new Konva.Line({
        points: [0, 18, 18, 0],
        stroke: 'rgba(0,0,0,0.05)',
        strokeWidth: 1,
      }));
      group.add(new Konva.Text({
        x: 12, y: 12,
        width: obj.width - 24,
        height: obj.height - 24,
        text: obj.text || '',
        fontSize: obj.fontSize || 22,
        fontFamily: 'M PLUS Rounded 1c',
        fontStyle: 'bold',
        fill: '#3a3a3a',
        align: 'center',
        verticalAlign: 'middle',
        lineHeight: 1.3,
      }));
      return group;
    }
    case 'text':
      return new Konva.Text({
        ...common,
        text: obj.text || '',
        fontSize: obj.fontSize || 28,
        fontFamily: 'M PLUS Rounded 1c',
        fontStyle: obj.bold ? 'bold' : 'normal',
        fill: obj.color || '#3a3a3a',
        width: obj.width || 300,
      });
    case 'pen':
    case 'marker':
      return new Konva.Line({
        ...common,
        points: obj.points,
        stroke: obj.color,
        strokeWidth: obj.size,
        lineCap: 'round', lineJoin: 'round', tension: 0.4,
        opacity: obj.type === 'marker' ? 0.45 : 1,
      });
    case 'rect':
      return new Konva.Rect({
        ...common,
        width: obj.width, height: obj.height,
        stroke: obj.color,
        strokeWidth: obj.strokeWidth || 4,
        fill: obj.fill || 'rgba(255,255,255,0)',
        cornerRadius: 4,
      });
    case 'circle':
      return new Konva.Ellipse({
        ...common,
        radiusX: obj.width / 2, radiusY: obj.height / 2,
        offsetX: -obj.width / 2, offsetY: -obj.height / 2,
        stroke: obj.color,
        strokeWidth: obj.strokeWidth || 4,
        fill: obj.fill || 'rgba(255,255,255,0)',
      });
    case 'triangle':
      return new Konva.Line({
        ...common,
        points: [obj.width / 2, 0, obj.width, obj.height, 0, obj.height],
        closed: true,
        stroke: obj.color,
        strokeWidth: obj.strokeWidth || 4,
        fill: obj.fill || 'rgba(255,255,255,0)',
      });
    case 'line':
      return new Konva.Line({
        ...common, points: obj.points,
        stroke: obj.color, strokeWidth: obj.strokeWidth || 4, lineCap: 'round',
      });
    case 'arrow':
      return new Konva.Arrow({
        ...common, points: obj.points,
        stroke: obj.color, fill: obj.color,
        strokeWidth: obj.strokeWidth || 4,
        pointerLength: 14, pointerWidth: 14,
      });
    case 'image': {
      const img = new Image();
      const imageNode = new Konva.Image({
        ...common, width: obj.width, height: obj.height,
      });
      const p = new Promise((resolve) => {
        img.onload = () => { imageNode.image(img); resolve(); };
        img.onerror = () => resolve();
      });
      img.src = obj.src;
      if (pendingImages) pendingImages.push(p);
      return imageNode;
    }
    case 'poll': {
      // Phase 10: 投票・挙手カード（poll.js の createPollNode を再利用）
      if (typeof createPollNode === 'function') {
        return createPollNode(obj);
      }
      return null;
    }
  }
  return null;
}

// ===== ユーティリティ =====
function downloadDataURL(dataURL, filename) {
  const a = document.createElement('a');
  a.href = dataURL;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function sanitizeFilename(name) {
  return (name || 'board').replace(/[/\\:*?"<>|]/g, '_').substring(0, 50).trim() || 'board';
}
