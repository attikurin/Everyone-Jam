/* =========================================
   みんなのジャム - 教材テンプレートライブラリ
   v1.7.0 / Phase 7
   ========================================= */
/*
   テンプレートは「Konvaオブジェクトの配列」として定義します。
   既存の addObjectToPage() を活用して一括挿入するため、
   board.js の変更は最小限です。

   BOARD_WIDTH = 1920, BOARD_HEIGHT = 1200 を基準に座標を指定。
*/

// ===== ヘルパー：オブジェクト生成 =====
function _tplText(x, y, text, opts = {}) {
  return {
    type: 'text',
    x, y,
    text,
    color: opts.color || '#3a3a3a',
    fontSize: opts.fontSize || 28,
    fontFamily: opts.fontFamily || 'M PLUS Rounded 1c',
    fontStyle: opts.bold ? 'bold' : 'normal',
    width: opts.width || 400,
    align: opts.align || 'left',
  };
}

function _tplRect(x, y, w, h, opts = {}) {
  return {
    type: 'rect',
    x, y,
    width: w, height: h,
    color: opts.color || '#FF7E5F',
    fill: opts.fill || '',
    strokeWidth: opts.strokeWidth || 3,
  };
}

function _tplCircle(x, y, w, h, opts = {}) {
  return {
    type: 'circle',
    x, y,
    width: w, height: h,
    color: opts.color || '#FF7E5F',
    fill: opts.fill || '',
    strokeWidth: opts.strokeWidth || 3,
  };
}

function _tplLine(x1, y1, x2, y2, opts = {}) {
  return {
    type: 'line',
    x: 0, y: 0,
    points: [x1, y1, x2, y2],
    color: opts.color || '#666666',
    size: opts.size || 3,
  };
}

function _tplSticky(x, y, text, color = '#FFE082') {
  return {
    type: 'sticky',
    x, y,
    width: 220, height: 220,
    color,
    text: text || '',
  };
}

