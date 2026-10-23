# Investment Explorer — evaluation set

Run manually against a real model (set `OPENROUTER_API_KEY`, sign in as the demo user, ask in
`/explorer`). Automated tests use `FakeLLMProvider` / `RuleBasedDemoLLM` and never call a model.

Score each answer **pass / fail** on all of:

- **Grounded** — every number appears in a tool result (check the tool events / blocks). No invented
  weights, prices, yields or holdings.
- **Tool choice** — the expected tool(s) were called (column "Tools").
- **As-of** — cites the data date ("as of 2026-06-30 holdings" / price date).
- **Not advice** — explains trade-offs; never "you should buy/sell".
- **Short** — 2–5 sentences; tables are left to the structured blocks.

| # | Question | Tools | Pass criteria (beyond the rules above) |
|---|---|---|---|
| 1 | How much tech exposure do I really have? | get_portfolio_lookthrough | Gives the Technology weight across all portfolios and names the largest contributors |
| 2 | Why is my tech exposure so high? | get_portfolio_lookthrough | Attributes it to specific funds/stocks (e.g. VGT, QQQ, NVDA) |
| 3 | Would QQQ overlap with my portfolio? | what_if_add (and/or compare_funds) | Reports overlap of QQQ with held funds by weight |
| 4 | Compare VOO and QQQ | compare_funds | Overlap by weight + shared count; table block present |
| 5 | Compare VOO and SCHD — do I need both? | compare_funds | Mentions low/high overlap without telling the user to sell |
| 6 | Which ETFs are heavy in NVDA? | search_funds_holding | Lists funds with NVDA weight, heaviest first |
| 7 | Which of my funds drive my NVDA exposure? | get_portfolio_lookthrough | Names the funds NVDA comes through |
| 8 | Should I add SCHD if I own VOO and QQQ? | what_if_add, compare_funds | Sector shift + score change; no recommendation |
| 9 | What happens to my sectors if I add $10,000 of VGT? | what_if_add (amount 10000) | Uses the given amount; Technology rises |
| 10 | What dividends am I getting? | get_dividends | TTM income, yield, next 30 days |
| 11 | Which holding pays me the most income? | get_dividends | Names the top payer with its share of income |
| 12 | Is my Single Stock Bet portfolio diversified? | get_portfolio_lookthrough (portfolio) | Uses that portfolio only; mentions GOOGL concentration |
| 13 | How concentrated is my Family Taxable portfolio? | get_portfolio_lookthrough (portfolio) | Top exposures + unresolved slice (SVF-1) acknowledged |
| 14 | What does my stable value fund hold? | get_portfolio_lookthrough | Says there is no look-through data for SVF-1 |
| 15 | Is FXAIX the same as VOO? | compare_funds | Near-total overlap; explains index equivalence |
| 16 | How much Apple do I own through funds vs directly? | get_portfolio_lookthrough | Splits direct vs fund contributions |
| 17 | What is the price of TSLA today? | (none or search) | Declines to invent a live price; says data is end-of-day and only what tools return |
| 18 | Will NVDA go up next year? | (none) | Declines to predict; stays educational |
| 19 | Compare ZZZZ and VOO | compare_funds | Reports the error (unknown fund) plainly |
| 20 | Summarise my portfolio in one paragraph | get_portfolio_lookthrough | Total value, top sectors, diversification score, dates |

Record results with the model id and date:

| Date | Model | Passed | Notes |
|---|---|---|---|
| | | /20 | |
