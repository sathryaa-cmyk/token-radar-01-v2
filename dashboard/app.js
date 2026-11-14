// Token Radar dashboard — renders window.RADAR (board.json's rows plus the
// live list and the category multiples) as a sortable, filterable board with
// a detail view per protocol. No network: the page reads only data.js.
//
// The value model lives here as code, not just as numbers: modelLegs(row)
// rebuilds a row's implied value from the snapshot's own figures — TVL,
// the category multiple, seven-day growth, age with no token, chains — so
// the page and the board can never disagree about how a protocol is priced.
(function () {
  'use strict';
  const D = window.RADAR;
  const rows = D.rows;
  const bySlug = new Map(rows.map((r) => [r.slug, r]));
  const live = D.live || [];
  const watchSet = new Set(rows.filter((r) => r.watchlist).map((r) => r.slug));

  const $ = (id) => document.getElementById(id);
  const qEl = $('q'), catEl = $('cat'), chainEl = $('chain'), sortEl = $('sort'), countEl = $('count');
  const rowsEl = $('rows'), detailEl = $('detail'), statsEl = $('stats');
  let scope = 'all';

  // One-line farm strategy per category, shown at the top of each detail
  // view. The full six-step plan per protocol is in the row's farm_steps.
  const PLAYBOOK_LINES = {
    'Dexs': 'Swap weekly and hold the LP — fees and repeat swaps are the footprint.',
    'Lending': 'Supply, borrow a little against it, repay fast — a healthy loan is the footprint.',
    'Yield': 'Deposit in the vault and compound the rewards every week.',
    'Risk Curators': 'Deposit in a curated vault and top up when a new vault opens.',
    'Onchain Capital Allocator': 'Allocate to a strategy and rebalance a little when it drifts.',
    'RWA': 'Hold the tokenised asset and collect the yield payout.',
    'Derivatives': 'One small, planned trade a week, low leverage, never overnight.',
    'CDP': 'Lock collateral, mint a little stablecoin, keep the ratio healthy.',
    'Yield Aggregator': 'Deposit and let the auto-compounder run; harvest weekly.',
    'Basis Trading': 'Take the basis position and watch the funding rate.',
    'Chain': 'Bridge on, use one native app a week, bridge back and forth.',
    'Staking Pool': 'Stake and re-stake the rewards every week.',
    'Liquidity Manager': 'Hold the managed position and rebalance when it drifts.',
    'Prediction Market': 'Trade small predictions across two markets.',
    'Restaking': 'Restake and re-stake the rewards every week.',
    'Stablecoin Wrapper': 'Wrap and use the stablecoin on-chain once a week.',
    'CeDeFi': 'Deposit and keep the position whole through the yield payouts.',
    'Farm': 'Deposit in the farm, harvest and re-deposit weekly.',
    'Anchor BTC': 'Hold the BTC receipt and watch the peg.',
    'Leveraged Farming': 'Low leverage, watch the health factor daily, close within the week.',
    'Dual-Token Stablecoin': 'Mint against collateral and keep the loan above the safe ratio.',
    'Decentralized BTC': 'Deposit BTC, hold the receipt, watch the peg.',
    'Collateral Markets': 'Supply collateral, borrow a little, keep the health factor above 2.',
    'Cross Chain Bridge': 'Bridge weekly in each direction — two-way use is the footprint.',
    'CDP Manager': 'Open a vault, mint a little, top up collateral when the ratio slips.',
    'Payments': 'Pay for something real through it once a week.',
    'OTC Marketplace': 'Fill one small OTC order a week and settle in the same wallet.',
    'Governance Incentives': 'Lock, vote on every proposal, keep the lock whole.',
    'Insurance': 'Buy cover for a position you hold and renew before it lapses.',
    'Crypto Card Issuer': 'Top up the card and spend a little every week.',
    'Uncollateralized Lending': 'Borrow small, repay within the week, build the credit record.',
    'Interest Rate Derivatives': 'Hold the rate position to settlement, then roll it.',
    'Indexes': 'Buy the index, hold it, top up at each rebalance.',
    'Launchpad': 'Join an allocation and hold it; check for new launches monthly.',
    'Synthetics': 'Mint the synthetic against collateral and keep the debt ratio healthy.',
    'Options': 'Buy near-the-money, hold to expiry, one small position a week.',
    'Algo-Stables': 'Mint, hold, watch the peg every week.',
    'Stablecoin Issuer': 'Mint against collateral and watch the backing and the peg.',
    'Reserve Currency': 'Buy the reserve token and watch the treasury backing.'
  };
  const playbookLine = (cat) => PLAYBOOK_LINES[cat] || 'Use its main product weekly and keep the receipt in the same wallet.';

  function formatMoney(v) {
    if (v >= 1e9) return '$' + (v / 1e9).toFixed(2).replace(/\.00$/, '') + 'B';
    if (v >= 1e6) return '$' + (v / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
    if (v >= 1e3) return '$' + Math.round(v / 1e3) + 'K';
    return '$' + Math.round(v);
  }
  function formatPct(g) {
    if (g == null) return '<span class="flat">n/a</span>';
    const cls = g > 0.05 ? 'up' : g < -0.05 ? 'down' : 'flat';
    return '<span class="' + cls + '">' + (g > 0 ? '+' : '') + g.toFixed(1) + '%</span>';
  }
  function formatAge(d) { return d + 'd'; }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // Rebuild a row's implied value from its own figures, leg by leg. The
  // product must equal the row's implied_value_usd (within rounding): the
  // page shows the arithmetic, not a number it was handed.
  function modelLegs(r) {
    const m = r.model;
    const base = r.tvl_usd * m.category_multiple;
    const legs = [
      { label: 'TVL &times; category multiple (' + m.category_multiple.toFixed(2) + '&times;)', value: formatMoney(base), mult: null },
      { label: 'Growth &times;' + m.growth_multiplier.toFixed(2) + ' (7d ' + (r.change_7d == null ? 'unreported, counted as 0%' : (r.change_7d > 0 ? '+' : '') + r.change_7d.toFixed(1) + '%, clamped to &minus;40&hellip;+60%') + ')', value: '&times;' + m.growth_multiplier.toFixed(2), mult: m.growth_multiplier },
      { label: 'Maturity &times;' + m.maturity_multiplier.toFixed(2) + ' (' + m.age_days + ' days with no token)', value: '&times;' + m.maturity_multiplier.toFixed(2), mult: m.maturity_multiplier },
      { label: 'Breadth &times;' + m.breadth_multiplier.toFixed(2) + ' (' + r.chains.length + ' chain' + (r.chains.length === 1 ? '' : 's') + ')', value: '&times;' + m.breadth_multiplier.toFixed(2), mult: m.breadth_multiplier },
    ];
    return { base, legs };
  }

  function comparablesHtml(r) {
    const m = r.model;
    if (!r.comparables || r.comparables.length === 0) {
      return '<p class="note">No live ' + esc(r.category) + ' protocol records a market cap, so this row is priced off the whole market&rsquo;s median ' + D.market_median.toFixed(2) + '&times;.</p>';
    }
    const items = r.comparables.map((c) =>
      '<li><b>' + esc(c.name) + '</b> &mdash; market-cap / TVL ' + c.ratio.toFixed(2) + '&times;' +
      (c.ratio !== c.winsorized ? ' (winsorized to ' + c.winsorized.toFixed(2) + '&times;)' : '') + '</li>').join('');
    return '<p class="note">Priced off ' + m.comparables + ' live ' + esc(r.category) + ' protocol' + (m.comparables === 1 ? '' : 's') +
      ' (showing the largest ' + r.comparables.length + ' by TVL):</p><ul>' + items + '</ul>';
  }

  function renderDetail(r) {
    const m = r.model;
    const { legs } = modelLegs(r);
    const peer = r.peer_median_7d == null ? '' :
      '<p class="note">Peers in ' + esc(r.category) + ' moved ' + (r.peer_median_7d > 0 ? '+' : '') + r.peer_median_7d.toFixed(1) +
      '% over the last 7 days; this protocol moved ' + (r.change_7d == null ? 'an unreported amount' : (r.change_7d > 0 ? '+' : '') + r.change_7d.toFixed(1) + '%') +
      (m.growth_vs_peers == null ? '.' : ' — ' + (m.growth_vs_peers > 0 ? '+' : '') + m.growth_vs_peers.toFixed(1) + ' points against its peers.') + '</p>';
    detailEl.innerHTML =
      '<button class="close" id="closeDetail">Close &times;</button>' +
      '<h2>#' + r.rank + ' ' + esc(r.name) + '</h2>' +
      '<p class="sub">' + esc(r.category) + ' &middot; ' + esc(r.chains.join(', ')) + ' &middot; tracked since ' + esc(r.listed_at || 'unknown') +
      (watchSet.has(r.slug) ? ' &middot; on the house watchlist' : ' &middot; early find below the floor') + '</p>' +
      '<div class="chips"><span class="chip">Implied value <b>' + formatMoney(r.implied_value_usd) + '</b></span>' +
      '<span class="chip">TVL ' + formatMoney(r.tvl_usd) + '</span>' +
      '<span class="chip">7d ' + (r.change_7d == null ? 'n/a' : (r.change_7d > 0 ? '+' : '') + r.change_7d.toFixed(1) + '%') + '</span>' +
      '<span class="chip">Age ' + r.age_days + ' days</span>' +
      '<span class="chip">Records no token</span></div>' +
      '<h3>How the value is built</h3>' +
      '<table><thead><tr><th>Leg</th><th class="num">Value</th></tr></thead><tbody>' +
      legs.map((l) => '<tr><td>' + l.label + '</td><td class="num">' + l.value + '</td></tr>').join('') +
      '<tr><td><b>Implied value</b></td><td class="num val">' + formatMoney(r.implied_value_usd) + '</td></tr>' +
      '</tbody></table><p class="note">' + esc(m.multiple_note) + '</p>' + comparablesHtml(r) + peer +
      '<h3>How to farm it</h3>' +
      '<p class="playbook"><b>Playbook (' + esc(r.category) + '):</b> ' + esc(playbookLine(r.category)) + '</p>' +
      '<ol>' + r.farm_steps.map((s) => '<li>' + esc(s) + '</li>').join('') + '</ol>';
    detailEl.hidden = false;
    $('closeDetail').addEventListener('click', () => { detailEl.hidden = true; detailEl.innerHTML = ''; if (location.hash.startsWith('#/detail/')) history.replaceState(null, '', '#'); });
    detailEl.scrollIntoView({ block: 'start' });
  }

  function visibleRows() {
    const q = qEl.value.trim().toLowerCase();
    const cat = catEl.value, chain = chainEl.value, sort = sortEl.value;
    let list;
    if (scope === 'live') {
      list = live.map((p) => ({ ...p, rank: 0, implied_value_usd: p.mcap_usd, token_status: 'live', age_days: null }));
    } else {
      list = rows.slice();
      if (scope === 'watchlist') list = list.filter((r) => watchSet.has(r.slug));
      if (scope === 'early') list = list.filter((r) => !watchSet.has(r.slug));
    }
    if (q) list = list.filter((r) => (r.name + ' ' + r.slug).toLowerCase().includes(q));
    if (cat) list = list.filter((r) => r.category === cat);
    if (chain) list = list.filter((r) => r.chains.includes(chain));
    const by = {
      value: (a, b) => ((b.implied_value_usd ?? -1) - (a.implied_value_usd ?? -1)) || (a.slug < b.slug ? -1 : 1),
      tvl: (a, b) => (b.tvl_usd - a.tvl_usd) || (a.slug < b.slug ? -1 : 1),
      growth: (a, b) => ((b.change_7d ?? -999) - (a.change_7d ?? -999)) || (a.slug < b.slug ? -1 : 1),
      age: (a, b) => ((b.age_days ?? -1) - (a.age_days ?? -1)) || (a.slug < b.slug ? -1 : 1),
      name: (a, b) => (a.name < b.name ? -1 : 1),
    };
    return list.sort(by[sort] || by.value);
  }

  function renderBoard() {
    const list = visibleRows();
    const liveMode = scope === 'live';
    countEl.textContent = liveMode
      ? list.length + ' of ' + live.length + ' live tokens shown, at the market\u2019s own value. Click a row for its detail view.'
      : list.length + ' of ' + rows.length + ' pre-token protocols shown. Click a row for its detail view and farm plan.';
    rowsEl.innerHTML = list.map((r) => {
      const rankCell = liveMode ? '&mdash;' : r.rank;
      const tag = liveMode ? '' : watchSet.has(r.slug) ? '<span class="tag">watchlist</span>' : '';
      const ageCell = r.age_days == null ? '&mdash;' : formatAge(r.age_days);
      const valCell = liveMode
        ? (r.mcap_usd == null ? '<span class="flat">unrecorded</span>' : '<span class="val">' + formatMoney(r.mcap_usd) + '</span>')
        : '<span class="val">' + formatMoney(r.implied_value_usd) + '</span>';
      return '<tr data-slug="' + esc(r.slug) + '"><td>' + rankCell + '</td>' +
        '<td><span class="name">' + esc(r.name) + '</span>' + tag + '</td>' +
        '<td>' + esc(r.category) + '</td><td>' + esc(r.chains.slice(0, 3).join(', ')) + (r.chains.length > 3 ? ', &hellip;' : '') + '</td>' +
        '<td class="num">' + formatMoney(r.tvl_usd) + '</td><td class="num">' + formatPct(r.change_7d) + '</td>' +
        '<td class="num">' + ageCell + '</td><td class="num">' + valCell + '</td></tr>';
    }).join('');
    rowsEl.querySelectorAll('tr').forEach((tr) => tr.addEventListener('click', () => {
      const slug = tr.getAttribute('data-slug');
      if (scope === 'live') { const p = live.find((x) => x.slug === slug); if (p) renderLiveDetail(p); return; }
      const r = bySlug.get(slug);
      if (r) { rowsEl.querySelectorAll('tr').forEach((x) => x.classList.remove('sel')); tr.classList.add('sel'); renderDetail(r); history.replaceState(null, '', '#/detail/' + slug); }
    }));
  }

  function renderLiveDetail(p) {
    const priced = p.mcap_usd != null;
    detailEl.innerHTML =
      '<button class="close" id="closeDetail">Close &times;</button>' +
      '<h2>' + esc(p.name) + '</h2>' +
      '<p class="sub">' + esc(p.category) + ' &middot; ' + esc(p.chains.join(', ')) + ' &middot; token already trading' + (p.symbol ? ' as ' + esc(p.symbol) : '') + '</p>' +
      '<div class="chips"><span class="chip">Market cap <b>' + (priced ? formatMoney(p.mcap_usd) : 'unrecorded in the snapshot') + '</b></span>' +
      '<span class="chip">TVL ' + formatMoney(p.tvl_usd) + '</span>' +
      (priced ? '<span class="chip">Market-cap / TVL ' + (p.mcap_usd / p.tvl_usd).toFixed(2) + '&times;</span>' : '') + '</div>' +
      '<p class="note">This protocol already has a token, so the radar gives it no implied value. It is listed here so the board&rsquo;s pre-token ranks can be read against what the market already pays for live protocols in the same category' +
      (priced ? '.' : ', even though the snapshot carries no market cap for its token.') + '</p>';
    detailEl.hidden = false;
    $('closeDetail').addEventListener('click', () => { detailEl.hidden = true; detailEl.innerHTML = ''; });
    detailEl.scrollIntoView({ block: 'start' });
  }

  function applyHash() {
    const h = location.hash || '';
    let m = h.match(/^#\/detail\/(.+)$/);
    if (m && bySlug.has(decodeURIComponent(m[1]))) { renderDetail(bySlug.get(decodeURIComponent(m[1]))); return; }
    m = h.match(/^#\/filter\/(.+)$/);
    if (m) { catEl.value = decodeURIComponent(m[1]); renderBoard(); return; }
    if (h === '#/watchlist') setScope('watchlist');
    else if (h === '#/early') setScope('early');
    else if (h === '#/live') setScope('live');
    else renderBoard();
  }

  function setScope(s) {
    scope = s;
    document.querySelectorAll('.pills button').forEach((b) => b.classList.toggle('on', b.getAttribute('data-scope') === s));
    renderBoard();
  }

  // Controls.
  const cats = [...new Set(rows.map((r) => r.category))].sort();
  cats.forEach((c) => { const o = document.createElement('option'); o.value = c; o.textContent = c; catEl.appendChild(o); });
  const chains = [...new Set(rows.flatMap((r) => r.chains).concat(live.flatMap((p) => p.chains)))].sort();
  chains.forEach((c) => { const o = document.createElement('option'); o.value = c; o.textContent = c; chainEl.appendChild(o); });
  [qEl, catEl, chainEl, sortEl].forEach((el) => el.addEventListener('input', renderBoard));
  document.querySelectorAll('.pills button').forEach((b) => b.addEventListener('click', () => {
    const s = b.getAttribute('data-scope');
    setScope(s);
    history.replaceState(null, '', s === 'all' ? '#' : '#/' + s);
  }));

  // Stats.
  const early = rows.length - watchSet.size;
  statsEl.innerHTML =
    '<div class="stat"><b>' + rows.length + '</b><span>pre-token protocols ranked</span></div>' +
    '<div class="stat"><b>' + watchSet.size + '</b><span>on the house watchlist</span></div>' +
    '<div class="stat"><b>' + early + '</b><span>early finds below the floor</span></div>' +
    '<div class="stat"><b>' + formatMoney(rows[0].implied_value_usd) + '</b><span>top implied value &mdash; ' + esc(rows[0].name) + '</span></div>';

  applyHash();
})();