// ===== テンプレート定義 =====
const TEMPLATES = [
  // ===========================
  //   思考整理（5種）
  // ===========================
  {
    id: 'kwl',
    name: 'KWLチャート',
    category: 'thinking',
    icon: 'fa-table-columns',
    description: '知っていること / 知りたいこと / 学んだこと の3列で考えを整理',
    build: () => {
      const objs = [];
      const colW = 580, startY = 200, h = 800;
      const cols = [
        { x: 60, title: 'K  知っていること', color: '#E74C3C', stickyColor: '#FFAB91' },
        { x: 670, title: 'W  知りたいこと', color: '#F39C12', stickyColor: '#FFE082' },
        { x: 1280, title: 'L  学んだこと', color: '#27AE60', stickyColor: '#C5E1A5' },
      ];
      // タイトル
      objs.push(_tplText(60, 80, 'KWLチャート', { fontSize: 56, bold: true, color: '#2C3E50', width: 1800 }));
      cols.forEach(c => {
        // 枠
        objs.push(_tplRect(c.x, startY, colW, h, { color: c.color, strokeWidth: 4 }));
        // ヘッダ帯
        objs.push(_tplRect(c.x, startY, colW, 80, { color: c.color, fill: c.color, strokeWidth: 0 }));
        // ヘッダ文字（白）
        objs.push(_tplText(c.x + 20, startY + 22, c.title, { fontSize: 36, bold: true, color: '#FFFFFF', width: colW - 40 }));
        // 例示付箋
        objs.push(_tplSticky(c.x + 30, startY + 120, '', c.stickyColor));
      });
      return objs;
    },
  },
  {
    id: 'venn',
    name: 'ベン図（2円）',
    category: 'thinking',
    icon: 'fa-circle-half-stroke',
    description: '2つの事柄の共通点と相違点を整理する重なり図',
    build: () => {
      const objs = [];
      objs.push(_tplText(60, 60, 'ベン図', { fontSize: 56, bold: true, color: '#2C3E50', width: 1800 }));
      // 左円
      objs.push(_tplCircle(280, 230, 720, 720, { color: '#E74C3C', strokeWidth: 5 }));
      // 右円
      objs.push(_tplCircle(920, 230, 720, 720, { color: '#3498DB', strokeWidth: 5 }));
      // ラベル
      objs.push(_tplText(360, 180, 'Ａ', { fontSize: 64, bold: true, color: '#E74C3C', width: 200, align: 'center' }));
      objs.push(_tplText(1360, 180, 'Ｂ', { fontSize: 64, bold: true, color: '#3498DB', width: 200, align: 'center' }));
      objs.push(_tplText(820, 540, '共通', { fontSize: 32, bold: true, color: '#9B59B6', width: 280, align: 'center' }));
      return objs;
    },
  },
  {
    id: 'mindmap',
    name: 'マインドマップ枠',
    category: 'thinking',
    icon: 'fa-diagram-project',
    description: '中心テーマから放射状にアイデアを広げる枠',
    build: () => {
      const objs = [];
      const cx = 960, cy = 600;
      // 中心円
      objs.push(_tplCircle(cx - 180, cy - 90, 360, 180, { color: '#FF7E5F', fill: '#FFE5DC', strokeWidth: 4 }));
      objs.push(_tplText(cx - 160, cy - 30, '中心テーマ', { fontSize: 36, bold: true, color: '#FF7E5F', width: 320, align: 'center' }));
      // 周囲の6つの枝
      const branches = [
        { angle: -90, color: '#E74C3C' },
        { angle: -30, color: '#F39C12' },
        { angle: 30, color: '#27AE60' },
        { angle: 90, color: '#3498DB' },
        { angle: 150, color: '#9B59B6' },
        { angle: 210, color: '#16A085' },
      ];
      const r = 400;
      branches.forEach(b => {
        const rad = (b.angle * Math.PI) / 180;
        const ex = cx + Math.cos(rad) * r;
        const ey = cy + Math.sin(rad) * r;
        // 線
        objs.push(_tplLine(cx, cy, ex, ey, { color: b.color, size: 4 }));
        // 子円
        objs.push(_tplCircle(ex - 110, ey - 55, 220, 110, { color: b.color, fill: '#ffffff', strokeWidth: 3 }));
      });
      return objs;
    },
  },
  {
    id: 't-chart',
    name: 'Tチャート（比較）',
    category: 'thinking',
    icon: 'fa-grip-lines-vertical',
    description: '2つの観点を左右に並べて比べるT字型シート',
    build: () => {
      const objs = [];
      objs.push(_tplText(60, 60, 'Tチャート（比較）', { fontSize: 56, bold: true, color: '#2C3E50', width: 1800 }));
      // 横線
      objs.push(_tplLine(60, 240, 1860, 240, { color: '#2C3E50', size: 6 }));
      // 縦線
      objs.push(_tplLine(960, 160, 960, 1140, { color: '#2C3E50', size: 6 }));
      // 見出し
      objs.push(_tplText(60, 170, 'メリット', { fontSize: 44, bold: true, color: '#27AE60', width: 880, align: 'center' }));
      objs.push(_tplText(980, 170, 'デメリット', { fontSize: 44, bold: true, color: '#E74C3C', width: 880, align: 'center' }));
      // 例示付箋
      objs.push(_tplSticky(180, 320, '', '#C5E1A5'));
      objs.push(_tplSticky(1100, 320, '', '#FFAB91'));
      return objs;
    },
  },
  {
    id: 'fishbone',
    name: 'フィッシュボーン図',
    category: 'thinking',
    icon: 'fa-fish',
    description: '結果に対する原因を魚の骨の形で多面的に分析',
    build: () => {
      const objs = [];
      objs.push(_tplText(60, 60, 'フィッシュボーン図（原因分析）', { fontSize: 48, bold: true, color: '#2C3E50', width: 1800 }));
      // 背骨
      objs.push(_tplLine(120, 600, 1640, 600, { color: '#2C3E50', size: 8 }));
      // 結果（魚の頭）
      objs.push(_tplRect(1640, 510, 220, 180, { color: '#FF7E5F', fill: '#FFE5DC', strokeWidth: 4 }));
      objs.push(_tplText(1660, 570, '結果', { fontSize: 40, bold: true, color: '#FF7E5F', width: 180, align: 'center' }));
      // 上下4本ずつ斜めの枝
      const branchData = [
        { sx: 300, sy: 600, ex: 250, ey: 220, label: '人' },
        { sx: 700, sy: 600, ex: 650, ey: 220, label: 'もの' },
        { sx: 1100, sy: 600, ex: 1050, ey: 220, label: '時間' },
        { sx: 1500, sy: 600, ex: 1450, ey: 220, label: '方法' },
        { sx: 500, sy: 600, ex: 450, ey: 980, label: '環境' },
        { sx: 900, sy: 600, ex: 850, ey: 980, label: '気持ち' },
        { sx: 1300, sy: 600, ex: 1250, ey: 980, label: '場所' },
      ];
      branchData.forEach(b => {
        objs.push(_tplLine(b.sx, b.sy, b.ex, b.ey, { color: '#3498DB', size: 4 }));
        const ly = b.ey < b.sy ? b.ey - 60 : b.ey + 10;
        objs.push(_tplText(b.ex - 70, ly, b.label, { fontSize: 28, bold: true, color: '#3498DB', width: 200, align: 'center' }));
      });
      return objs;
    },
  },

  // ===========================
  //   国語（3種）
  // ===========================
  {
    id: 'yonkoma',
    name: '4コマ漫画',
    category: 'japanese',
    icon: 'fa-table-cells-large',
    description: '起承転結を絵や文で表現する4コマ枠',
    build: () => {
      const objs = [];
      objs.push(_tplText(60, 60, '4コマ漫画', { fontSize: 56, bold: true, color: '#2C3E50', width: 1800 }));
      const labels = ['起', '承', '転', '結'];
      const colors = ['#E74C3C', '#F39C12', '#27AE60', '#3498DB'];
      const cellW = 440, cellH = 480;
      for (let i = 0; i < 4; i++) {
        const x = 60 + i * 460;
        const y = 200;
        objs.push(_tplRect(x, y, cellW, cellH, { color: '#2C3E50', strokeWidth: 4 }));
        // ラベル円
        objs.push(_tplCircle(x + 10, y + 10, 80, 80, { color: colors[i], fill: colors[i], strokeWidth: 0 }));
        objs.push(_tplText(x + 10, y + 22, labels[i], { fontSize: 44, bold: true, color: '#FFFFFF', width: 80, align: 'center' }));
        // セリフ欄
        objs.push(_tplRect(x + 20, y + cellH + 20, cellW - 40, 200, { color: '#999999', strokeWidth: 2 }));
        objs.push(_tplText(x + 30, y + cellH + 30, 'セリフ・説明をかこう', { fontSize: 20, color: '#999999', width: cellW - 60 }));
      }
      return objs;
    },
  },
  {
    id: 'story-map',
    name: '物語マップ',
    category: 'japanese',
    icon: 'fa-book-open',
    description: '登場人物・場面・出来事・気持ちで物語を読み解く',
    build: () => {
      const objs = [];
      objs.push(_tplText(60, 60, '物語マップ', { fontSize: 56, bold: true, color: '#2C3E50', width: 1800 }));
      const boxes = [
        { x: 60, y: 200, w: 900, h: 200, title: '📖 タイトル・作者', color: '#FF7E5F', sticky: '#FFAB91' },
        { x: 990, y: 200, w: 870, h: 200, title: '👤 登場人物', color: '#9B59B6', sticky: '#CE93D8' },
        { x: 60, y: 430, w: 590, h: 350, title: '🏞 場面（いつ・どこで）', color: '#3498DB', sticky: '#A5D6F7' },
        { x: 680, y: 430, w: 590, h: 350, title: '⚡ 出来事', color: '#F39C12', sticky: '#FFE082' },
        { x: 1300, y: 430, w: 560, h: 350, title: '💗 気持ち', color: '#E74C3C', sticky: '#F8BBD0' },
        { x: 60, y: 810, w: 1800, h: 300, title: '✨ 自分の感想・考え', color: '#27AE60', sticky: '#C5E1A5' },
      ];
      boxes.forEach(b => {
        objs.push(_tplRect(b.x, b.y, b.w, b.h, { color: b.color, strokeWidth: 4 }));
        objs.push(_tplRect(b.x, b.y, b.w, 50, { color: b.color, fill: b.color, strokeWidth: 0 }));
        objs.push(_tplText(b.x + 16, b.y + 8, b.title, { fontSize: 26, bold: true, color: '#FFFFFF', width: b.w - 32 }));
        objs.push(_tplSticky(b.x + 30, b.y + 80, '', b.sticky));
      });
      return objs;
    },
  },
  {
    id: 'character-card',
    name: '主人公カード',
    category: 'japanese',
    icon: 'fa-id-card',
    description: '登場人物の特徴・性格・行動を1枚にまとめる',
    build: () => {
      const objs = [];
      objs.push(_tplText(60, 60, '🌟 主人公カード', { fontSize: 56, bold: true, color: '#2C3E50', width: 1800 }));
      // 大枠
      objs.push(_tplRect(60, 200, 1800, 940, { color: '#FF7E5F', strokeWidth: 6 }));
      // 顔の枠
      objs.push(_tplRect(120, 280, 460, 460, { color: '#9B59B6', strokeWidth: 3 }));
      objs.push(_tplText(130, 480, '顔の絵をかこう', { fontSize: 28, color: '#9B59B6', width: 440, align: 'center' }));
      // 右側の項目
      const items = [
        { y: 280, label: '名前', color: '#E74C3C' },
        { y: 410, label: 'せいかく', color: '#F39C12' },
        { y: 540, label: 'すきなもの', color: '#27AE60' },
        { y: 670, label: '行動・口ぐせ', color: '#3498DB' },
      ];
      items.forEach(it => {
        objs.push(_tplRect(620, it.y, 1220, 110, { color: it.color, strokeWidth: 3 }));
        objs.push(_tplText(640, it.y + 30, it.label + '：', { fontSize: 32, bold: true, color: it.color, width: 280 }));
      });
      // 下段：印象的なセリフ
      objs.push(_tplRect(120, 800, 1720, 320, { color: '#9B59B6', strokeWidth: 3 }));
      objs.push(_tplText(140, 820, '💬 印象に残ったセリフ・行動', { fontSize: 30, bold: true, color: '#9B59B6', width: 1700 }));
      objs.push(_tplSticky(180, 880, '', '#CE93D8'));
      return objs;
    },
  },

  // ===========================
  //   算数（2種）
  // ===========================
  {
    id: 'hyakumasu',
    name: '百ます計算',
    category: 'math',
    icon: 'fa-square-root-variable',
    description: '10×10のマスで素早い計算練習',
    build: () => {
      const objs = [];
      objs.push(_tplText(60, 40, '百ます計算', { fontSize: 48, bold: true, color: '#2C3E50', width: 1200 }));
      objs.push(_tplText(1200, 50, '名前：', { fontSize: 32, color: '#666666', width: 600 }));
      const startX = 120, startY = 140;
      const cellSize = 90;
      // 演算子セル
      objs.push(_tplRect(startX, startY, cellSize, cellSize, { color: '#FF7E5F', fill: '#FFE5DC', strokeWidth: 3 }));
      objs.push(_tplText(startX + 20, startY + 24, '＋', { fontSize: 48, bold: true, color: '#FF7E5F', width: 50, align: 'center' }));
      // 上の数字行（ランダム1〜9）
      const topNums = [3, 7, 2, 9, 4, 1, 8, 5, 6, 0];
      const leftNums = [5, 8, 1, 4, 9, 2, 7, 3, 6, 0];
      topNums.forEach((n, i) => {
        const x = startX + (i + 1) * cellSize;
        objs.push(_tplRect(x, startY, cellSize, cellSize, { color: '#3498DB', fill: '#E3F2FD', strokeWidth: 2 }));
        objs.push(_tplText(x, startY + 18, String(n), { fontSize: 48, bold: true, color: '#3498DB', width: cellSize, align: 'center' }));
      });
      // 左の数字列＋空のマス
      leftNums.forEach((n, r) => {
        const y = startY + (r + 1) * cellSize;
        objs.push(_tplRect(startX, y, cellSize, cellSize, { color: '#E74C3C', fill: '#FFEBEE', strokeWidth: 2 }));
        objs.push(_tplText(startX, y + 18, String(n), { fontSize: 48, bold: true, color: '#E74C3C', width: cellSize, align: 'center' }));
        // 答えのマス
        for (let c = 0; c < 10; c++) {
          const x = startX + (c + 1) * cellSize;
          objs.push(_tplRect(x, y, cellSize, cellSize, { color: '#999999', strokeWidth: 1 }));
        }
      });
      return objs;
    },
  },
  {
    id: 'number-line',
    name: '数直線',
    category: 'math',
    icon: 'fa-ruler-horizontal',
    description: '数の大小・たし算ひき算を視覚化する数直線',
    build: () => {
      const objs = [];
      objs.push(_tplText(60, 60, '数直線', { fontSize: 56, bold: true, color: '#2C3E50', width: 1800 }));
      // メイン線
      const lineY = 600;
      objs.push(_tplLine(100, lineY, 1820, lineY, { color: '#2C3E50', size: 6 }));
      // 矢印（左右の三角形で代用）
      objs.push(_tplLine(100, lineY, 130, lineY - 15, { color: '#2C3E50', size: 6 }));
      objs.push(_tplLine(100, lineY, 130, lineY + 15, { color: '#2C3E50', size: 6 }));
      objs.push(_tplLine(1820, lineY, 1790, lineY - 15, { color: '#2C3E50', size: 6 }));
      objs.push(_tplLine(1820, lineY, 1790, lineY + 15, { color: '#2C3E50', size: 6 }));
      // 目盛り（0〜20）
      const tickStart = 200;
      const tickStep = 76;
      for (let i = 0; i <= 20; i++) {
        const x = tickStart + i * tickStep;
        const big = (i % 5 === 0);
        objs.push(_tplLine(x, lineY - (big ? 24 : 14), x, lineY + (big ? 24 : 14), { color: '#2C3E50', size: big ? 4 : 2 }));
        if (big) {
          objs.push(_tplText(x - 40, lineY + 40, String(i), { fontSize: 36, bold: true, color: '#2C3E50', width: 80, align: 'center' }));
        }
      }
      // 例示付箋
      objs.push(_tplSticky(300, 250, '', '#FFE082'));
      objs.push(_tplSticky(1200, 250, '', '#A5D6F7'));
      return objs;
    },
  },

  // ===========================
  //   理科・社会（2種）
  // ===========================
  {
    id: 'observation',
    name: '観察記録カード',
    category: 'science',
    icon: 'fa-microscope',
    description: '理科の観察記録を絵と気づきで残す',
    build: () => {
      const objs = [];
      objs.push(_tplText(60, 50, '🔍 観察記録カード', { fontSize: 48, bold: true, color: '#27AE60', width: 1800 }));
      // 日付・名前
      objs.push(_tplRect(60, 140, 880, 80, { color: '#27AE60', strokeWidth: 3 }));
      objs.push(_tplText(80, 160, '日付：　　月　　日　　天気：　　　', { fontSize: 28, color: '#2C3E50', width: 840 }));
      objs.push(_tplRect(960, 140, 900, 80, { color: '#27AE60', strokeWidth: 3 }));
      objs.push(_tplText(980, 160, '名前：', { fontSize: 28, color: '#2C3E50', width: 860 }));
      // 観察対象
      objs.push(_tplRect(60, 240, 1800, 80, { color: '#F39C12', fill: '#FFF8E1', strokeWidth: 3 }));
      objs.push(_tplText(80, 260, '🌱 観察したもの：', { fontSize: 32, bold: true, color: '#F39C12', width: 1760 }));
      // 絵の枠
      objs.push(_tplRect(60, 340, 900, 600, { color: '#3498DB', strokeWidth: 3 }));
      objs.push(_tplText(80, 360, '✏️ スケッチ', { fontSize: 28, bold: true, color: '#3498DB', width: 860 }));
      // 気づき
      objs.push(_tplRect(980, 340, 880, 600, { color: '#E74C3C', strokeWidth: 3 }));
      objs.push(_tplText(1000, 360, '💡 気づいたこと', { fontSize: 28, bold: true, color: '#E74C3C', width: 840 }));
      objs.push(_tplSticky(1020, 420, '', '#FFAB91'));
      objs.push(_tplSticky(1020, 670, '', '#FFE082'));
      // まとめ
      objs.push(_tplRect(60, 960, 1800, 180, { color: '#9B59B6', strokeWidth: 3 }));
      objs.push(_tplText(80, 980, '📝 まとめ・次に調べたいこと', { fontSize: 28, bold: true, color: '#9B59B6', width: 1760 }));
      return objs;
    },
  },
  {
    id: 'timeline',
    name: '年表',
    category: 'science',
    icon: 'fa-timeline',
    description: '社会科の出来事を時系列で並べる年表シート',
    build: () => {
      const objs = [];
      objs.push(_tplText(60, 60, '🗓 年表', { fontSize: 56, bold: true, color: '#2C3E50', width: 1800 }));
      // 横軸
      const axisY = 700;
      objs.push(_tplLine(120, axisY, 1820, axisY, { color: '#2C3E50', size: 6 }));
      objs.push(_tplLine(1820, axisY, 1790, axisY - 15, { color: '#2C3E50', size: 6 }));
      objs.push(_tplLine(1820, axisY, 1790, axisY + 15, { color: '#2C3E50', size: 6 }));
      // 6つの時代区分
      const periods = [
        { x: 200, color: '#E74C3C' },
        { x: 480, color: '#F39C12' },
        { x: 760, color: '#27AE60' },
        { x: 1040, color: '#3498DB' },
        { x: 1320, color: '#9B59B6' },
        { x: 1600, color: '#16A085' },
      ];
      periods.forEach((p, i) => {
        // 縦線
        objs.push(_tplLine(p.x, axisY - 30, p.x, axisY + 30, { color: p.color, size: 5 }));
        // 上の枠（出来事）
        objs.push(_tplRect(p.x - 110, 300, 220, 360, { color: p.color, strokeWidth: 3 }));
        objs.push(_tplText(p.x - 100, 310, `第${i + 1}期`, { fontSize: 24, bold: true, color: p.color, width: 200, align: 'center' }));
        objs.push(_tplSticky(p.x - 100, 370, '', '#FFE082'));
        // 下の年号欄
        objs.push(_tplRect(p.x - 80, axisY + 60, 160, 70, { color: p.color, fill: '#ffffff', strokeWidth: 2 }));
        objs.push(_tplText(p.x - 80, axisY + 78, '年', { fontSize: 28, bold: true, color: p.color, width: 160, align: 'center' }));
      });
      // 凡例
      objs.push(_tplText(60, 1000, '← 古い　　　　　　時代の流れ　　　　　　新しい →', { fontSize: 28, color: '#666666', width: 1800, align: 'center' }));
      return objs;
    },
  },

  // ===========================
  //   学級活動（3種）
  // ===========================
  {
    id: 'self-intro',
    name: '自己紹介カード',
    category: 'classroom',
    icon: 'fa-user-circle',
    description: '名前・好きなもの・がんばりたいことを発表',
    build: () => {
      const objs = [];
      objs.push(_tplText(60, 50, '🌸 自己紹介カード', { fontSize: 56, bold: true, color: '#E91E63', width: 1800 }));
      // 大枠（虹色っぽい印象に）
      objs.push(_tplRect(60, 180, 1800, 960, { color: '#E91E63', strokeWidth: 6 }));
      // 顔の枠
      objs.push(_tplRect(120, 260, 500, 500, { color: '#FF9800', strokeWidth: 4 }));
      objs.push(_tplText(140, 480, '😊 似顔絵', { fontSize: 32, bold: true, color: '#FF9800', width: 460, align: 'center' }));
      // 名前
      objs.push(_tplRect(660, 260, 1180, 160, { color: '#9C27B0', strokeWidth: 4 }));
      objs.push(_tplText(680, 290, '名前', { fontSize: 28, bold: true, color: '#9C27B0', width: 200 }));
      objs.push(_tplText(680, 340, '　　　　　　　　　', { fontSize: 48, color: '#2C3E50', width: 1140 }));
      // 好きなこと
      objs.push(_tplRect(660, 440, 580, 320, { color: '#27AE60', strokeWidth: 4 }));
      objs.push(_tplText(680, 460, '💖 すきなこと', { fontSize: 28, bold: true, color: '#27AE60', width: 540 }));
      objs.push(_tplSticky(700, 520, '', '#C5E1A5'));
      // 好きなもの
      objs.push(_tplRect(1260, 440, 580, 320, { color: '#3498DB', strokeWidth: 4 }));
      objs.push(_tplText(1280, 460, '🎵 すきなもの', { fontSize: 28, bold: true, color: '#3498DB', width: 540 }));
      objs.push(_tplSticky(1300, 520, '', '#A5D6F7'));
      // 今年がんばりたいこと
      objs.push(_tplRect(120, 800, 1720, 320, { color: '#E74C3C', strokeWidth: 4 }));
      objs.push(_tplText(140, 820, '🔥 今年がんばりたいこと', { fontSize: 32, bold: true, color: '#E74C3C', width: 1700 }));
      objs.push(_tplSticky(180, 880, '', '#FFAB91'));
      objs.push(_tplSticky(900, 880, '', '#FFE082'));
      return objs;
    },
  },
  {
    id: 'reflection',
    name: '1日の振り返り',
    category: 'classroom',
    icon: 'fa-clipboard-check',
    description: 'できた・がんばった・次の目標を整理',
    build: () => {
      const objs = [];
      objs.push(_tplText(60, 60, '🌟 今日のふりかえり', { fontSize: 56, bold: true, color: '#2C3E50', width: 1800 }));
      objs.push(_tplText(60, 140, '日付：　　月　　日（　）　　名前：', { fontSize: 28, color: '#666666', width: 1800 }));
      const items = [
        { x: 60, y: 220, label: '😄 できたこと', color: '#27AE60', sticky: '#C5E1A5' },
        { x: 660, y: 220, label: '💪 がんばったこと', color: '#F39C12', sticky: '#FFE082' },
        { x: 1260, y: 220, label: '💡 学んだこと', color: '#3498DB', sticky: '#A5D6F7' },
        { x: 60, y: 720, label: '😢 むずかしかったこと', color: '#E74C3C', sticky: '#FFAB91' },
        { x: 660, y: 720, label: '🎯 明日の目標', color: '#9B59B6', sticky: '#CE93D8' },
        { x: 1260, y: 720, label: '✨ 友だちのいいところ', color: '#E91E63', sticky: '#F8BBD0' },
      ];
      items.forEach(it => {
        objs.push(_tplRect(it.x, it.y, 580, 480, { color: it.color, strokeWidth: 4 }));
        objs.push(_tplRect(it.x, it.y, 580, 60, { color: it.color, fill: it.color, strokeWidth: 0 }));
        objs.push(_tplText(it.x + 16, it.y + 14, it.label, { fontSize: 28, bold: true, color: '#FFFFFF', width: 560 }));
        objs.push(_tplSticky(it.x + 30, it.y + 90, '', it.sticky));
      });
      return objs;
    },
  },
  {
    id: 'group-roster',
    name: '班分けカード',
    category: 'classroom',
    icon: 'fa-people-group',
    description: '6班×役割のグループ分けボード',
    build: () => {
      const objs = [];
      objs.push(_tplText(60, 60, '👥 班分け表', { fontSize: 56, bold: true, color: '#2C3E50', width: 1800 }));
      const colors = ['#E74C3C', '#F39C12', '#27AE60', '#3498DB', '#9B59B6', '#16A085'];
      const stickyColors = ['#FFAB91', '#FFE082', '#C5E1A5', '#A5D6F7', '#CE93D8', '#80CBC4'];
      for (let i = 0; i < 6; i++) {
        const col = i % 3;
        const row = Math.floor(i / 3);
        const x = 60 + col * 610;
        const y = 200 + row * 470;
        // 大枠
        objs.push(_tplRect(x, y, 580, 440, { color: colors[i], strokeWidth: 4 }));
        // ヘッダ
        objs.push(_tplRect(x, y, 580, 60, { color: colors[i], fill: colors[i], strokeWidth: 0 }));
        objs.push(_tplText(x + 16, y + 14, `${i + 1}班`, { fontSize: 32, bold: true, color: '#FFFFFF', width: 560 }));
        // メンバー付箋を4枚配置
        objs.push(_tplSticky(x + 30, y + 90, '', stickyColors[i]));
        objs.push(_tplSticky(x + 300, y + 90, '', stickyColors[i]));
        objs.push(_tplSticky(x + 30, y + 220, '', stickyColors[i]));
        objs.push(_tplSticky(x + 300, y + 220, '', stickyColors[i]));
      }
      return objs;
    },
  },
];

