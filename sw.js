/* =========================================
   みんなのジャム - Service Worker
   Phase 6: PWA化（オフライン動作＋ホーム画面追加）
   ========================================= */

// キャッシュ名（バージョンを変えると古いキャッシュを破棄してSW更新）
const CACHE_VERSION = 'v1.10.0';
const STATIC_CACHE  = 'mnj-static-'  + CACHE_VERSION;
const RUNTIME_CACHE = 'mnj-runtime-' + CACHE_VERSION;
const CDN_CACHE     = 'mnj-cdn-'     + CACHE_VERSION;

// プリキャッシュ対象（オフラインで必ず動かしたい本体ファイル）
// ※ ?v= 付きで指定すると HTML 側のクエリ付きリクエストとマッチして高速化
const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css?v=1.10.0',
  './js/state.js?v=1.10.0',
  './js/tools.js?v=1.10.0',
  './js/board.js?v=1.10.0',
  './js/pages.js?v=1.10.0',
  './js/sync.js?v=1.10.0',
  './js/p2p.js?v=1.10.0',
  './js/export.js?v=1.10.0',
  './js/qr.js?v=1.10.0',
  './js/timer.js?v=1.10.0',
  './js/lock.js?v=1.10.0',
  './js/collab.js?v=1.10.0',
  './js/giga.js?v=1.10.0',
  './js/organize.js?v=1.10.0',
  './js/dashboard.js?v=1.10.0',
  './js/templates.js?v=1.10.0',
  './js/import.js?v=1.10.0',
  './js/ocr.js?v=1.10.0',
  './js/poll.js?v=1.10.0',
  './js/app.js?v=1.10.0',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-192.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
];

// プリキャッシュ対象のCDN（オフライン起動のためにここも初回キャッシュ）
const CDN_PRECACHE = [
  'https://cdn.tailwindcss.com',
  'https://cdn.jsdelivr.net/npm/konva@9.3.16/konva.min.js',
  'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js',
  'https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js',
  'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js',
  'https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css',
  // v1.8.0 (Phase 8): PDF取り込み
  'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js',
  'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js',
  // v1.9.0 (Phase 9): 手書き文字認識 OCR
  'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js',
  // ※ Tesseract worker / core / 言語データはサイズが大きいので
  //   stale-while-revalidate (CDN_HOSTSマッチ) で初回使用時にキャッシュされる。
];

// CDN ドメイン判定（ランタイムキャッシュ用）
const CDN_HOSTS = [
  'cdn.tailwindcss.com',
  'cdn.jsdelivr.net',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
];

// =========================================
// install: プリキャッシュ + 即座に新SWを有効化
// =========================================
self.addEventListener('install', (event) => {
  console.log('[SW] install ' + CACHE_VERSION);
  event.waitUntil((async () => {
    const staticCache = await caches.open(STATIC_CACHE);
    // 失敗してもインストールを止めない（一部CDNがブロックされていても本体は動く）
    await Promise.allSettled(
      PRECACHE_URLS.map(url =>
        staticCache.add(new Request(url, { cache: 'reload' })).catch(err => {
          console.warn('[SW] static precache 失敗:', url, err);
        })
      )
    );
    const cdnCache = await caches.open(CDN_CACHE);
    await Promise.allSettled(
      CDN_PRECACHE.map(url =>
        cdnCache.add(new Request(url, { mode: 'no-cors' })).catch(err => {
          console.warn('[SW] cdn precache 失敗:', url, err);
        })
      )
    );
    // 待たずに即有効化
    self.skipWaiting();
  })());
});

// =========================================
// activate: 古いバージョンのキャッシュを破棄
// =========================================
self.addEventListener('activate', (event) => {
  console.log('[SW] activate ' + CACHE_VERSION);
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.map(k => {
        // 現バージョン以外を削除
        if (
          k !== STATIC_CACHE &&
          k !== RUNTIME_CACHE &&
          k !== CDN_CACHE &&
          /^mnj-/.test(k)
        ) {
          console.log('[SW] 古いキャッシュを削除:', k);
          return caches.delete(k);
        }
        return null;
      })
    );
    // 既存タブにも即座にこのSWを適用
    await self.clients.claim();
  })());
});

