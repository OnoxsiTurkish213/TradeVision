/* ===========================
   TRADEVISION — app.js
   =========================== */

const PROXY = 'https://tradevision-proxy.onoxsi213turkish.workers.dev';

function proxyGet(target, path) {
  return fetch(`${PROXY}?target=${target}&path=${encodeURIComponent(path)}`).then(r => r.json());
}

async function proxyPost(target, body) {
  const r = await fetch(`${PROXY}?target=${target}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return r.json();
}

// ── STATE ────────────────────────────────────────────────
let currentMode     = 'crypto';
let currentExchange = 'US';
let coinPage        = 1;
let allCoins        = [];
let currentAsset    = null;
let tvChart         = null;
let tvSeries        = null;
let aiPanelOpen     = false;

// ── INIT ─────────────────────────────────────────────────
window.addEventListener('load', () => {
  // Apply saved theme
  const saved = localStorage.getItem('tv_theme') || 'dark';
  applyTheme(saved);

  setTimeout(() => {
    document.getElementById('splash').style.display = 'none';
    document.getElementById('app').classList.remove('hidden');
    setupSearch();
    loadCryptoList();
  }, 1700);
});

// ── THEME ─────────────────────────────────────────────────
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const toggle = document.getElementById('themeToggle');
  if (toggle) toggle.checked = (theme === 'dark');
  localStorage.setItem('tv_theme', theme);
}

function toggleTheme(checkbox) {
  applyTheme(checkbox.checked ? 'dark' : 'light');
  // Redraw chart if open
  if (tvChart && currentAsset) {
    const activeBtn = document.querySelector('.time-btn.active');
    const range = activeBtn ? activeBtn.onclick.toString().match(/'(\w+)'/)?.[1] : '1d';
    if (currentAsset.type === 'crypto') loadCryptoChart(currentAsset.id, range || '1d');
    else loadStockChart(currentAsset.id, range || '1d');
  }
}

// ── MODE SWITCH ──────────────────────────────────────────
function switchMode(mode) {
  currentMode = mode;
  document.getElementById('btn-crypto').classList.toggle('active', mode === 'crypto');
  document.getElementById('btn-stock').classList.toggle('active',  mode === 'stock');
  document.getElementById('crypto-view').classList.toggle('hidden', mode !== 'crypto');
  document.getElementById('stock-view').classList.toggle('hidden',  mode !== 'stock');
  if (mode === 'stock' && !document.getElementById('stockList').children.length) {
    loadStockList('US');
  }
}

// ── NAV ──────────────────────────────────────────────────
function navTo(page) {
  ['navHome','navMarkets','navAI','navSettings'].forEach(id => {
    document.getElementById(id)?.classList.remove('active');
  });
  document.getElementById('settingsPanel').classList.add('hidden');

  if (page === 'settings') {
    document.getElementById('settingsPanel').classList.remove('hidden');
    document.getElementById('navSettings')?.classList.add('active');
  } else {
    document.getElementById('navHome')?.classList.add('active');
  }
}

// ── AI PANEL ─────────────────────────────────────────────
function toggleAI() {
  aiPanelOpen = !aiPanelOpen;
  document.getElementById('aiPanel').classList.toggle('hidden', !aiPanelOpen);
  document.getElementById('navAI')?.classList.toggle('active', aiPanelOpen);
}

// ── SEARCH ───────────────────────────────────────────────
function setupSearch() {
  const input   = document.getElementById('searchInput');
  const results = document.getElementById('searchResults');
  let timer;

  input.addEventListener('input', () => {
    clearTimeout(timer);
    const q = input.value.trim();
    if (!q) { results.classList.add('hidden'); return; }
    timer = setTimeout(() => doSearch(q), 380);
  });

  document.addEventListener('click', e => {
    if (!e.target.closest('.search-box')) results.classList.add('hidden');
  });
}

async function doSearch(q) {
  const results = document.getElementById('searchResults');
  const ql = q.toLowerCase();

  const coinHits = allCoins.filter(c =>
    c.symbol.toLowerCase().includes(ql) || c.name.toLowerCase().includes(ql)
  ).slice(0, 5);

  let html = coinHits.map(c => {
    const chg = c.price_change_percentage_24h || 0;
    return `<div class="search-item" onclick="openCryptoDetail('${c.id}');document.getElementById('searchResults').classList.add('hidden');document.getElementById('searchInput').value=''">
      <img class="search-item-logo" src="${c.image}" alt="" onerror="this.style.display='none'" />
      <div>
        <div class="search-item-name">${c.name}</div>
        <div class="search-item-sym">${c.symbol.toUpperCase()} &nbsp;<span class="${chg>=0?'pos':'neg'}">${chg>=0?'+':''}${chg.toFixed(2)}%</span></div>
      </div>
    </div>`;
  }).join('');

  // Also search stocks via Finnhub
  try {
    const d = await proxyGet('finnhub', `search?q=${encodeURIComponent(q)}`);
    (d.result || []).slice(0, 4).forEach(s => {
      const init = s.symbol.substring(0,2);
      html += `<div class="search-item" onclick="openStockDetail('${s.symbol}','${(s.description||s.symbol).replace(/'/g,"\\'")}');document.getElementById('searchResults').classList.add('hidden');document.getElementById('searchInput').value=''">
        <div class="search-item-fallback">${init}</div>
        <div>
          <div class="search-item-name">${s.description || s.symbol}</div>
          <div class="search-item-sym">${s.symbol} · ${s.type || 'Hisse'}</div>
        </div>
      </div>`;
    });
  } catch(e) {}

  results.innerHTML = html || '<div class="no-result">Sonuç bulunamadı</div>';
  results.classList.remove('hidden');
}

// ── CRYPTO LIST ──────────────────────────────────────────
async function loadCryptoList(page = 1) {
  try {
    const data = await proxyGet('coingecko',
      `coins/markets?vs_currency=usd&order=market_cap_desc&per_page=50&page=${page}&price_change_percentage=1h,24h,7d`
    );
    if (!Array.isArray(data)) throw new Error('bad data');

    if (page === 1) {
      allCoins = data;
      renderMovers(data.slice(0, 6));
      renderCoinList(data, true);
      loadGlobalStats();
    } else {
      allCoins = [...allCoins, ...data];
      renderCoinList(data, false);
    }
    coinPage = page;
  } catch(e) {
    document.getElementById('coinList').innerHTML =
      '<div style="padding:24px;text-align:center;color:var(--text3);font-size:.84rem">Veri yüklenemedi. Lütfen sayfayı yenileyin.</div>';
  }
}

function renderMovers(coins) {
  document.getElementById('moversRow').innerHTML = coins.map(c => {
    const chg = c.price_change_percentage_24h || 0;
    return `<div class="mover-card" onclick="openCryptoDetail('${c.id}')">
      <div class="mover-sym">${c.symbol.toUpperCase()}</div>
      <div class="mover-price">${formatPrice(c.current_price)}</div>
      <div class="mover-chg ${chg>=0?'pos':'neg'}">${chg>=0?'▲':'▼'} ${Math.abs(chg).toFixed(2)}%</div>
    </div>`;
  }).join('');
}

function renderCoinList(coins, replace) {
  const list   = document.getElementById('coinList');
  const offset = replace ? 0 : allCoins.length - coins.length;
  const html = coins.map((c,i) => {
    const chg  = c.price_change_percentage_24h || 0;
    const logo = c.image
      ? `<img class="asset-logo" src="${c.image}" alt="" onerror="this.outerHTML='<div class=\\'asset-logo-fb\\'>${c.symbol.substring(0,2).toUpperCase()}</div>'">`
      : `<div class="asset-logo-fb">${c.symbol.substring(0,2).toUpperCase()}</div>`;
    return `<div class="asset-row crypto-row" onclick="openCryptoDetail('${c.id}')">
      <span class="asset-rank">${offset+i+1}</span>
      <div class="asset-info">${logo}<div><div class="asset-name">${c.name}</div><div class="asset-sym">${c.symbol.toUpperCase()}</div></div></div>
      <div class="asset-price">${formatPrice(c.current_price)}</div>
      <div class="asset-chg ${chg>=0?'pos-bg':'neg-bg'}">${chg>=0?'+':''}${chg.toFixed(2)}%</div>
      <div class="asset-mcap hide-sm">${formatBig(c.market_cap)}</div>
    </div>`;
  }).join('');
  if (replace) list.innerHTML = html; else list.innerHTML += html;
}

async function loadGlobalStats() {
  try {
    const d   = await proxyGet('coingecko', 'global');
    const mc  = d.data.total_market_cap.usd;
    const chg = d.data.market_cap_change_percentage_24h_usd;
    document.getElementById('totalMarketCap').textContent =
      `$${formatBig(mc)}  ${chg>=0?'▲':'▼'}${Math.abs(chg).toFixed(1)}%`;
  } catch(e) {}
}

function loadMoreCoins() { loadCryptoList(coinPage + 1); }

// ── STOCK LIST ───────────────────────────────────────────
const US_STOCKS   = ['AAPL','MSFT','GOOGL','AMZN','NVDA','TSLA','META','JPM','V','NFLX'];
const BIST_STOCKS = ['THYAO.IS','ASELS.IS','BIMAS.IS','EKGYO.IS','EREGL.IS','GARAN.IS','KCHOL.IS','SISE.IS','AKBNK.IS','YKBNK.IS'];

async function loadStockList(exchange) {
  currentExchange = exchange;
  const stocks = exchange === 'US' ? US_STOCKS : BIST_STOCKS;

  document.getElementById('stockList').innerHTML = stocks.map(s =>
    `<div class="asset-row stock-row skeleton" id="sr_${s.replace(/\./g,'_')}">
      <span style="height:14px;display:block"></span><span></span><span></span><span></span>
    </div>`
  ).join('');

  document.getElementById('popularStocks').innerHTML = stocks.map(s =>
    `<div class="pop-chip" onclick="openStockDetail('${s}','')">${s.replace('.IS','')}</div>`
  ).join('');

  // Fetch quotes in parallel
  await Promise.all(stocks.map(sym => fetchAndRenderStock(sym)));
}

async function fetchAndRenderStock(sym) {
  try {
    const d  = await proxyGet('finnhub', `quote?symbol=${sym}`);
    const el = document.getElementById(`sr_${sym.replace(/\./g,'_')}`);
    if (!el || !d.c || d.c === 0) return;

    const pct      = ((d.c - d.pc) / d.pc * 100);
    const name     = sym.replace('.IS','');
    const currency = sym.endsWith('.IS') ? '₺' : '$';

    el.classList.remove('skeleton');
    el.innerHTML = `
      <span class="asset-sym" style="font-weight:800;font-size:.8rem">${name}</span>
      <div class="asset-info"><div><div class="asset-name">${name}</div></div></div>
      <div class="asset-price">${currency}${d.c.toFixed(2)}</div>
      <div class="asset-chg ${pct>=0?'pos-bg':'neg-bg'}">${pct>=0?'+':''}${pct.toFixed(2)}%</div>`;
    el.onclick = () => openStockDetail(sym, name);
  } catch(e) {}
}

function switchExchange(ex, btn) {
  document.querySelectorAll('.ex-tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('stockList').innerHTML = '';
  loadStockList(ex);
}

// ── DETAIL MODAL ─────────────────────────────────────────
async function openCryptoDetail(coinId) {
  const coin = allCoins.find(c => c.id === coinId);
  if (!coin) return;

  currentAsset = { type: 'crypto', id: coinId, data: coin };

  document.getElementById('modalLogo').src    = coin.image || '';
  document.getElementById('modalLogo').style.display = coin.image ? 'block' : 'none';
  document.getElementById('modalName').textContent   = coin.name;
  document.getElementById('modalSymbol').textContent = coin.symbol.toUpperCase();
  document.getElementById('modalPrice').textContent  = formatPrice(coin.current_price);

  const chg = coin.price_change_percentage_24h || 0;
  setChange('modalChange', chg, '24s');

  renderCryptoStats(coin);
  resetAISection();
  openModal();
  setActiveTimeBtn('1d');

  // Modal animasyonunun bitmesini bekle
  await new Promise(r => setTimeout(r, 350));
  await loadCryptoChart(coinId, '1d');
}

async function openStockDetail(symbol, name) {
  currentAsset = { type: 'stock', id: symbol, name: name || symbol };

  document.getElementById('modalLogo').style.display  = 'none';
  document.getElementById('modalName').textContent    = name || symbol;
  document.getElementById('modalSymbol').textContent  = symbol;
  document.getElementById('modalPrice').textContent   = '...';
  document.getElementById('modalChange').textContent  = '...';
  document.getElementById('statsGrid').innerHTML      = '';

  resetAISection();
  openModal();
  setActiveTimeBtn('1d');

  // Modal animasyonunun bitmesini bekle
  await new Promise(r => setTimeout(r, 350));
  await Promise.all([
    fetchStockDetail(symbol),
    loadStockChart(symbol, '1d')
  ]);
}

async function fetchStockDetail(symbol) {
  try {
    const [q, p] = await Promise.all([
      proxyGet('finnhub', `quote?symbol=${symbol}`),
      proxyGet('finnhub', `stock/profile2?symbol=${symbol}`)
    ]);

    if (!q.c || q.c === 0) return;

    const currency = symbol.endsWith('.IS') ? '₺' : '$';
    document.getElementById('modalPrice').textContent = `${currency}${q.c.toFixed(2)}`;

    const chg = ((q.c - q.pc) / q.pc * 100);
    setChange('modalChange', chg, 'günlük');

    if (p.logo) {
      const img = document.getElementById('modalLogo');
      img.src = p.logo;
      img.style.display = 'block';
    }
    if (p.name) document.getElementById('modalName').textContent = p.name;

    renderStockStats(q, p, symbol);
  } catch(e) {}
}

function openModal() {
  const modal = document.getElementById('detailModal');
  modal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeModalOutside(e) {
  if (e.target === document.getElementById('detailModal')) closeModal();
}

function closeModal() {
  document.getElementById('detailModal').classList.add('hidden');
  document.body.style.overflow = '';
  destroyChart();
}

function setChange(id, pct, label) {
  const el = document.getElementById(id);
  el.textContent  = `${pct>=0?'+':''}${pct.toFixed(2)}% (${label})`;
  el.className    = `modal-change ${pct>=0?'pos':'neg'}`;
}

function resetAISection() {
  document.getElementById('aiResult').classList.add('hidden');
  const btn = document.getElementById('aiAnalyzeBtn');
  btn.disabled = false;
  btn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a4 4 0 0 1 4 4v1h1a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3v-8a3 3 0 0 1 3-3h1V6a4 4 0 0 1 4-4z"/><circle cx="9" cy="13" r="1"/><circle cx="15" cy="13" r="1"/></svg>AI ile Analiz Et`;
}