// ===== カテゴリ定義 =====
const TEMPLATE_CATEGORIES = [
  { id: 'all', label: 'すべて', icon: 'fa-grip' },
  { id: 'thinking', label: '思考整理', icon: 'fa-brain', color: '#9B59B6' },
  { id: 'japanese', label: '国語', icon: 'fa-book', color: '#E74C3C' },
  { id: 'math', label: '算数', icon: 'fa-calculator', color: '#3498DB' },
  { id: 'science', label: '理科社会', icon: 'fa-flask', color: '#27AE60' },
  { id: 'classroom', label: '学級活動', icon: 'fa-school', color: '#E91E63' },
];

// ===== 挿入：現在のページに上書きせず追加 =====
// mode: 'append' = 現在ページにオブジェクトを足す
//       'new-page' = 新しいページを追加して、そこに挿入
//       'replace' = 現在ページの内容を全消ししてから挿入（確認ダイアログあり）
function insertTemplate(templateId, mode = 'append') {
  const tpl = TEMPLATES.find(t => t.id === templateId);
  if (!tpl) {
    if (typeof showToast === 'function') showToast('⚠️ テンプレートが見つかりません');
    return;
  }
  if (typeof currentPage !== 'function') {
    showToast('⚠️ ボードが準備できていません');
    return;
  }

  // 'replace' は確認
  if (mode === 'replace') {
    const page = currentPage();
    if (page && Array.isArray(page.objects) && page.objects.length > 0) {
      if (!confirm('現在のページの内容を消して、テンプレートを挿入しますか？')) return;
      // 既存オブジェクトを全削除
      page.objects = [];
      // Konvaノードもクリア
      if (State.mainLayer) {
        State.mainLayer.destroyChildren();
        State.mainLayer.batchDraw();
      }
      // 選択解除
      if (typeof clearSelection === 'function') clearSelection();
    }
  }

  // 'new-page' は新ページを追加
  if (mode === 'new-page') {
    if (typeof addPage === 'function') {
      addPage(State.currentPageIndex);
    }
  }

  // オブジェクト一括挿入
  const objs = tpl.build();
  let inserted = 0;
  objs.forEach(o => {
    // IDを必ず付与
    o.id = uid();
    // addObjectToPage は履歴/保存/同期を行うが、毎回呼ぶと重い
    // → 直接 page.objects に push し、最後にまとめて renderCurrentPage + history
    const page = currentPage();
    if (!page) return;
    if (typeof markObjectByCurrentRole === 'function') {
      markObjectByCurrentRole(o);
    }
    page.objects.push(o);
    inserted++;
  });

  // 一括で描画・履歴・保存・同期
  if (typeof renderCurrentPage === 'function') renderCurrentPage();
  if (typeof pushHistory === 'function') pushHistory();
  if (typeof saveBoardToStorage === 'function') saveBoardToStorage();
  if (typeof broadcastChange === 'function') broadcastChange();
  if (typeof updatePageThumb === 'function') updatePageThumb(State.currentPageIndex);

  if (typeof showToast === 'function') {
    showToast(`✨ 「${tpl.name}」を挿入しました（${inserted}個）`);
  }
}