// =========================================
// fetch: 戦略を分岐
//   - HTML: ネット優先 + フォールバックでキャッシュ
//   - CDN: キャッシュ優先 + バックグラウンド更新
//   - 静的アセット: キャッシュ優先
//   - その他 (peerjs WebSocket等): SW介入なし
// =========================================
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // GET以外（POST等）はSW介入しない
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // chrome-extension:// などは触らない
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  // WebSocket は触れない（PeerJSのwss://はそもそもfetchイベント来ない想定）
  if (req.headers.get('upgrade') === 'websocket') return;

  // ===== 戦略1: HTMLナビゲーション → ネット優先 =====
  if (req.mode === 'navigate' || req.destination === 'document') {
    event.respondWith(networkFirst(req));
    return;
  }

  // ===== 戦略2: CDN（jsdelivr/tailwind/fonts等）→ stale-while-revalidate =====
  if (CDN_HOSTS.includes(url.hostname)) {
    event.respondWith(staleWhileRevalidate(req, CDN_CACHE));
    return;
  }

  // ===== 戦略3: 同一オリジンの静的ファイル → cache-first =====
  if (url.origin === self.location.origin) {
    // tables/ で始まるRESTful Table APIはキャッシュしない（動的データ）
    if (url.pathname.includes('/tables/')) {
      return; // ネットに任せる
    }
    event.respondWith(cacheFirst(req, STATIC_CACHE));
    return;
  }

  // ===== それ以外（外部API等）はSW介入しない =====
});

// =========================================
// 戦略実装
// =========================================

// ネット優先：オフラインまたは失敗時にキャッシュを返す
async function networkFirst(req) {
  try {
    const res = await fetch(req);
    // 成功したらキャッシュにも保存
    if (res && res.status === 200) {
      const cache = await caches.open(STATIC_CACHE);
      cache.put(req, res.clone()).catch(() => {});
    }
    return res;
  } catch (err) {
    // ネット失敗時はキャッシュから
    const cached = await caches.match(req, { ignoreSearch: false })
              || await caches.match('./index.html');
    if (cached) return cached;
    // それでも無ければ最低限のオフラインHTML
    return new Response(offlineFallbackHTML(), {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
      status: 200
    });
  }
}

// キャッシュ優先：無ければネットに問い合わせ
async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req, { ignoreSearch: false });
  if (cached) return cached;
  try {
    const res = await fetch(req);
    if (res && res.status === 200) {
      cache.put(req, res.clone()).catch(() => {});
    }
    return res;
  } catch (err) {
    // クエリ違いでマッチを試みる（?v= の差異対策）
    const fallback = await caches.match(req, { ignoreSearch: true });
    if (fallback) return fallback;
    throw err;
  }
}

// stale-while-revalidate：すぐキャッシュを返しつつ裏で更新
async function staleWhileRevalidate(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req, { ignoreSearch: false });
  const fetchPromise = fetch(req).then(res => {
    // no-cors の opaque レスポンスもキャッシュ可能
    if (res && (res.status === 200 || res.type === 'opaque')) {
      cache.put(req, res.clone()).catch(() => {});
    }
    return res;
  }).catch(() => null);
  return cached || (await fetchPromise) || new Response('', { status: 504 });
}

// 完全オフラインかつindex.htmlも未取得時のフォールバック
function offlineFallbackHTML() {
  return `<!doctype html>
<html lang="ja"><head><meta charset="utf-8">
<title>オフライン - みんなのジャム</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
body{font-family:system-ui,-apple-system,'Hiragino Sans',sans-serif;
  background:linear-gradient(135deg,#ff9a8b,#ffb88c,#c6a4ff);
  color:#fff;min-height:100vh;margin:0;display:flex;
  align-items:center;justify-content:center;text-align:center;padding:20px}
.card{background:rgba(255,255,255,0.95);color:#3a3a3a;border-radius:20px;
  padding:32px;max-width:400px;box-shadow:0 12px 40px rgba(0,0,0,0.2)}
h1{margin:0 0 12px;font-size:22px;color:#ff7e5f}
p{margin:8px 0;line-height:1.6}
button{margin-top:16px;padding:12px 24px;border-radius:10px;border:none;
  background:linear-gradient(135deg,#ff9a8b,#ffb88c);color:#fff;
  font-weight:700;font-size:14px;cursor:pointer}
</style></head>
<body><div class="card">
<h1>📡 オフラインです</h1>
<p>みんなのジャムは起動できますが、本体ファイルがまだキャッシュされていません。</p>
<p>一度オンラインで開いてから、もう一度お試しください。</p>
<button onclick="location.reload()">🔄 もう一度ためす</button>
</div></body></html>`;
}

// =========================================
// クライアントからのメッセージ
// （UI から「キャッシュをクリア」「強制更新」を受ける用）
// =========================================
self.addEventListener('message', (event) => {
  const msg = event.data || {};
  if (msg.type === 'SKIP_WAITING') {
    self.skipWaiting();
  } else if (msg.type === 'CLEAR_CACHES') {
    event.waitUntil((async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter(k => /^mnj-/.test(k)).map(k => caches.delete(k)));
      // 全クライアントに再読込を促す
      const clients = await self.clients.matchAll();
      clients.forEach(c => c.postMessage({ type: 'CACHE_CLEARED' }));
    })());
  } else if (msg.type === 'GET_VERSION') {
    event.ports[0] && event.ports[0].postMessage({ version: CACHE_VERSION });
  }
});