// ── STATS ────────────────────────────────────────────────
function renderCryptoStats(c) {
  const items = [
    ['Piyasa Değeri',       '$'+formatBig(c.market_cap)],
    ['24s Hacim',           '$'+formatBig(c.total_volume)],
    ['24s En Yüksek',       formatPrice(c.high_24h)],
    ['24s En Düşük',        formatPrice(c.low_24h)],
    ['Dolaşım Arzı',        formatBig(c.circulating_supply)+' '+c.symbol.toUpperCase()],
    ['ATH',                 formatPrice(c.ath)],
    ["ATH'dan Fark",        (c.ath_change_percentage||0).toFixed(1)+'%'],
    ['Sıralama',            '#'+(c.market_cap_rank||'—')],
  ];
  document.getElementById('statsGrid').innerHTML = items.map(([l,v]) =>
    `<div class="stat-card"><div class="stat-label">${l}</div><div class="stat-value">${v}</div></div>`
  ).join('');
}

function renderStockStats(q, p, sym) {
  const cur = sym.endsWith('.IS') ? '₺' : '$';
  const items = [
    ['Önceki Kapanış',  cur+(q.pc||0).toFixed(2)],
    ['Günlük Açılış',   cur+(q.o||0).toFixed(2)],
    ['Günlük En Y.',    cur+(q.h||0).toFixed(2)],
    ['Günlük En D.',    cur+(q.l||0).toFixed(2)],
    ['Sektör',          p.finnhubIndustry||'—'],
    ['Ülke',            p.country||'—'],
    ['Borsa',           p.exchange||'—'],
    ['Para Birimi',     p.currency||'—'],
  ];
  document.getElementById('statsGrid').innerHTML = items.map(([l,v]) =>
    `<div class="stat-card"><div class="stat-label">${l}</div><div class="stat-value">${v}</div></div>`
  ).join('');
}