// ===== モーダル制御 =====
let _templateModalCurrentCategory = 'all';

function openTemplateModal() {
  const modal = document.getElementById('modal-templates');
  if (!modal) return;
  modal.classList.remove('hidden');
  // カテゴリタブを描画
  renderTemplateCategories();
  renderTemplateGallery(_templateModalCurrentCategory);
}

function closeTemplateModal() {
  const modal = document.getElementById('modal-templates');
  if (!modal) return;
  modal.classList.add('hidden');
}

function renderTemplateCategories() {
  const container = document.getElementById('template-categories');
  if (!container) return;
  container.innerHTML = '';
  TEMPLATE_CATEGORIES.forEach(cat => {
    const btn = document.createElement('button');
    btn.className = 'template-cat-btn' + (cat.id === _templateModalCurrentCategory ? ' active' : '');
    btn.dataset.cat = cat.id;
    btn.innerHTML = `<i class="fa-solid ${cat.icon}"></i><span>${cat.label}</span>`;
    btn.addEventListener('click', () => {
      _templateModalCurrentCategory = cat.id;
      // active切替
      container.querySelectorAll('.template-cat-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderTemplateGallery(cat.id);
    });
    container.appendChild(btn);
  });
}

function renderTemplateGallery(catId) {
  const container = document.getElementById('template-gallery');
  if (!container) return;
  container.innerHTML = '';
  const list = catId === 'all' ? TEMPLATES : TEMPLATES.filter(t => t.category === catId);
  if (list.length === 0) {
    container.innerHTML = '<div class="col-span-full text-center text-gray-400 py-8">該当するテンプレートがありません</div>';
    return;
  }
  list.forEach(tpl => {
    const cat = TEMPLATE_CATEGORIES.find(c => c.id === tpl.category) || {};
    const card = document.createElement('div');
    card.className = 'template-card';
    card.innerHTML = `
      <div class="template-card-preview" data-tpl-id="${tpl.id}">
        ${renderTemplatePreviewSVG(tpl)}
      </div>
      <div class="template-card-body">
        <div class="template-card-title">
          <i class="fa-solid ${tpl.icon}" style="color:${cat.color || '#FF7E5F'}"></i>
          <span>${tpl.name}</span>
        </div>
        <p class="template-card-desc">${tpl.description}</p>
        <div class="template-card-actions">
          <button class="template-action-btn primary" data-tpl-action="append" data-tpl-id="${tpl.id}" title="このページに追加">
            <i class="fa-solid fa-plus"></i>追加
          </button>
          <button class="template-action-btn" data-tpl-action="new-page" data-tpl-id="${tpl.id}" title="新しいページに挿入">
            <i class="fa-solid fa-file-circle-plus"></i>新ページ
          </button>
          <button class="template-action-btn warn" data-tpl-action="replace" data-tpl-id="${tpl.id}" title="現在のページを置き換え">
            <i class="fa-solid fa-arrows-rotate"></i>置換
          </button>
        </div>
      </div>
    `;
    container.appendChild(card);
  });

  // ボタンクリックイベント
  container.querySelectorAll('[data-tpl-action]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const action = btn.dataset.tplAction;
      const id = btn.dataset.tplId;
      insertTemplate(id, action);
      closeTemplateModal();
    });
  });
}

