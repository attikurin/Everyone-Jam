/* =========================================
   みんなのジャム - 描画エンジン（Konva.js）
   ========================================= */

function initStage() {
  const container = document.getElementById('canvas-container');
  const { width, height } = container.getBoundingClientRect();

  State.stage = new Konva.Stage({
    container: 'canvas-container',
    width: Math.max(width, 100),
    height: Math.max(height, 100),
  });

  State.mainLayer = new Konva.Layer();
  State.drawLayer = new Konva.Layer();
  State.uiLayer = new Konva.Layer();
  State.stage.add(State.mainLayer);
  State.stage.add(State.drawLayer);
  State.stage.add(State.uiLayer);

  // トランスフォーマー（選択ハンドル）
  State.transformer = new Konva.Transformer({
    rotateEnabled: true,
    borderStroke: '#ff7e5f',
    borderStrokeWidth: 2,
    anchorStroke: '#ff7e5f',
    anchorFill: '#fff',
    anchorSize: 10,
    anchorCornerRadius: 5,
    padding: 4,
    keepRatio: false,
    // [B02修正] 最小サイズを保証
    boundBoxFunc: (oldBox, newBox) => {
      if (Math.abs(newBox.width) < 12 || Math.abs(newBox.height) < 12) {
        return oldBox;
      }
      return newBox;
    },
  });
  State.uiLayer.add(State.transformer);

  fitToScreen();

  // [修正] リサイズ対応（debounce付き）
  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      const r = container.getBoundingClientRect();
      State.stage.width(Math.max(r.width, 100));
      State.stage.height(Math.max(r.height, 100));
      State.stage.batchDraw();
    }, 100);
  });

  setupStageEvents();
}

function fitToScreen() {
  const container = document.getElementById('canvas-container');
  const { width, height } = container.getBoundingClientRect();
  if (width <= 0 || height <= 0) return;
  const scaleX = width / BOARD_WIDTH;
  const scaleY = height / BOARD_HEIGHT;
  const scale = Math.min(scaleX, scaleY) * 0.95;
  State.scale = scale;
  State.panX = (width - BOARD_WIDTH * scale) / 2;
  State.panY = (height - BOARD_HEIGHT * scale) / 2;
  applyTransform();
}

function applyTransform() {
  const layers = [State.mainLayer, State.drawLayer, State.uiLayer];
  // 共同編集カーソルレイヤーも同じ変換を適用
  if (typeof P2P !== 'undefined' && P2P.cursorLayer) layers.push(P2P.cursorLayer);
  layers.forEach(layer => {
    if (!layer) return;
    layer.scale({ x: State.scale, y: State.scale });
    layer.position({ x: State.panX, y: State.panY });
  });
  State.stage.batchDraw();
  updateZoomDisplay();
  // Phase3: 選択範囲レイヤー・コメントピンも追従
  if (typeof window.syncCollabLayers === 'function') window.syncCollabLayers();
}

function updateZoomDisplay() {
  const el = document.getElementById('zoom-level');
  if (el) el.textContent = Math.round(State.scale * 100) + '%';
}

function zoom(delta, centerX, centerY) {
  const oldScale = State.scale;
  const newScale = Math.max(0.2, Math.min(3, oldScale * (1 + delta)));
  if (centerX === undefined) {
    const rect = document.getElementById('canvas-container').getBoundingClientRect();
    centerX = rect.width / 2;
    centerY = rect.height / 2;
  }
  const mousePointTo = {
    x: (centerX - State.panX) / oldScale,
    y: (centerY - State.panY) / oldScale,
  };
  State.scale = newScale;
  State.panX = centerX - mousePointTo.x * newScale;
  State.panY = centerY - mousePointTo.y * newScale;
  applyTransform();
}

// ===== ポインタ位置の変換 =====
function getPointerBoardPos() {
  const pos = State.stage.getPointerPosition();
  if (!pos) return { x: 0, y: 0 };
  return {
    x: (pos.x - State.panX) / State.scale,
    y: (pos.y - State.panY) / State.scale,
  };
}

// ===== 背景描画 =====
function drawBackground() {
  let bgGroup = State.mainLayer.findOne('#bg-group');
  if (bgGroup) bgGroup.destroy();
  bgGroup = new Konva.Group({ id: 'bg-group', listening: false });
  State.mainLayer.add(bgGroup);
  bgGroup.moveToBottom();

  // [B13修正] 背景本体のみシャドウ。線・ドットはシャドウなし
  const whiteboard = new Konva.Rect({
    x: 0, y: 0,
    width: BOARD_WIDTH,
    height: BOARD_HEIGHT,
    fill: '#ffffff',
    shadowColor: 'rgba(0,0,0,0.1)',
    shadowBlur: 20,
    shadowOffsetY: 4,
    cornerRadius: 8,
    listening: false,
  });
  bgGroup.add(whiteboard);

  const page = currentPage();
  if (!page) return;
  const bg = page.background;

  // === v1.8.0 (Phase 8): 取り込み背景画像のレンダリング ===
  // 通常パターンの「下」に配置（既存パターンが上に重なる）
  if (page.backgroundImage && page.backgroundImage.src) {
    const bi = page.backgroundImage;
    const imgEl = new Image();
    imgEl.onload = () => {
      // ボードサイズに合わせて配置
      const fit = bi.fit || 'contain';
      let dw = BOARD_WIDTH, dh = BOARD_HEIGHT, dx = 0, dy = 0;
      const ratio = imgEl.width / imgEl.height;
      const boardRatio = BOARD_WIDTH / BOARD_HEIGHT;
      if (fit === 'contain') {
        // アスペクト比を維持してボード内に収まる最大サイズ
        if (ratio > boardRatio) {
          dw = BOARD_WIDTH;
          dh = BOARD_WIDTH / ratio;
        } else {
          dh = BOARD_HEIGHT;
          dw = BOARD_HEIGHT * ratio;
        }
        dx = (BOARD_WIDTH - dw) / 2;
        dy = (BOARD_HEIGHT - dh) / 2;
      } else if (fit === 'cover') {
        if (ratio > boardRatio) {
          dh = BOARD_HEIGHT;
          dw = BOARD_HEIGHT * ratio;
        } else {
          dw = BOARD_WIDTH;
          dh = BOARD_WIDTH / ratio;
        }
        dx = (BOARD_WIDTH - dw) / 2;
        dy = (BOARD_HEIGHT - dh) / 2;
      } else {
        // stretch: ボード全体に伸ばす
        dw = BOARD_WIDTH; dh = BOARD_HEIGHT; dx = 0; dy = 0;
      }
      const konvaImage = new Konva.Image({
        x: dx, y: dy,
        width: dw, height: dh,
        image: imgEl,
        opacity: typeof bi.opacity === 'number' ? bi.opacity : 1,
        listening: false,
        // ボード角丸の中に収まるようクリップ風効果（角丸は背景白ベースが受け持つ）
      });
      // 現在の bg-group がまだ存在するか確認（ページ切替で破棄されている可能性）
      const currentBg = State.mainLayer.findOne('#bg-group');
      if (currentBg && currentBg.getStage()) {
        // bg-group に追加してから順序を調整
        currentBg.add(konvaImage);
        konvaImage.moveToBottom();
        // 現在の bg-group 内の白板（最初の子）も最下層へ
        // ※ 古い whiteboard 変数は destroy 済みの可能性があるため、現行 group から取り直す
        const currentWhiteboard = currentBg.findOne('Rect');
        if (currentWhiteboard && currentWhiteboard.getParent()) {
          currentWhiteboard.moveToBottom();
        }
        State.mainLayer.batchDraw();
      }
    };
    imgEl.onerror = () => {
      console.warn('[import] 背景画像の読み込みに失敗しました');
    };
    imgEl.src = bi.src;
  }

  // パターンは別グループに入れてシャドウを切る
  const patternGroup = new Konva.Group({ listening: false });
  bgGroup.add(patternGroup);

  if (bg === 'grid') {
    const step = 40;
    for (let x = 0; x <= BOARD_WIDTH; x += step) {
      patternGroup.add(new Konva.Line({
        points: [x, 0, x, BOARD_HEIGHT],
        stroke: '#e8f0ff', strokeWidth: 1, listening: false,
      }));
    }
    for (let y = 0; y <= BOARD_HEIGHT; y += step) {
      patternGroup.add(new Konva.Line({
        points: [0, y, BOARD_WIDTH, y],
        stroke: '#e8f0ff', strokeWidth: 1, listening: false,
      }));
    }
  } else if (bg === 'dots') {
    const step = 40;
    for (let x = step; x < BOARD_WIDTH; x += step) {
      for (let y = step; y < BOARD_HEIGHT; y += step) {
        patternGroup.add(new Konva.Circle({
          x, y, radius: 1.5, fill: '#c8d4e8', listening: false,
        }));
      }
    }
  } else if (bg === 'lined') {
    const step = 50;
    for (let y = step; y < BOARD_HEIGHT; y += step) {
      patternGroup.add(new Konva.Line({
        points: [40, y, BOARD_WIDTH - 40, y],
        stroke: '#e0e8f0', strokeWidth: 1, listening: false,
      }));
    }
  } else if (bg === 'genko') {
    // 原稿用紙：20×20マスを2セット（縦書き右綴じ風）
    drawGenkoPattern(patternGroup);
  } else if (bg === 'math-grid') {
    // 算数方眼（10mm主格子+5mm副格子+原点座標軸）
    drawMathGridPattern(patternGroup);
  } else if (bg === 'science') {
    // 理科観察シート：上に絵スペース、下に罫線記入欄、左上にラベル
    drawSciencePattern(patternGroup);
  } else if (bg === 'music') {
    // 5線譜（4段）
    drawMusicPattern(patternGroup);
  } else if (bg === 'cross') {
    // 書写・美術用 中心十字線+対角ガイド
    drawCrossPattern(patternGroup);
  }
  State.mainLayer.batchDraw();
}

