/* =========================================
   みんなのジャム - ツールバーとオプション
   ========================================= */

function setTool(toolName) {
  // 画像ツールはファイル選択を開くだけ
  if (toolName === 'image') {
    const input = document.getElementById('image-upload');
    if (input) input.click();
    return;
  }

  State.currentTool = toolName;

  // ツールボタンのアクティブ切替
  document.querySelectorAll('.tool-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tool === toolName);
  });

  // カーソル変更
  const canvas = document.getElementById('canvas-container');
  if (canvas) {
    canvas.className = 'absolute inset-0';
    switch (toolName) {
      case 'select': break;
      case 'pen':
      case 'marker':
      case 'shape':
      case 'sticky': canvas.classList.add('cursor-crosshair'); break;
      case 'eraser': canvas.classList.add('cursor-cell'); break;
      case 'text': canvas.classList.add('cursor-text'); break;
      case 'laser': canvas.classList.add('cursor-none'); break;
    }
  }

  // 選択ツール以外ではトランスフォーマー解除
  if (toolName !== 'select' && State.transformer) {
    State.transformer.nodes([]);
    if (State.uiLayer) State.uiLayer.batchDraw();
  }

  // オプションパネル更新
  renderToolOptions(toolName);
}

function renderToolOptions(toolName) {
  const panel = document.getElementById('tool-options');
  if (!panel) return;
  panel.innerHTML = '';

  if (toolName === 'pen') {
    buildColorSwatches(panel, PEN_COLORS, State.penColor, c => State.penColor = c);
    addDivider(panel);
    buildSizeOptions(panel, PEN_SIZES, State.penSize, s => State.penSize = s);
    panel.classList.remove('hidden');
  } else if (toolName === 'marker') {
    buildColorSwatches(panel, MARKER_COLORS, State.markerColor, c => State.markerColor = c);
    addDivider(panel);
    buildSizeOptions(panel, MARKER_SIZES, State.markerSize, s => State.markerSize = s);
    panel.classList.remove('hidden');
  } else if (toolName === 'eraser') {
    buildSizeOptions(panel, ERASER_SIZES, State.eraserSize, s => State.eraserSize = s);
    panel.classList.remove('hidden');
  } else if (toolName === 'sticky') {
    buildColorSwatches(panel, STICKY_COLORS, State.stickyColor, c => State.stickyColor = c);
    panel.classList.remove('hidden');
  } else if (toolName === 'shape') {
    buildShapeOptions(panel);
    addDivider(panel);
    buildColorSwatches(panel, PEN_COLORS, State.penColor, c => State.penColor = c);
    panel.classList.remove('hidden');
  } else {
    panel.classList.add('hidden');
  }
}

function buildColorSwatches(panel, colors, activeColor, onSelect) {
  colors.forEach(color => {
    const dot = document.createElement('div');
    dot.className = 'opt-color' + (color === activeColor ? ' active' : '');
    dot.style.background = color;
    dot.onclick = () => {
      onSelect(color);
      renderToolOptions(State.currentTool);
    };
    panel.appendChild(dot);
  });
}

function buildSizeOptions(panel, sizes, activeSize, onSelect) {
  sizes.forEach(size => {
    const btn = document.createElement('div');
    btn.className = 'opt-size' + (size === activeSize ? ' active' : '');
    const displaySize = Math.min(size, 18);
    btn.innerHTML = `<span class="dot" style="width:${displaySize}px;height:${displaySize}px;"></span>`;
    btn.onclick = () => {
      onSelect(size);
      renderToolOptions(State.currentTool);
    };
    panel.appendChild(btn);
  });
}

function buildShapeOptions(panel) {
  // [B19修正] 三角形アイコンを正しく上向きに
  const shapes = [
    { key: 'rect', icon: 'fa-regular fa-square', label: '四角' },
    { key: 'circle', icon: 'fa-regular fa-circle', label: '丸' },
    { key: 'triangle', icon: 'fa-solid fa-play', label: '三角', rotate: -90 },
    { key: 'line', icon: 'fa-solid fa-minus', label: '線' },
    { key: 'arrow', icon: 'fa-solid fa-arrow-right-long', label: '矢印' },
  ];
  shapes.forEach(s => {
    const btn = document.createElement('div');
    btn.className = 'opt-shape' + (s.key === State.shapeType ? ' active' : '');
    btn.title = s.label;
    if (s.rotate) {
      btn.innerHTML = `<i class="${s.icon}" style="transform:rotate(${s.rotate}deg);display:inline-block"></i>`;
    } else {
      btn.innerHTML = `<i class="${s.icon}"></i>`;
    }
    btn.onclick = () => {
      State.shapeType = s.key;
      renderToolOptions('shape');
    };
    panel.appendChild(btn);
  });
}

function addDivider(panel) {
  const div = document.createElement('div');
  div.className = 'opt-divider';
  panel.appendChild(div);
}
