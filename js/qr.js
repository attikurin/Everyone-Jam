/* =========================================
   みんなのジャム - QRコード共有機能
   招待URLをQR化して児童端末へ一括配布
   ========================================= */

(function () {
  let _qrVisible = false;
  let _lastUrl = '';
  let _lastDataUrl = '';

  // 招待URLからQRコードを生成（DOM要素 #qr-canvas に挿入）
  function renderQR(url) {
    const container = document.getElementById('qr-canvas');
    if (!container) return;
    if (typeof qrcode !== 'function') {
      container.innerHTML = '<div class="text-xs text-red-500 p-4">QR生成ライブラリの読み込みに失敗しました</div>';
      return;
    }
    _lastUrl = url;

    // URL長さに応じて最適なtypeNumberを自動選択
    let qr = null;
    for (let typeNumber = 4; typeNumber <= 20; typeNumber++) {
      try {
        const tmp = qrcode(typeNumber, 'M');
        tmp.addData(url);
        tmp.make();
        qr = tmp;
        break;
      } catch (e) {
        // 容量不足→次のサイズへ
      }
    }
    if (!qr) {
      container.innerHTML = '<div class="text-xs text-red-500 p-4">URLが長すぎてQR化できません</div>';
      return;
    }

    // SVGで描画（拡大しても綺麗）
    const cellSize = 6;
    const margin = 2;
    const moduleCount = qr.getModuleCount();
    const size = (moduleCount + margin * 2) * cellSize;

    let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="220" height="220" shape-rendering="crispEdges">`;
    svg += `<rect width="100%" height="100%" fill="#ffffff"/>`;
    svg += `<g fill="#1a1a2e">`;
    for (let r = 0; r < moduleCount; r++) {
      for (let c = 0; c < moduleCount; c++) {
        if (qr.isDark(r, c)) {
          const x = (c + margin) * cellSize;
          const y = (r + margin) * cellSize;
          svg += `<rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}"/>`;
        }
      }
    }
    svg += `</g></svg>`;
    container.innerHTML = svg;

    // PNGダウンロード用にDataURLを準備
    _lastDataUrl = svgToDataUrl(svg);
  }

  function svgToDataUrl(svg) {
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  // SVG→PNG変換（高解像度版）
  function downloadQRPng() {
    if (!_lastUrl) return;
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 720;
      canvas.height = 720;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      const title = (typeof State !== 'undefined' && State.boardTitle) ? State.boardTitle : 'board';
      const safe = String(title).replace(/[\\/:*?"<>|]/g, '_').slice(0, 20);
      a.href = dataUrl;
      a.download = `みんなのジャム_QR_${safe}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      if (typeof showToast === 'function') showToast('📥 QRコードを保存しました');
    };
    img.onerror = () => {
      if (typeof showToast === 'function') showToast('⚠️ QRコードの保存に失敗しました');
    };
    img.src = _lastDataUrl;
  }

  // 印刷用ウィンドウを開く（児童に配布する用紙として）
  function printQR() {
    if (!_lastUrl) return;
    const title = (typeof State !== 'undefined' && State.boardTitle) ? State.boardTitle : '無題のボード';
    const w = window.open('', '_blank', 'width=600,height=800');
    if (!w) {
      if (typeof showToast === 'function') showToast('⚠️ ポップアップがブロックされました');
      return;
    }
    const qrSvgEl = document.getElementById('qr-canvas');
    const qrSvg = qrSvgEl ? qrSvgEl.innerHTML : '';

    w.document.write(`
<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<title>${escapeHtml(title)} - QRコード配布用</title>
<style>
  * { box-sizing: border-box; }
  body {
    font-family: 'Hiragino Maru Gothic ProN', 'Yu Gothic', sans-serif;
    margin: 0; padding: 30px;
    background: #fff;
    color: #2c3e50;
  }
  .sheet {
    max-width: 540px;
    margin: 0 auto;
    border: 4px dashed #ffab91;
    border-radius: 24px;
    padding: 32px;
    text-align: center;
  }
  h1 {
    font-size: 24px;
    color: #ff6f61;
    margin: 0 0 8px;
  }
  .subtitle {
    font-size: 14px;
    color: #555;
    margin: 0 0 24px;
  }
  .qr-wrap {
    display: inline-block;
    padding: 16px;
    background: #fff;
    border: 2px solid #ffe0d6;
    border-radius: 12px;
  }
  .qr-wrap svg { width: 280px; height: 280px; display: block; }
  .url {
    margin-top: 20px;
    word-break: break-all;
    font-family: monospace;
    font-size: 11px;
    color: #888;
    padding: 8px;
    background: #f8f8f8;
    border-radius: 6px;
  }
  .steps {
    margin-top: 24px;
    text-align: left;
    background: #fff7ed;
    border-radius: 12px;
    padding: 16px 20px;
    font-size: 13px;
  }
  .steps h2 {
    font-size: 14px;
    color: #ff6f61;
    margin: 0 0 8px;
  }
  .steps ol {
    margin: 0; padding-left: 20px;
  }
  .steps li {
    margin-bottom: 4px;
  }
  .footer {
    margin-top: 16px;
    font-size: 10px;
    color: #aaa;
    text-align: right;
  }
  @media print {
    body { padding: 0; }
    .sheet { border-color: #ffab91; page-break-inside: avoid; }
    .no-print { display: none; }
  }
</style>
</head>
<body>
  <div class="sheet">
    <h1>📋 ${escapeHtml(title)}</h1>
    <p class="subtitle">下のQRコードをタブレットで読み取ってね</p>
    <div class="qr-wrap">${qrSvg}</div>
    <div class="url">${escapeHtml(_lastUrl)}</div>
    <div class="steps">
      <h2>👉 開きかた</h2>
      <ol>
        <li>カメラアプリでQRコードを写す</li>
        <li>出てきたリンクを押す</li>
        <li>「新しいボードを作る」ではなく、そのまま開く</li>
      </ol>
    </div>
    <div class="footer">みんなのジャム</div>
  </div>
  <script>
    window.addEventListener('load', () => { setTimeout(() => window.print(), 300); });
  </` + `script>
</body>
</html>
    `);
    w.document.close();
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]));
  }

  // 招待モーダル内のボタンに紐付け
  function setupQRHandlers() {
    const btnShow = document.getElementById('btn-show-qr');
    const section = document.getElementById('qr-section');
    const btnPrint = document.getElementById('btn-qr-print');
    const btnDownload = document.getElementById('btn-qr-download');
    const shareUrl = document.getElementById('share-url');

    if (btnShow && section) {
      btnShow.addEventListener('click', () => {
        _qrVisible = !_qrVisible;
        if (_qrVisible) {
          section.classList.remove('hidden');
          renderQR(shareUrl ? shareUrl.value : window.location.href);
        } else {
          section.classList.add('hidden');
        }
      });
    }

    if (btnPrint) btnPrint.addEventListener('click', printQR);
    if (btnDownload) btnDownload.addEventListener('click', downloadQRPng);

    // 招待URLが変わったらQRも追従
    if (shareUrl) {
      const observer = new MutationObserver(() => {
        if (_qrVisible) renderQR(shareUrl.value);
      });
      observer.observe(shareUrl, { attributes: true, attributeFilter: ['value'] });
      // valueはinputイベントで変化しないので、share-urlを設定する側で再描画する手もある
      // ここでは招待モーダルが開かれるたびにrenderQR()するようにshare側で呼ぶ
    }
  }

  // 公開
  window.QRShare = {
    setup: setupQRHandlers,
    render: renderQR,
    printQR,
    downloadQRPng,
  };

  // DOMContentLoaded で初期化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupQRHandlers);
  } else {
    setupQRHandlers();
  }
})();