// ===== 教材テンプレート背景パターン =====

// 原稿用紙（横向きボード）400字詰め2面
function drawGenkoPattern(group) {
  const cell = 44;          // マスのサイズ
  const cols = 20;          // 縦20マス
  const rows = 20;          // 横20マス
  const sheetW = cell * rows;
  const sheetH = cell * cols;
  const gap = 60;           // 2シートの間
  const totalW = sheetW * 2 + gap;
  const startX = (BOARD_WIDTH - totalW) / 2;
  const startY = (BOARD_HEIGHT - sheetH) / 2;

  for (let s = 0; s < 2; s++) {
    const ox = startX + s * (sheetW + gap);
    const oy = startY;
    // 外枠（太め）
    group.add(new Konva.Rect({
      x: ox, y: oy, width: sheetW, height: sheetH,
      stroke: '#d9534f', strokeWidth: 2.5, listening: false,
    }));
    // マス目
    for (let c = 0; c <= rows; c++) {
      group.add(new Konva.Line({
        points: [ox + c * cell, oy, ox + c * cell, oy + sheetH],
        stroke: '#f0a8a3', strokeWidth: 1, listening: false,
      }));
    }
    for (let r = 0; r <= cols; r++) {
      group.add(new Konva.Line({
        points: [ox, oy + r * cell, ox + sheetW, oy + r * cell],
        stroke: '#f0a8a3', strokeWidth: 1, listening: false,
      }));
    }
    // 中央の振り仮名罫線（マス中央の点線）
    for (let c = 0; c < rows; c++) {
      const cx = ox + c * cell + cell / 2;
      group.add(new Konva.Line({
        points: [cx, oy, cx, oy + sheetH],
        stroke: '#f7c8c4', strokeWidth: 0.5, dash: [3, 3], listening: false,
      }));
    }
  }
}

// 算数方眼（5mm副+10mm主、原点座標軸）
function drawMathGridPattern(group) {
  const sub = 20;   // 副目盛
  const main = 100; // 主目盛(5マスごと)
  // 副目盛（薄い）
  for (let x = 0; x <= BOARD_WIDTH; x += sub) {
    group.add(new Konva.Line({
      points: [x, 0, x, BOARD_HEIGHT],
      stroke: '#e8eef5', strokeWidth: 0.5, listening: false,
    }));
  }
  for (let y = 0; y <= BOARD_HEIGHT; y += sub) {
    group.add(new Konva.Line({
      points: [0, y, BOARD_WIDTH, y],
      stroke: '#e8eef5', strokeWidth: 0.5, listening: false,
    }));
  }
  // 主目盛（濃い）
  for (let x = 0; x <= BOARD_WIDTH; x += main) {
    group.add(new Konva.Line({
      points: [x, 0, x, BOARD_HEIGHT],
      stroke: '#b8d0e8', strokeWidth: 1, listening: false,
    }));
  }
  for (let y = 0; y <= BOARD_HEIGHT; y += main) {
    group.add(new Konva.Line({
      points: [0, y, BOARD_WIDTH, y],
      stroke: '#b8d0e8', strokeWidth: 1, listening: false,
    }));
  }
  // 中心軸（原点を中心に）
  const cx = Math.round(BOARD_WIDTH / 2 / main) * main;
  const cy = Math.round(BOARD_HEIGHT / 2 / main) * main;
  group.add(new Konva.Line({
    points: [0, cy, BOARD_WIDTH, cy],
    stroke: '#5a8fc0', strokeWidth: 1.5, listening: false,
  }));
  group.add(new Konva.Line({
    points: [cx, 0, cx, BOARD_HEIGHT],
    stroke: '#5a8fc0', strokeWidth: 1.5, listening: false,
  }));
  // 矢印先端
  group.add(new Konva.Line({
    points: [BOARD_WIDTH - 14, cy - 6, BOARD_WIDTH, cy, BOARD_WIDTH - 14, cy + 6],
    stroke: '#5a8fc0', strokeWidth: 1.5, listening: false,
  }));
  group.add(new Konva.Line({
    points: [cx - 6, 14, cx, 0, cx + 6, 14],
    stroke: '#5a8fc0', strokeWidth: 1.5, listening: false,
  }));
}

