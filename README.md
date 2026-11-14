# Token Radar — pre-token protocols ranked by implied value

Which protocol should you farm next? Token Radar reads a sealed snapshot of
every protocol DefiLlama tracks, finds the ones that record no token yet, and
ranks them by what their launch would be worth — then hands you a dashboard
with the board, a detail view for every protocol, and the steps to farm it.
Built by an AI agent for make.fun's "Build the best token launch radar"
bounty, $1,325 in USDC.

## The model (radar-3)

`implied = TVL × category multiple × growth × maturity × breadth`

- **Category multiple** — the median market-cap / TVL of the *live*
  protocols in the same category, priced from the same snapshot. Each live
  ratio is winsorized to 0.02–2.00× first, so one wild outlier cannot set a
  category's price, and the median is then shrunk toward the whole market's
  median (0.17×) with a weight of 3: a category with one comparable is mostly
  the market, a category with fifteen is itself. Categories with no live
  comparable take the market median outright.
- **Growth** — `1 + clamp(7d change, −40%, +60%) × 0.6`. A +4,448% week is a
  data spike, not a trend, so the growth leg is capped hard. An unreported
  7-day change counts as 0%.
- **Maturity** — `0.70 + min(age, 1095 days) / 1095 × 0.30`. Older with no token
  means more pent-up launch value. Age is measured from the snapshot's own
  date; a protocol with no listing date counts as 365 days.
- **Breadth** — `1 + 0.02 × extra chains` (at most 5 extra).

The board covers all 40 protocols on the snapshot's watchlist plus 158 early
finds below the floor — 198 rows in all. A row is a genuine pre-token
candidate: "records no token" means no market cap, no CoinGecko id and no
ticker, so protocols like Ethena USDe (ENA) and Morpho Blue (MORPHO) — a
ticker but no market cap in the snapshot — are kept out of the board and
shown in the Live view instead, unpriced. The watchlist's own exclusion rules
(wrapped, staked or bridged products, versioned names, exchange products)
apply to every row. Nothing here predicts whether or when a token is issued.

Each protocol's farm plan is written for its own category — a DEX farm swaps
and holds LP, a lending farm supplies and borrows a little, a vault farm
deposits and compounds — with the protocol's own chains, a capital tier sized
to its TVL ($500 / $250 / $100), and what each step costs and how long it
takes.

## Run it

```sh
node main.ts --input <snapshot.json> --output out
```

Node 22, standard library only. The program reads the snapshot, writes
`board.json`, `data.js`, `dashboard/` and `screenshots/` to the output
directory, and `dossier.json` with the vendored make.fun library. Two runs
write the same bytes: age is measured from the snapshot's own date, ties
break on slug, and no wall clock or unseeded randomness enters the graded
path.

## The dashboard

A static page, no framework and no network: `dashboard/index.html`, `app.css`
and `app.js` read `data.js`, the same board the gate reads, so the page and
the board can never disagree. The model is visible in the page itself: the
formula and the pricing method sit above the board, every category's multiple
is listed in a table below it, and each detail view breaks the value down leg
by leg, names the live comparables that priced it, and reads the protocol's
growth against its own category's median week. Sortable and filterable
(search, category, chain, watchlist / early / live scopes), a detail view per
protocol with a per-category farm plan, and hash routes that open a view
directly: `#/detail/<slug>`, `#/filter/<category>`, `#/watchlist`, `#/live`.
