# Swiss tax helper (Vaud & Zurich)

Private web app that guides a household through the **2025 tax return in Vaud (VaudTax) or Zurich (ZHprivateTax)**: it never fills anything in, it tells you exactly which section, code/Ziffer and amount to enter, finds deductions, and estimates the tax.

Self-hosted with Docker, behind Cloudflare Access.

## How it works

| Part | What it does |
|---|---|
| `src/shared/rules2025.ts`, `rulesZh2025.ts` | Every official 2025 figure (deduction caps, tariffs, rental-value tables), each with its source and page. |
| `src/shared/vd.ts`, `zh.ts` | Deterministic canton engines: household data → VaudTax codes / Zurich Ziffern + estimate. No AI. |
| `src/shared/federal.ts`, `household.ts` | Federal tax and rules shared by both cantons; `calc.ts` picks the canton. |
| `src/shared/business.ts` | Self-employed activity: profit from receipts/expenses or accounts, private shares (car 0.9%/month, VD household flat rate), depreciation at the official rates, own AVS estimate (mémento 2.02), split into VD code 180/186/330/465 or ZH Ziffer 2.1/16.1/32. |
| `src/shared/*.test.ts` | Worked examples from the official instructions, Zurich deduction rules, and 48 reference results from the official ESTV tax calculator (`estv.test.ts`). |
| `tools/estv_fixtures.py` | Regenerates the ESTV reference results (`python3 tools/estv_fixtures.py 2026`). |
| `src/server/` | Hono server: serves the app and proxies AI calls to the Claude API (key stays on the server). |
| `src/web/` | React app. Household data lives **only in the browser** (localStorage) and in exported files (optionally AES-encrypted). |
| `research/` | Official sources. The `.txt` extracts are given to Claude as reference so answers cite the real rules. |

AI features (Claude, `claude-opus-5-5`): reading documents, finding deductions (checked against known codes and legal caps), a pre-filing review, and Q&A. Server-side refusal fallback is enabled (`fallbacks: "default"`).

## Setup

```bash
cp .env.example .env      # then put ANTHROPIC_API_KEY=... in .env
docker compose up -d --build
```

The container listens on `127.0.0.1:6969` only; the Cloudflare tunnel (host network) routes your hostname (e.g. `tax.example.com`) `→ http://localhost:6969`.

**Cloudflare Access** (Zero Trust → Access → Applications → Add → Self-hosted): your hostname, policy *Allow* → *Emails* → your household's addresses. Then copy the team domain and the application's AUD tag into `.env` (`CF_ACCESS_TEAM_DOMAIN`, `CF_ACCESS_AUD`) and restart, so the API also rejects requests that bypass Access.

## Development

The host has Node 18; `./dev.sh` runs commands in Node 22:

```bash
./dev.sh npm test
./dev.sh npx tsc --noEmit
./dev.sh npm run build
```

## Updating for the 2026 return (early 2027)

1. Vaud: download the new *Instructions générales* (`21001_2026.pdf`) and *propriété immobilière* (`21004_2026.pdf`) from vd.ch. Zurich: the new *Wegleitung* and the 2026 tariffs (indexed on 1.1.2026, see RRB 833/2025). Federal: ESTV form 58c 2026. Extract text with `pdftotext`.
2. Copy the rules files to 2026 versions and update every figure (the page references make this a checklist).
3. Regenerate the ESTV fixtures (`python3 tools/estv_fixtures.py 2026`) and update the worked-example tests.
4. Refresh the commune data: Vaud from the vd.ch tax-rate table, Zurich from the open-data CSV (`kanton_zuerich_stf_timeseries.csv`).
5. Users import last year's exported file to start from their 2025 answers.

## Known limits

- Vaud communal rates: the 2025 table is no longer published; the app uses the 2026 table and flags communes whose rate may have changed (check your tax bill). Zurich rates are the official 2025 ones.
- Zurich Eigenmietwert and property tax value must be entered from the property valuation; they aren't computed.
- Vaud family-quotient cap: the official ESTV calculator disagrees with the worked examples in the 2025 instructions above the cap; the app follows the instructions.
- Self-employment covers sole proprietors (raison individuelle / Einzelunternehmen). Partnerships, qualified holdings in business assets (compte distinct), liquidation profits, provisions and the Zurich household private-share rules are not computed. The AVS figure is an estimate without administration fees and family-allowance contributions.
- Capital payouts (taxed separately), partial-year taxation and international cases are only covered superficially.
- The estimate is a guide, not a tax decision.