// 理科観察シート（上に絵、下に文章記入欄）
function drawSciencePattern(group) {
  const padding = 60;
  const headerH = 90;

  // ヘッダー（タイトル・日付・名前欄）
  const headerY = padding;
  group.add(new Konva.Rect({
    x: padding, y: headerY, width: BOARD_WIDTH - padding * 2, height: headerH,
    stroke: '#9ed09e', strokeWidth: 2, cornerRadius: 8, listening: false,
  }));
  group.add(new Konva.Text({
    x: padding + 20, y: headerY + 18,
    text: '🔍 かんさつカード', fontSize: 28, fontStyle: 'bold',
    fill: '#5a8c5a', listening: false,
  }));
  // ライン枠
  ['日 付', '名 前', 'てんき'].forEach((label, i) => {
    const lineY = headerY + 60;
    const w = 280;
    const x = padding + 360 + i * (w + 20);
    group.add(new Konva.Text({
      x: x, y: lineY - 18, text: label,
      fontSize: 14, fill: '#7aaa7a', listening: false,
    }));
    group.add(new Konva.Line({
      points: [x, lineY, x + w, lineY],
      stroke: '#9ed09e', strokeWidth: 1, listening: false,
    }));
  });

  // 絵を描くスペース（左半分）と文章スペース（右半分）
  const bodyTop = headerY + headerH + 24;
  const bodyH = BOARD_HEIGHT - bodyTop - padding;
  const halfW = (BOARD_WIDTH - padding * 2 - 24) / 2;

  // 絵スペース
  group.add(new Konva.Rect({
    x: padding, y: bodyTop, width: halfW, height: bodyH,
    stroke: '#9ed09e', strokeWidth: 1.5, dash: [8, 4],
    cornerRadius: 8, listening: false,
  }));
  group.add(new Konva.Text({
    x: padding + 16, y: bodyTop + 14, text: '✏️ 絵をかこう',
    fontSize: 18, fill: '#7aaa7a', listening: false,
  }));

  // 文章スペース（罫線）
  const textX = padding + halfW + 24;
  group.add(new Konva.Rect({
    x: textX, y: bodyTop, width: halfW, height: bodyH,
    stroke: '#9ed09e', strokeWidth: 1.5, dash: [8, 4],
    cornerRadius: 8, listening: false,
  }));
  group.add(new Konva.Text({
    x: textX + 16, y: bodyTop + 14, text: '📝 きづいたこと',
    fontSize: 18, fill: '#7aaa7a', listening: false,
  }));
  // 罫線
  const lineStep = 60;
  for (let y = bodyTop + 60; y < bodyTop + bodyH - 20; y += lineStep) {
    group.add(new Konva.Line({
      points: [textX + 24, y, textX + halfW - 24, y],
      stroke: '#cce5cc', strokeWidth: 1, listening: false,
    }));
  }
}

// 音楽：5線譜
function drawMusicPattern(group) {
  const stavesCount = 4;
  const lineSpacing = 18;     // 線の間隔
  const staveHeight = lineSpacing * 4;
  const padding = 80;
  const blockH = (BOARD_HEIGHT - padding * 2) / stavesCount;
  const startX = padding;
  const endX = BOARD_WIDTH - padding;

  for (let s = 0; s < stavesCount; s++) {
    const cy = padding + blockH * s + blockH / 2;
    const top = cy - staveHeight / 2;
    for (let i = 0; i < 5; i++) {
      const y = top + i * lineSpacing;
      group.add(new Konva.Line({
        points: [startX, y, endX, y],
        stroke: '#3c3c5a', strokeWidth: 1, listening: false,
      }));
    }
    // 開始縦線
    group.add(new Konva.Line({
      points: [startX, top, startX, top + staveHeight],
      stroke: '#3c3c5a', strokeWidth: 1.2, listening: false,
    }));
    // 終止縦線
    group.add(new Konva.Line({
      points: [endX, top, endX, top + staveHeight],
      stroke: '#3c3c5a', strokeWidth: 1.2, listening: false,
    }));
    // ト音記号スペースの目印
    group.add(new Konva.Text({
      x: startX + 12, y: top - 6, text: '𝄞',
      fontSize: staveHeight * 1.3, fill: '#c0c0d0', listening: false,
    }));
  }
}

// 書写・美術用 中心十字＋対角ガイド
function drawCrossPattern(group) {
  const cx = BOARD_WIDTH / 2;
  const cy = BOARD_HEIGHT / 2;
  // 十字
  group.add(new Konva.Line({
    points: [0, cy, BOARD_WIDTH, cy],
    stroke: '#e0c8d8', strokeWidth: 1.5, dash: [10, 6], listening: false,
  }));
  group.add(new Konva.Line({
    points: [cx, 0, cx, BOARD_HEIGHT],
    stroke: '#e0c8d8', strokeWidth: 1.5, dash: [10, 6], listening: false,
  }));
  // 対角線
  group.add(new Konva.Line({
    points: [0, 0, BOARD_WIDTH, BOARD_HEIGHT],
    stroke: '#f0e0e8', strokeWidth: 1, dash: [4, 6], listening: false,
  }));
  group.add(new Konva.Line({
    points: [BOARD_WIDTH, 0, 0, BOARD_HEIGHT],
    stroke: '#f0e0e8', strokeWidth: 1, dash: [4, 6], listening: false,
  }));
  // 三分割線
  for (let i = 1; i <= 2; i++) {
    const x = (BOARD_WIDTH / 3) * i;
    const y = (BOARD_HEIGHT / 3) * i;
    group.add(new Konva.Line({
      points: [x, 0, x, BOARD_HEIGHT],
      stroke: '#f5e8ee', strokeWidth: 0.8, listening: false,
    }));
    group.add(new Konva.Line({
      points: [0, y, BOARD_WIDTH, y],
      stroke: '#f5e8ee', strokeWidth: 0.8, listening: false,
    }));
  }
}

// ===== ページレンダリング =====
function renderCurrentPage() {
  if (!State.stage) return;
  // 背景以外をすべて削除
  State.mainLayer.getChildren(n => n.id() !== 'bg-group').forEach(n => n.destroy());
  State.drawLayer.destroyChildren();
  if (State.transformer) State.transformer.nodes([]);

  drawBackground();

  const page = currentPage();
  if (!page) return;
  page.objects.forEach(obj => {
    const node = createNodeFromData(obj);
    if (node) State.mainLayer.add(node);
  });
  State.mainLayer.batchDraw();
  State.drawLayer.batchDraw();
  State.uiLayer.batchDraw();
  updatePageCount();
  // ロック状態を権限に応じて再評価
  if (window.LockMode && typeof window.LockMode.refresh === 'function') {
    window.LockMode.refresh();
  }
  // 拡張機能向けイベント
  document.dispatchEvent(new CustomEvent('mnj:page-rendered'));
}