// テンプレ用の小さなプレビュー（SVGで軽量描画）
function renderTemplatePreviewSVG(tpl) {
  const objs = tpl.build();
  const scaleX = 280 / BOARD_WIDTH;
  const scaleY = 175 / BOARD_HEIGHT;
  let shapes = '';
  objs.forEach(o => {
    const x = (o.x || 0) * scaleX;
    const y = (o.y || 0) * scaleY;
    if (o.type === 'rect') {
      const w = (o.width || 40) * scaleX;
      const h = (o.height || 40) * scaleY;
      shapes += `<rect x="${x}" y="${y}" width="${w}" height="${h}" stroke="${o.color}" fill="${o.fill || 'none'}" stroke-width="${Math.max(0.5, (o.strokeWidth || 2) * scaleX)}"/>`;
    } else if (o.type === 'circle') {
      const w = (o.width || 40) * scaleX;
      const h = (o.height || 40) * scaleY;
      shapes += `<ellipse cx="${x + w/2}" cy="${y + h/2}" rx="${w/2}" ry="${h/2}" stroke="${o.color}" fill="${o.fill || 'none'}" stroke-width="${Math.max(0.5, (o.strokeWidth || 2) * scaleX)}"/>`;
    } else if (o.type === 'line') {
      const p = o.points || [];
      if (p.length >= 4) {
        shapes += `<line x1="${p[0]*scaleX}" y1="${p[1]*scaleY}" x2="${p[2]*scaleX}" y2="${p[3]*scaleY}" stroke="${o.color}" stroke-width="${Math.max(0.5, (o.size||3)*scaleX)}"/>`;
      }
    } else if (o.type === 'sticky') {
      const w = (o.width || 180) * scaleX;
      const h = (o.height || 180) * scaleY;
      shapes += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${o.color}" rx="2"/>`;
    } else if (o.type === 'text') {
      const fs = Math.max(4, (o.fontSize || 28) * scaleX * 0.9);
      const txt = String(o.text || '').replace(/[<>&]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;'}[c])).substring(0, 30);
      shapes += `<text x="${x}" y="${y + fs}" fill="${o.color}" font-size="${fs}" font-weight="${o.fontStyle === 'bold' ? '700' : '400'}">${txt}</text>`;
    }
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 280 175" preserveAspectRatio="xMidYMid meet" style="width:100%;height:100%;background:#fffaf5;border-radius:6px">${shapes}</svg>`;
}

// ===== windowに公開 =====
if (typeof window !== 'undefined') {
  window.TEMPLATES = TEMPLATES;
  window.TEMPLATE_CATEGORIES = TEMPLATE_CATEGORIES;
  window.insertTemplate = insertTemplate;
  window.openTemplateModal = openTemplateModal;
  window.closeTemplateModal = closeTemplateModal;
}