// ── TIME RANGE ───────────────────────────────────────────
function setActiveTimeBtn(range) {
  document.querySelectorAll('.time-btn').forEach(b => {
    b.classList.toggle('active', b.getAttribute('onclick').includes(`'${range}'`));
  });
}

function changeTimeRange(range, btn) {
  document.querySelectorAll('.time-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  if (!currentAsset) return;
  if (currentAsset.type === 'crypto') loadCryptoChart(currentAsset.id, range);
  else loadStockChart(currentAsset.id, range);
}

// ── CHARTS ───────────────────────────────────────────────
function destroyChart() {
  if (tvChart) { try { tvChart.remove(); } catch(e){} tvChart = null; tvSeries = null; }
}

function initChart() {
  destroyChart();
  const container = document.getElementById('tvChart');
  const isDark    = document.documentElement.getAttribute('data-theme') !== 'light';

  // Container'a explicit boyut ver
  const wrap   = container.parentElement;
  const width  = wrap.offsetWidth  || window.innerWidth  - 32 || 340;
  const height = 240;

  container.style.width  = width  + 'px';
  container.style.height = height + 'px';

  tvChart = LightweightCharts.createChart(container, {
    width,
    height,
    layout: {
      background: { type: 'solid', color: 'transparent' },
      textColor: isDark ? '#7a8fa8' : '#4a6080',
    },
    grid: {
      vertLines: { color: isDark ? '#1c2a3a' : '#dde4ee' },
      horzLines: { color: isDark ? '#1c2a3a' : '#dde4ee' },
    },
    crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
    rightPriceScale: { borderColor: isDark ? '#1c2a3a' : '#dde4ee' },
    timeScale: {
      borderColor: isDark ? '#1c2a3a' : '#dde4ee',
      timeVisible: true,
      secondsVisible: false,
    },
    handleScroll: true,
    handleScale: true,
  });

  window.addEventListener('resize', () => {
    if (tvChart) {
      const w = wrap.offsetWidth || window.innerWidth - 32;
      container.style.width = w + 'px';
      tvChart.applyOptions({ width: w });
    }
  });
}

async function loadCryptoChart(coinId, range) {
  showChartState('loading');

  const daysMap = { '1h':1, '1d':1, '7d':7, '30d':30, '365d':365 };
  const days = daysMap[range] || 1;

  try {
    // OHLC endpoint — free tier'da çalışır, market_chart değil
    const d = await proxyGet('coingecko', `coins/${coinId}/ohlc?vs_currency=usd&days=${days}`);

    if (!Array.isArray(d) || !d.length) throw new Error('no data');

    const seen = new Set();
    const chartData = [];
    for (const [ms, o, h, l, c] of d) {
      const t = Math.floor(ms / 1000);
      if (!seen.has(t)) { seen.add(t); chartData.push({ time: t, open: o, high: h, low: l, close: c }); }
    }
    chartData.sort((a, b) => a.time - b.time);

    showChartState('ready');
    await new Promise(r => setTimeout(r, 60));
    initChart();
    tvSeries = tvChart.addCandlestickSeries({
      upColor: '#00e676', downColor: '#ff3d57',
      borderUpColor: '#00e676', borderDownColor: '#ff3d57',
      wickUpColor: '#00e676', wickDownColor: '#ff3d57',
    });
    tvSeries.setData(chartData);
    tvChart.timeScale().fitContent();

  } catch(e) {
    showChartState('error');
  }
}

async function loadStockChart(symbol, range) {
  showChartState('loading');

  const intervalMap = { '1h':'5m', '1d':'30m', '7d':'1d', '30d':'1d', '365d':'1wk' };
  const rangeMap    = { '1h':'1d', '1d':'5d',  '7d':'1mo','30d':'3mo','365d':'1y'  };
  const interval    = intervalMap[range] || '30m';
  const yahooRange  = rangeMap[range]    || '5d';

  try {
    const d = await proxyGet('yahoo',
      `${encodeURIComponent(symbol)}?interval=${interval}&range=${yahooRange}`
    );

    if (!d?.chart?.result?.[0]) throw new Error('no data');

    const result     = d.chart.result[0];
    const timestamps = result.timestamp;
    const ohlc       = result.indicators.quote[0];

    if (!timestamps?.length) throw new Error('empty');

    const seen = new Set();
    const chartData = [];
    for (let i = 0; i < timestamps.length; i++) {
      const t = timestamps[i];
      if (!t || seen.has(t) || ohlc.open[i] == null) continue;
      seen.add(t);
      chartData.push({ time: t, open: ohlc.open[i], high: ohlc.high[i], low: ohlc.low[i], close: ohlc.close[i] });
    }
    chartData.sort((a, b) => a.time - b.time);

    showChartState('ready');
    await new Promise(r => setTimeout(r, 60));
    initChart();
    tvSeries = tvChart.addCandlestickSeries({
      upColor: '#00e676', downColor: '#ff3d57',
      borderUpColor: '#00e676', borderDownColor: '#ff3d57',
      wickUpColor: '#00e676', wickDownColor: '#ff3d57',
    });
    tvSeries.setData(chartData);
    tvChart.timeScale().fitContent();

  } catch(e) {
    showChartState('error');
  }
}

function showChartState(state) {
  document.getElementById('chartLoading').classList.toggle('hidden', state !== 'loading');
  document.getElementById('chartError').classList.toggle('hidden',   state !== 'error');
}

// ── AI ANALYSIS ───────────────────────────────────────────
async function analyzeWithAI() {
  if (!currentAsset) return;

  const btn    = document.getElementById('aiAnalyzeBtn');
  const result = document.getElementById('aiResult');
  const text   = document.getElementById('aiResultText');

  btn.disabled = true;
  btn.innerHTML = `<div class="spinner" style="width:15px;height:15px;border-width:2px;margin-right:6px"></div>Analiz ediliyor...`;
  result.classList.remove('hidden');
  text.innerHTML = '<div class="typing"><span></span><span></span><span></span></div>';

  try {
    let prompt;

    if (currentAsset.type === 'crypto') {
      const c   = currentAsset.data;
      const chg24 = (c.price_change_percentage_24h || 0);
      const chg7  = (c.price_change_percentage_7d_in_currency || 0);
      const vol_mc_ratio = c.market_cap > 0 ? ((c.total_volume / c.market_cap) * 100).toFixed(1) : '—';
      const ath_dist = (c.ath_change_percentage || 0);

      prompt = `Sen bir kripto para teknik analisti olarak aşağıdaki verileri analiz et. Yanıtın TAM OLARAK Türkçe olsun, kısa ve net paragraflar halinde yaz. Başlıklar kullanma.

=== ${c.name} (${c.symbol.toUpperCase()}) ANALİZ VERİLERİ ===
Güncel Fiyat: $${c.current_price}
24 Saat Değişim: ${chg24>=0?'+':''}${chg24.toFixed(2)}%
7 Gün Değişim: ${chg7>=0?'+':''}${chg7.toFixed(2)}%
Piyasa Değeri: $${formatBig(c.market_cap)} (#${c.market_cap_rank})
24s İşlem Hacmi: $${formatBig(c.total_volume)}
Hacim/Piyasa Değeri Oranı: %${vol_mc_ratio}
24s Yüksek/Düşük: $${c.high_24h} / $${c.low_24h}
ATH (Tüm Zamanlar En Yüksek): $${c.ath}
ATH'a Uzaklık: ${ath_dist.toFixed(1)}%

Şunları analiz et:
1. Mevcut kısa vadeli trend (24s ve 7 günlük harekete göre)
2. Hacim analizi — yüksek hacim trendin gücünü gösteriyor mu?
3. Fiyat konumu — ATH'a göre nerede, tarihi bağlam nedir?
4. Risk faktörleri neler?
5. Genel değerlendirme (2-3 cümle)

ÖNEMLİ: Kesinlikle "al" veya "sat" tavsiyesi verme. Sadece teknik analiz yap.`;

    } else {
      prompt = `Sen bir hisse senedi teknik analisti olarak aşağıdaki hisse hakkında analiz yap. Yanıtın TAM OLARAK Türkçe olsun. Kısa ve net paragraflar halinde yaz, başlıklar kullanma.

Hisse: ${currentAsset.id}
Şirket: ${currentAsset.name}
Borsa: ${currentAsset.id.endsWith('.IS') ? 'Borsa İstanbul (BIST)' : 'ABD Borsası (NYSE/NASDAQ)'}

Bu hisse hakkında kısa bir analiz yap:
1. Şirket ve sektör hakkında genel bilgi
2. Teknik açıdan önemli seviyeler
3. Makroekonomik faktörler ve sektörel durum
4. Genel değerlendirme

ÖNEMLİ: Kesinlikle "al" veya "sat" tavsiyesi verme. Sadece teknik ve temel analiz yap.`;
    }

    const reply = await callAI(prompt);
    text.textContent = reply;

  } catch(e) {
    text.textContent = 'Analiz şu anda yapılamadı. Lütfen birkaç saniye bekleyip tekrar deneyin.';
  }

  btn.disabled = false;
  btn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a4 4 0 0 1 4 4v1h1a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3v-8a3 3 0 0 1 3-3h1V6a4 4 0 0 1 4-4z"/><circle cx="9" cy="13" r="1"/><circle cx="15" cy="13" r="1"/></svg>Tekrar Analiz Et`;
}

// ── AI CHAT ───────────────────────────────────────────────
async function sendAIChat() {
  const input = document.getElementById('aiChatInput');
  const msg   = input.value.trim();
  if (!msg) return;

  addMsg(msg, 'user');
  input.value = '';
  const typing = addTyping();

  const context = currentAsset
    ? `Kullanıcı şu anda ${currentAsset.type === 'crypto' ? 'kripto' : 'hisse'} olarak ${currentAsset.id} varlığını inceliyor.`
    : '';

  const prompt = `Sen TradeVision'ın AI asistanısın. Kripto ve hisse piyasaları uzmanısın. Yanıtların her zaman Türkçe olmalı. Kısa, net ve bilgilendirici cevaplar ver. Kesinlikle alım-satım tavsiyesi verme.

${context}

Kullanıcı sorusu: ${msg}`;

  try {
    const reply = await callAI(prompt);
    typing.remove();
    addMsg(reply, 'bot');
  } catch(e) {
    typing.remove();
    addMsg('Şu an yanıt veremiyorum, lütfen tekrar deneyin.', 'bot');
  }
}

function addMsg(text, role) {
  const msgs = document.getElementById('aiMessages');
  const div  = document.createElement('div');
  div.className = `ai-msg ${role}`;
  div.innerHTML = `<div class="ai-msg-text">${text}</div>`;
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
  return div;
}

function addTyping() {
  const msgs = document.getElementById('aiMessages');
  const div  = document.createElement('div');
  div.className = 'ai-msg bot';
  div.innerHTML = `<div class="ai-msg-text"><div class="typing"><span></span><span></span><span></span></div></div>`;
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
  return div;
}

// ── AI CALL ──────────────────────────────────────────────
async function callAI(prompt) {
  // Try Groq first
  try {
    const d = await proxyPost('groq', {
      model: 'llama-3.3-70b-versatile',
      messages: [
        {
          role: 'system',
          content: 'Sen TradeVision platformunun finansal analiz asistanısın. Her zaman Türkçe yanıt verirsin. Alım-satım tavsiyesi vermezsin.'
        },
        { role: 'user', content: prompt }
      ],
      max_tokens: 700,
      temperature: 0.6
    });
    if (d.choices?.[0]?.message?.content) {
      return d.choices[0].message.content.trim();
    }
  } catch(e) {}

  // Fallback: Gemini
  try {
    const d = await proxyPost('gemini', {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 700, temperature: 0.6 }
    });
    if (d.candidates?.[0]?.content?.parts?.[0]?.text) {
      return d.candidates[0].content.parts[0].text.trim();
    }
  } catch(e) {}

  throw new Error('AI yanıt vermedi');
}

// ── FORMAT HELPERS ────────────────────────────────────────
function formatPrice(n) {
  if (!n && n !== 0) return '—';
  if (n >= 10000) return '$' + n.toLocaleString('en-US', {maximumFractionDigits:0});
  if (n >= 1)     return '$' + n.toFixed(2);
  if (n >= 0.01)  return '$' + n.toFixed(4);
  return '$' + n.toFixed(8);
}

function formatBig(n) {
  if (!n) return '0';
  if (n >= 1e12) return (n/1e12).toFixed(2)+'T';
  if (n >= 1e9)  return (n/1e9).toFixed(2)+'B';
  if (n >= 1e6)  return (n/1e6).toFixed(2)+'M';
  if (n >= 1e3)  return (n/1e3).toFixed(1)+'K';
  return n.toFixed(0);
}