// ===== オブジェクト → Konvaノード 変換 =====
function createNodeFromData(obj) {
  let node = null;
  const common = {
    id: obj.id,
    x: obj.x || 0,
    y: obj.y || 0,
    rotation: obj.rotation || 0,
    draggable: true,
  };

  switch (obj.type) {
    case 'sticky': {
      const group = new Konva.Group(common);
      group.add(new Konva.Rect({
        name: 'sticky-bg',
        width: obj.width, height: obj.height,
        fill: obj.color,
        cornerRadius: 6,
        shadowColor: 'rgba(0,0,0,0.15)',
        shadowBlur: 8,
        shadowOffsetY: 3,
      }));
      group.add(new Konva.Line({
        name: 'sticky-fold',
        points: [0, 18, 18, 0],
        stroke: 'rgba(0,0,0,0.05)',
        strokeWidth: 1,
        listening: false,
      }));
      group.add(new Konva.Text({
        name: 'sticky-text',
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
        listening: false,
      }));
      node = group;
      break;
    }
    case 'text': {
      node = new Konva.Text({
        ...common,
        text: obj.text || '',
        fontSize: obj.fontSize || 28,
        fontFamily: 'M PLUS Rounded 1c',
        fontStyle: obj.bold ? 'bold' : 'normal',
        fill: obj.color || '#3a3a3a',
        width: obj.width || 300,
        padding: 4,
      });
      break;
    }
    case 'pen':
    case 'marker': {
      node = new Konva.Line({
        ...common,
        points: obj.points,
        stroke: obj.color,
        strokeWidth: obj.size,
        lineCap: 'round',
        lineJoin: 'round',
        tension: 0.4,
        opacity: obj.type === 'marker' ? 0.45 : 1,
        // [B18関連] hitStrokeWidth を広げて選択しやすく
        hitStrokeWidth: Math.max(obj.size + 10, 20),
      });
      break;
    }
    case 'rect': {
      node = new Konva.Rect({
        ...common,
        width: obj.width, height: obj.height,
        stroke: obj.color,
        strokeWidth: obj.strokeWidth || 4,
        fill: obj.fill || 'rgba(255,255,255,0)',
        cornerRadius: 4,
      });
      break;
    }
    case 'circle': {
      // [B03修正] radiusX/Y は width/height の半分、offsetで左上合わせ
      node = new Konva.Ellipse({
        ...common,
        radiusX: obj.width / 2,
        radiusY: obj.height / 2,
        offsetX: -obj.width / 2,
        offsetY: -obj.height / 2,
        stroke: obj.color,
        strokeWidth: obj.strokeWidth || 4,
        fill: obj.fill || 'rgba(255,255,255,0)',
      });
      break;
    }
    case 'triangle': {
      node = new Konva.Line({
        ...common,
        points: [
          obj.width / 2, 0,
          obj.width, obj.height,
          0, obj.height,
        ],
        closed: true,
        stroke: obj.color,
        strokeWidth: obj.strokeWidth || 4,
        fill: obj.fill || 'rgba(255,255,255,0)',
      });
      break;
    }
    case 'line': {
      node = new Konva.Line({
        ...common,
        points: obj.points,
        stroke: obj.color,
        strokeWidth: obj.strokeWidth || 4,
        lineCap: 'round',
        hitStrokeWidth: 20,
      });
      break;
    }
    case 'arrow': {
      node = new Konva.Arrow({
        ...common,
        points: obj.points,
        stroke: obj.color,
        fill: obj.color,
        strokeWidth: obj.strokeWidth || 4,
        pointerLength: 14,
        pointerWidth: 14,
        hitStrokeWidth: 20,
      });
      break;
    }
    case 'image': {
      const img = new Image();
      const imageNode = new Konva.Image({
        ...common,
        width: obj.width,
        height: obj.height,
      });
      img.onload = () => {
        imageNode.image(img);
        State.mainLayer.batchDraw();
      };
      img.onerror = () => {
        console.warn('画像の読み込みに失敗:', obj.id);
      };
      img.src = obj.src;
      node = imageNode;
      break;
    }
    // v1.10.0 (Phase 10): 投票・挙手カード
    case 'poll': {
      if (typeof createPollNode === 'function') {
        node = createPollNode(obj);
        // poll はサイズが options 数で動的に決まる → common の x/y/rotation は createPollNode 内部で設定済み
      } else {
        console.warn('[poll] poll.js が読み込まれていません');
      }
      break;
    }
  }

  if (node) {
    attachObjectHandlers(node, obj);
  }
  return node;
}

function attachObjectHandlers(node, obj) {
  // ドラッグ終了時
  node.on('dragend', () => {
    obj.x = node.x();
    obj.y = node.y();
    commitObjectUpdate(obj);
  });

  // 変形終了時
  // [B02/B03修正] 型ごとに適切に寸法をノードへ反映
  node.on('transformend', () => {
    const scaleX = node.scaleX();
    const scaleY = node.scaleY();
    obj.x = node.x();
    obj.y = node.y();
    obj.rotation = node.rotation();

    if (obj.type === 'pen' || obj.type === 'marker' || obj.type === 'line' || obj.type === 'arrow') {
      // 線系は points をスケール適用
      if (obj.points && obj.points.length > 0) {
        const newPoints = [];
        for (let i = 0; i < obj.points.length; i += 2) {
          newPoints.push(obj.points[i] * scaleX);
          newPoints.push(obj.points[i + 1] * scaleY);
        }
        obj.points = newPoints;
        node.points(newPoints);
      }
      node.scaleX(1);
      node.scaleY(1);
    } else if (obj.type === 'text') {
      // テキストは幅のみ変更（高さは自動）
      obj.width = Math.max(40, (node.width() || 40) * scaleX);
      // フォントサイズもスケール
      obj.fontSize = Math.max(8, (obj.fontSize || 28) * ((scaleX + scaleY) / 2));
      node.width(obj.width);
      node.fontSize(obj.fontSize);
      node.scaleX(1);
      node.scaleY(1);
    } else if (obj.type === 'circle') {
      // 楕円は radiusX/Y を更新
      obj.width = Math.max(20, (obj.width || 40) * scaleX);
      obj.height = Math.max(20, (obj.height || 40) * scaleY);
      node.radiusX(obj.width / 2);
      node.radiusY(obj.height / 2);
      node.offsetX(-obj.width / 2);
      node.offsetY(-obj.height / 2);
      node.scaleX(1);
      node.scaleY(1);
    } else if (obj.type === 'sticky') {
      // 付箋：Rect と Text を再調整
      obj.width = Math.max(40, (obj.width || 180) * scaleX);
      obj.height = Math.max(40, (obj.height || 180) * scaleY);
      const bgRect = node.findOne('.sticky-bg');
      const stickyText = node.findOne('.sticky-text');
      if (bgRect) { bgRect.width(obj.width); bgRect.height(obj.height); }
      if (stickyText) {
        stickyText.width(obj.width - 24);
        stickyText.height(obj.height - 24);
      }
      node.scaleX(1);
      node.scaleY(1);
    } else if (obj.type === 'triangle') {
      // 三角形は points を再計算
      obj.width = Math.max(20, (obj.width || 40) * scaleX);
      obj.height = Math.max(20, (obj.height || 40) * scaleY);
      node.points([
        obj.width / 2, 0,
        obj.width, obj.height,
        0, obj.height,
      ]);
      node.scaleX(1);
      node.scaleY(1);
    } else if (obj.type === 'poll') {
      // v1.10.0: 投票カード - 横幅のみ変更（高さは選択肢数で決まる）
      obj.width = Math.max(260, Math.min(720, (obj.width || 380) * scaleX));
      node.scaleX(1);
      node.scaleY(1);
      // 内部レイアウト全体を作り直し
      if (typeof rerenderPollNode === 'function') {
        // 一度オブジェクトの x/y を保存 → 再描画は createNodeFromData 経由で行う
        const newNode = (typeof createPollNode === 'function') ? createPollNode(obj) : null;
        if (newNode) {
          // 新ノードに差し替え
          const parent = node.getParent();
          node.destroy();
          if (parent) parent.add(newNode);
          attachObjectHandlers(newNode, obj);
          if (State.transformer) {
            const sel = State.transformer.nodes();
            if (sel.includes(node)) {
              State.transformer.nodes([...sel.filter(n => n !== node), newNode]);
            }
          }
          State.mainLayer.batchDraw();
        }
      }
    } else {
      // rect / image
      obj.width = Math.max(20, (obj.width || 40) * scaleX);
      obj.height = Math.max(20, (obj.height || 40) * scaleY);
      node.width(obj.width);
      node.height(obj.height);
      node.scaleX(1);
      node.scaleY(1);
    }

    commitObjectUpdate(obj);
  });

  // ダブルクリック編集
  node.on('dblclick dbltap', (e) => {
    e.cancelBubble = true;
    if (obj.type === 'sticky' || obj.type === 'text') {
      editTextInPlace(node, obj);
    }
  });

  // 右クリックメニュー
  node.on('contextmenu', (e) => {
    e.evt.preventDefault();
    e.cancelBubble = true;
    if (State.currentTool === 'select') {
      State.transformer.nodes([node]);
      State.transformer.moveToTop();
      State.uiLayer.batchDraw();
    }
    showContextMenu(e.evt.clientX, e.evt.clientY, obj);
  });
}

function selectNode(node) {
  // ロックされたオブジェクトは選択不可（生徒モード時）
  if (node && typeof canEditObject === 'function') {
    const page = currentPage();
    const data = page && page.objects.find(o => o.id === node.id());
    if (data && !canEditObject(data)) {
      if (typeof showToast === 'function') showToast('🔒 これは先生がロックしたものです');
      return;
    }
  }
  // [B08修正] select ツールでなくても強制選択できるように
  State.transformer.nodes([node]);
  State.transformer.moveToTop();
  State.uiLayer.batchDraw();
  // 内部状態
  State.selected = node;
  // 他ユーザーへ選択範囲を共有（Phase3-2）
  if (typeof broadcastMySelection === 'function') broadcastMySelection();
}

function clearSelection() {
  if (!State.transformer) return;
  State.transformer.nodes([]);
  State.uiLayer.batchDraw();
  State.selected = null;
  // 他ユーザーへ選択解除を共有（Phase3-2）
  if (typeof broadcastMySelection === 'function') broadcastMySelection();
}

// ===== 共通：オブジェクト操作 =====
function addObjectToPage(obj) {
  const page = currentPage();
  if (!page) return null;
  // 先生モードで作成されたオブジェクトには lockedByTeacher フラグを付与
  if (typeof markObjectByCurrentRole === 'function') {
    markObjectByCurrentRole(obj);
  }
  page.objects.push(obj);
  const node = createNodeFromData(obj);
  if (node) State.mainLayer.add(node);
  // 権限に応じてdraggableを再設定
  if (window.LockMode && typeof window.LockMode.refresh === 'function') {
    window.LockMode.refresh();
  }
  State.mainLayer.batchDraw();
  pushHistory();
  saveBoardToStorage();
  broadcastChange();
  updatePageThumb(State.currentPageIndex);
  return node;
}

function commitObjectUpdate(obj) {
  pushHistory();
  saveBoardToStorage();
  broadcastChange();
  updatePageThumb(State.currentPageIndex);
}

function deleteSelected() {
  if (!State.transformer) return;
  const nodes = State.transformer.nodes().slice();
  if (!nodes.length) return;
  const page = currentPage();
  // ロック判定：生徒モードでは lockedByTeacher を削除させない
  const idsToDelete = nodes.map(n => n.id()).filter(Boolean);
  let blocked = 0;
  const finalIds = idsToDelete.filter(id => {
    const data = page.objects.find(o => o.id === id);
    if (data && typeof canEditObject === 'function' && !canEditObject(data)) {
      blocked++;
      return false;
    }
    return true;
  });
  if (blocked > 0 && typeof showToast === 'function') {
    showToast(`🔒 ${blocked}個は先生がロックしているため削除できません`);
  }
  if (!finalIds.length) return;
  page.objects = page.objects.filter(o => !finalIds.includes(o.id));
  nodes.forEach(n => {
    if (finalIds.includes(n.id())) n.destroy();
  });
  State.transformer.nodes([]);
  State.selected = null;
  State.mainLayer.batchDraw();
  State.uiLayer.batchDraw();
  pushHistory();
  saveBoardToStorage();
  broadcastChange();
  updatePageThumb(State.currentPageIndex);
}

function duplicateSelected() {
  if (!State.transformer) return;
  const nodes = State.transformer.nodes().slice();
  if (!nodes.length) return;
  const page = currentPage();
  const newNodes = [];
  nodes.forEach(n => {
    const origObj = page.objects.find(o => o.id === n.id());
    if (!origObj) return;
    const clone = JSON.parse(JSON.stringify(origObj));
    clone.id = uid();
    clone.x = (clone.x || 0) + 24;
    clone.y = (clone.y || 0) + 24;
    page.objects.push(clone);
    const newNode = createNodeFromData(clone);
    if (newNode) {
      State.mainLayer.add(newNode);
      newNodes.push(newNode);
    }
  });
  State.transformer.nodes(newNodes);
  State.mainLayer.batchDraw();
  pushHistory();
  saveBoardToStorage();
  broadcastChange();
  updatePageThumb(State.currentPageIndex);
}

function bringToFront() {
  if (!State.transformer) return;
  const nodes = State.transformer.nodes();
  if (!nodes.length) return;
  const page = currentPage();
  nodes.forEach(n => {
    const idx = page.objects.findIndex(o => o.id === n.id());
    if (idx >= 0) {
      const [o] = page.objects.splice(idx, 1);
      page.objects.push(o);
    }
    n.moveToTop();
  });
  State.transformer.moveToTop();
  State.mainLayer.batchDraw();
  pushHistory();
  saveBoardToStorage();
  broadcastChange();
}

function sendToBack() {
  if (!State.transformer) return;
  const nodes = State.transformer.nodes();
  if (!nodes.length) return;
  const page = currentPage();
  nodes.forEach(n => {
    const idx = page.objects.findIndex(o => o.id === n.id());
    if (idx >= 0) {
      const [o] = page.objects.splice(idx, 1);
      page.objects.unshift(o);
    }
    n.moveToBottom();
  });
  const bg = State.mainLayer.findOne('#bg-group');
  if (bg) bg.moveToBottom();
  State.mainLayer.batchDraw();
  pushHistory();
  saveBoardToStorage();
  broadcastChange();
}

// ===== テキスト編集（その場で編集） =====
function editTextInPlace(node, obj) {
  const isSticky = obj.type === 'sticky';
  const textNode = isSticky ? node.findOne('.sticky-text') : node;
  if (!textNode) return;

  textNode.hide();
  State.mainLayer.batchDraw();

  const stageBox = State.stage.container().getBoundingClientRect();
  const absPos = textNode.getAbsolutePosition();

  const textarea = document.createElement('textarea');
  document.body.appendChild(textarea);
  textarea.value = obj.text || '';
  textarea.className = 'floating-editor';
  textarea.style.left = (stageBox.left + absPos.x) + 'px';
  textarea.style.top = (stageBox.top + absPos.y) + 'px';
  const w = (textNode.width() || 200) * State.scale;
  const h = (isSticky ? textNode.height() : 40) * State.scale;
  textarea.style.width = Math.max(w, 40) + 'px';
  textarea.style.minHeight = Math.max(h, 30) + 'px';
  textarea.style.fontSize = (textNode.fontSize() * State.scale) + 'px';
  textarea.style.lineHeight = isSticky ? '1.3' : '1.2';
  textarea.style.color = textNode.fill();
  textarea.style.textAlign = isSticky ? 'center' : 'left';
  textarea.style.fontWeight = isSticky ? '700' : (obj.bold ? '700' : '400');
  textarea.style.background = isSticky ? 'transparent' : 'rgba(255,255,255,0.95)';
  // [修正] 傾きを合わせる
  if (obj.rotation) {
    textarea.style.transformOrigin = 'top left';
    textarea.style.transform = `rotate(${obj.rotation}deg)`;
  }

  setTimeout(() => {
    textarea.focus();
    textarea.select();
  }, 0);

  let committed = false;
  const commit = () => {
    if (committed) return;
    committed = true;
    obj.text = textarea.value;
    if (textarea.parentNode) textarea.remove();
    textNode.text(obj.text);
    textNode.show();
    State.mainLayer.batchDraw();
    commitObjectUpdate(obj);
  };

  textarea.addEventListener('blur', commit);
  textarea.addEventListener('keydown', (e) => {
    e.stopPropagation(); // [B07関連] ショートカットキー抑止
    if (e.key === 'Escape') {
      e.preventDefault();
      textarea.blur();
    }
    if (e.key === 'Enter' && !e.shiftKey && !isSticky) {
      e.preventDefault();
      textarea.blur();
    }
  });
}

// ===== ステージイベント =====
function setupStageEvents() {
  let startPos = null;
  let currentDrawObj = null;
  let konvaShape = null;
  let eraserCursor = null;

  // マウスダウン
  State.stage.on('mousedown touchstart', (e) => {
    const tool = State.currentTool;
    const pos = getPointerBoardPos();

    // [Phase 9] OCRモード中はドラッグ選択を优先し、他のツール処理はスキップ
    if (window.OCRState && window.OCRState.mode) {
      if (typeof window.handleOcrPointerDown === 'function') {
        window.handleOcrPointerDown(pos);
      }
      return;
    }

    // [B12修正] Transformer のアンカー操作時は選択処理しない
    const targetParent = e.target.getParent();
    if (targetParent && targetParent.className === 'Transformer') {
      return;
    }
    if (e.target.getClassName && e.target.getClassName() === 'Transformer') {
      return;
    }

    if (tool === 'select') {
      if (e.target === State.stage) {
        clearSelection();
      } else {
        // 最上位のオブジェクトを探す
        let target = e.target;
        while (target && target !== State.mainLayer && !page_hasObject(target.id && target.id())) {
          const p = target.getParent();
          if (p && p !== State.mainLayer && p !== State.stage) {
            target = p;
          } else break;
        }
        if (target && target.id && page_hasObject(target.id())) {
          const current = State.transformer.nodes();
          if (e.evt.shiftKey) {
            if (current.includes(target)) {
              State.transformer.nodes(current.filter(n => n !== target));
            } else {
              State.transformer.nodes([...current, target]);
            }
          } else {
            State.transformer.nodes([target]);
          }
          State.transformer.moveToTop();
          State.uiLayer.batchDraw();
        }
      }
      return;
    }

    // 他のツールでは選択解除
    clearSelection();

    if (tool === 'pen' || tool === 'marker') {
      State.isDrawing = true;
      const color = tool === 'pen' ? State.penColor : State.markerColor;
      const size = tool === 'pen' ? State.penSize : State.markerSize;
      currentDrawObj = {
        id: uid(),
        type: tool,
        x: 0, y: 0,
        points: [pos.x, pos.y],
        color, size,
      };
      konvaShape = new Konva.Line({
        points: [pos.x, pos.y],
        stroke: color,
        strokeWidth: size,
        lineCap: 'round',
        lineJoin: 'round',
        tension: 0.4,
        opacity: tool === 'marker' ? 0.45 : 1,
        listening: false,
      });
      State.drawLayer.add(konvaShape);
    } else if (tool === 'eraser') {
      State.isDrawing = true;
      eraseAtPoint(pos);
    } else if (tool === 'sticky') {
      const size = 180;
      const obj = {
        id: uid(),
        type: 'sticky',
        x: pos.x - size / 2,
        y: pos.y - size / 2,
        width: size,
        height: size,
        color: State.stickyColor,
        text: '',
        fontSize: 22,
      };
      const node = addObjectToPage(obj);
      setTool('select');
      setTimeout(() => {
        if (node) {
          selectNode(node);
          editTextInPlace(node, obj);
        }
      }, 50);
    } else if (tool === 'text') {
      const obj = {
        id: uid(),
        type: 'text',
        x: pos.x,
        y: pos.y,
        width: 300,
        text: 'テキスト',
        fontSize: 32,
        color: '#3a3a3a',
      };
      const node = addObjectToPage(obj);
      setTool('select');
      setTimeout(() => {
        if (node) {
          selectNode(node);
          editTextInPlace(node, obj);
        }
      }, 50);
    } else if (tool === 'shape') {
      State.isDrawing = true;
      startPos = pos;
      const t = State.shapeType;
      if (t === 'rect' || t === 'circle' || t === 'triangle') {
        currentDrawObj = {
          id: uid(),
          type: t,
          x: pos.x,
          y: pos.y,
          width: 1,
          height: 1,
          color: State.penColor,
          strokeWidth: 4,
        };
      } else {
        currentDrawObj = {
          id: uid(),
          type: t,
          x: 0, y: 0,
          points: [pos.x, pos.y, pos.x, pos.y],
          color: State.penColor,
          strokeWidth: 4,
        };
      }
      konvaShape = createPreviewShape(currentDrawObj);
      State.drawLayer.add(konvaShape);
    }
  });

  // マウス移動
  State.stage.on('mousemove touchmove', () => {
    const pos = getPointerBoardPos();
    const tool = State.currentTool;

    // [Phase 9] OCRモード中はドラッグ選択枠を更新
    if (window.OCRState && window.OCRState.mode) {
      if (typeof window.handleOcrPointerMove === 'function') {
        window.handleOcrPointerMove(pos);
      }
      return;
    }

    if (tool === 'eraser' && !State.isDrawing) {
      showEraserCursor(pos);
    }
    if (tool !== 'eraser' && eraserCursor) {
      eraserCursor.destroy();
      eraserCursor = null;
      State.uiLayer.batchDraw();
    }

    if (!State.isDrawing) {
      if (tool === 'laser') {
        showLaser(pos);
      } else {
        hideLaser();
      }
      return;
    }

    if (tool === 'pen' || tool === 'marker') {
      if (!currentDrawObj || !konvaShape) return;
      currentDrawObj.points.push(pos.x, pos.y);
      konvaShape.points(currentDrawObj.points);
      State.drawLayer.batchDraw();
    } else if (tool === 'eraser') {
      eraseAtPoint(pos);
      showEraserCursor(pos);
    } else if (tool === 'shape' && startPos && currentDrawObj && konvaShape) {
      // [B09修正] 既存のノードを更新するだけで、destroy/create しない
      const t = State.shapeType;
      if (t === 'rect') {
        const x = Math.min(startPos.x, pos.x);
        const y = Math.min(startPos.y, pos.y);
        const w = Math.max(1, Math.abs(pos.x - startPos.x));
        const h = Math.max(1, Math.abs(pos.y - startPos.y));
        currentDrawObj.x = x;
        currentDrawObj.y = y;
        currentDrawObj.width = w;
        currentDrawObj.height = h;
        konvaShape.position({ x, y });
        konvaShape.width(w);
        konvaShape.height(h);
      } else if (t === 'circle') {
        const x = Math.min(startPos.x, pos.x);
        const y = Math.min(startPos.y, pos.y);
        const w = Math.max(1, Math.abs(pos.x - startPos.x));
        const h = Math.max(1, Math.abs(pos.y - startPos.y));
        currentDrawObj.x = x;
        currentDrawObj.y = y;
        currentDrawObj.width = w;
        currentDrawObj.height = h;
        konvaShape.position({ x, y });
        konvaShape.radiusX(w / 2);
        konvaShape.radiusY(h / 2);
        konvaShape.offsetX(-w / 2);
        konvaShape.offsetY(-h / 2);
      } else if (t === 'triangle') {
        const x = Math.min(startPos.x, pos.x);
        const y = Math.min(startPos.y, pos.y);
        const w = Math.max(1, Math.abs(pos.x - startPos.x));
        const h = Math.max(1, Math.abs(pos.y - startPos.y));
        currentDrawObj.x = x;
        currentDrawObj.y = y;
        currentDrawObj.width = w;
        currentDrawObj.height = h;
        konvaShape.position({ x, y });
        konvaShape.points([w / 2, 0, w, h, 0, h]);
      } else {
        // line / arrow
        currentDrawObj.points = [startPos.x, startPos.y, pos.x, pos.y];
        konvaShape.points(currentDrawObj.points);
      }
      State.drawLayer.batchDraw();
    }
  });

  // マウスアップ
  const endDraw = () => {
    const tool = State.currentTool;
    if (!State.isDrawing) return;
    State.isDrawing = false;

    if (tool === 'pen' || tool === 'marker') {
      if (currentDrawObj && currentDrawObj.points.length >= 4) {
        if (konvaShape) { konvaShape.destroy(); konvaShape = null; }
        addObjectToPage(currentDrawObj);
      } else {
        if (konvaShape) { konvaShape.destroy(); konvaShape = null; }
      }
      State.drawLayer.batchDraw();
    } else if (tool === 'shape') {
      if (currentDrawObj) {
        let valid = false;
        if (currentDrawObj.width !== undefined && currentDrawObj.height !== undefined) {
          valid = currentDrawObj.width > 5 && currentDrawObj.height > 5;
        } else if (currentDrawObj.points) {
          valid = Math.hypot(
            currentDrawObj.points[2] - currentDrawObj.points[0],
            currentDrawObj.points[3] - currentDrawObj.points[1]
          ) > 10;
        }
        if (konvaShape) { konvaShape.destroy(); konvaShape = null; }
        if (valid) {
          addObjectToPage(currentDrawObj);
        }
      }
      State.drawLayer.batchDraw();
    } else if (tool === 'eraser') {
      pushHistory();
      saveBoardToStorage();
      broadcastChange();
      updatePageThumb(State.currentPageIndex);
    }

    currentDrawObj = null;
    konvaShape = null;
    startPos = null;
  };
  State.stage.on('mouseup touchend', (e) => {
    // [Phase 9] OCRモード中は選択エリアを確定 → OCRモーダルへ
    if (window.OCRState && window.OCRState.mode) {
      if (typeof window.handleOcrPointerUp === 'function') {
        window.handleOcrPointerUp(getPointerBoardPos());
      }
      return;
    }
    endDraw();
  });
  State.stage.on('mouseleave', () => {
    if (eraserCursor) { eraserCursor.destroy(); eraserCursor = null; State.uiLayer.batchDraw(); }
    hideLaser();
  });

  // ===== 消しゴムカーソル =====
  function showEraserCursor(pos) {
    if (!eraserCursor) {
      eraserCursor = new Konva.Circle({
        x: pos.x, y: pos.y,
        radius: State.eraserSize / 2,
        stroke: '#ff7e5f',
        strokeWidth: 2,
        dash: [4, 4],
        listening: false,
      });
      State.uiLayer.add(eraserCursor);
    } else {
      eraserCursor.position(pos);
      eraserCursor.radius(State.eraserSize / 2);
    }
    State.uiLayer.batchDraw();
  }

  // ===== 消しゴム処理 =====
  // [B04修正] タイプごとに正確な当たり判定を実装
  function eraseAtPoint(pos) {
    const page = currentPage();
    const radius = State.eraserSize / 2;
    const toDelete = [];
    page.objects.forEach(obj => {
      if (hitTestObject(obj, pos, radius)) {
        toDelete.push(obj.id);
      }
    });
    if (toDelete.length) {
      page.objects = page.objects.filter(o => !toDelete.includes(o.id));
      toDelete.forEach(id => {
        const n = State.mainLayer.findOne('#' + id);
        if (n) n.destroy();
      });
      State.mainLayer.batchDraw();
    }
  }

  // [B04修正] より正確な当たり判定
  function hitTestObject(obj, pos, radius) {
    // 線系：各頂点・セグメントとの距離
    if (obj.type === 'pen' || obj.type === 'marker' || obj.type === 'line' || obj.type === 'arrow') {
      const pts = obj.points;
      if (!pts || pts.length < 2) return false;
      const ox = obj.x || 0;
      const oy = obj.y || 0;
      const halfStroke = (obj.size || obj.strokeWidth || 4) / 2;
      const hitDist = radius + halfStroke;
      // セグメントごとに最短距離判定
      for (let i = 0; i < pts.length - 3; i += 2) {
        const x1 = pts[i] + ox, y1 = pts[i + 1] + oy;
        const x2 = pts[i + 2] + ox, y2 = pts[i + 3] + oy;
        if (distPointToSegment(pos.x, pos.y, x1, y1, x2, y2) < hitDist) {
          return true;
        }
      }
      // 単一点のとき
      if (pts.length === 2) {
        return Math.hypot(pts[0] + ox - pos.x, pts[1] + oy - pos.y) < hitDist;
      }
      return false;
    }

    // 回転している場合は逆回転して判定
    const x = obj.x || 0;
    const y = obj.y || 0;
    const w = obj.width || 40;
    const h = obj.height || 40;
    let lx = pos.x, ly = pos.y;
    if (obj.rotation) {
      const rad = -obj.rotation * Math.PI / 180;
      const dx = pos.x - x;
      const dy = pos.y - y;
      lx = x + dx * Math.cos(rad) - dy * Math.sin(rad);
      ly = y + dx * Math.sin(rad) + dy * Math.cos(rad);
    }

    if (obj.type === 'circle') {
      // 楕円内判定
      const cx = x + w / 2, cy = y + h / 2;
      const rx = w / 2, ry = h / 2;
      if (rx <= 0 || ry <= 0) return false;
      const nx = (lx - cx) / rx, ny = (ly - cy) / ry;
      return (nx * nx + ny * ny) <= 1.05;
    }
    if (obj.type === 'triangle') {
      // 矩形の内側かつ三角形内か（簡易的にバウンディング＋中心寄り判定）
      return pointInTriangle(lx - x, ly - y,
        w / 2, 0, w, h, 0, h);
    }
    // rect / sticky / text / image
    return lx >= x && lx <= x + w && ly >= y && ly <= y + h;
  }

  function distPointToSegment(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1;
    if (dx === 0 && dy === 0) return Math.hypot(px - x1, py - y1);
    const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)));
    const cx = x1 + t * dx, cy = y1 + t * dy;
    return Math.hypot(px - cx, py - cy);
  }

  function pointInTriangle(px, py, ax, ay, bx, by, cx, cy) {
    const d1 = sign(px, py, ax, ay, bx, by);
    const d2 = sign(px, py, bx, by, cx, cy);
    const d3 = sign(px, py, cx, cy, ax, ay);
    const hasNeg = (d1 < 0) || (d2 < 0) || (d3 < 0);
    const hasPos = (d1 > 0) || (d2 > 0) || (d3 > 0);
    return !(hasNeg && hasPos);
  }
  function sign(px, py, x1, y1, x2, y2) {
    return (px - x2) * (y1 - y2) - (x1 - x2) * (py - y2);
  }

  // ===== レーザーポインター =====
  let laserDot = null;
  function showLaser(pos) {
    if (!laserDot) {
      laserDot = new Konva.Circle({
        x: pos.x, y: pos.y,
        radius: 8,
        fill: '#ff3b3b',
        shadowColor: '#ff3b3b',
        shadowBlur: 20,
        opacity: 0.85,
        listening: false,
      });
      State.uiLayer.add(laserDot);
    } else {
      laserDot.position(pos);
    }
    State.uiLayer.batchDraw();
  }
  function hideLaser() {
    if (laserDot) { laserDot.destroy(); laserDot = null; State.uiLayer.batchDraw(); }
  }

  // ===== パン（ホイール or Ctrl+ホイールでズーム） =====
  // [B16修正] デルタを制限
  State.stage.container().addEventListener('wheel', (e) => {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      const delta = Math.max(-0.3, Math.min(0.3, -e.deltaY * 0.002));
      zoom(delta, e.offsetX, e.offsetY);
    } else {
      const dx = Math.max(-80, Math.min(80, e.deltaX));
      const dy = Math.max(-80, Math.min(80, e.deltaY));
      State.panX -= dx;
      State.panY -= dy;
      applyTransform();
    }
  }, { passive: false });
}

// [B23修正] プレビュー用shape（ハンドラ無しで直接作成）
function createPreviewShape(obj) {
  const common = {
    x: obj.x || 0,
    y: obj.y || 0,
    draggable: false,
    listening: false,
  };
  switch (obj.type) {
    case 'rect':
      return new Konva.Rect({
        ...common,
        width: obj.width, height: obj.height,
        stroke: obj.color, strokeWidth: obj.strokeWidth || 4,
        fill: obj.fill || 'rgba(255,255,255,0)',
        cornerRadius: 4,
      });
    case 'circle':
      return new Konva.Ellipse({
        ...common,
        radiusX: obj.width / 2, radiusY: obj.height / 2,
        offsetX: -obj.width / 2, offsetY: -obj.height / 2,
        stroke: obj.color, strokeWidth: obj.strokeWidth || 4,
        fill: obj.fill || 'rgba(255,255,255,0)',
      });
    case 'triangle':
      return new Konva.Line({
        ...common,
        points: [obj.width / 2, 0, obj.width, obj.height, 0, obj.height],
        closed: true,
        stroke: obj.color, strokeWidth: obj.strokeWidth || 4,
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
  }
  return null;
}

function page_hasObject(id) {
  if (!id) return false;
  const page = currentPage();
  if (!page) return false;
  return page.objects.some(o => o.id === id);
}

// ===== コンテキストメニュー =====
function showContextMenu(x, y, obj) {
  const menu = document.getElementById('context-menu');
  if (!menu) return;
  // 画面外に出ないように調整
  const menuW = 170;
  const menuH = 170;
  const maxX = window.innerWidth - menuW - 8;
  const maxY = window.innerHeight - menuH - 8;
  menu.style.left = Math.min(x, maxX) + 'px';
  menu.style.top = Math.min(y, maxY) + 'px';
  menu.classList.remove('hidden');
  menu.dataset.targetId = obj.id;
}

function hideContextMenu() {
  const menu = document.getElementById('context-menu');
  if (menu) menu.classList.add('hidden');
}

// ===== テスト・デバッグ・他モジュールから利用するためのwindow公開 =====
if (typeof window !== 'undefined') {
  window.addObjectToPage = addObjectToPage;
  window.commitObjectUpdate = commitObjectUpdate;
  window.deleteSelected = deleteSelected;
  window.duplicateSelected = typeof duplicateSelected === 'function' ? duplicateSelected : window.duplicateSelected;
  window.bringToFront = typeof bringToFront === 'function' ? bringToFront : window.bringToFront;
  window.sendToBack = typeof sendToBack === 'function' ? sendToBack : window.sendToBack;
  window.selectNode = selectNode;
  window.clearSelection = clearSelection;
  window.renderCurrentPage = renderCurrentPage;
  window.applyTransform = applyTransform;
  window.currentPage = currentPage;
  window.createNodeFromData = createNodeFromData;
}
