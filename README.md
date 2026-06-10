# SourcingLens

**Tariff and duty cost analyzer for importers. Compare landed costs across sourcing countries, get HS code suggestions, and model the real impact of US tariffs — in minutes.**

[![Live Tool](https://img.shields.io/badge/Live%20Tool-sourcinglens.com-blue)](https://sourcinglens.com)

---

## What It Does

SourcingLens helps importers, sourcing managers, and small business owners answer the question that's keeping them up at night in 2025–2026:

**"If I move my sourcing from China to Vietnam / Mexico / India / Thailand — what does it actually cost me?"**

You enter a product SKU or description. SourcingLens suggests the right HS code (using GPT-4.1-mini inference), pulls duty rates, and builds a side-by-side landed cost comparison across up to 5 sourcing countries — including the impact of current US tariffs, Section 301 duties, and USMCA treatment.

### Key features

- **1-vs-1 free comparison** — no signup required, compare any two sourcing countries instantly
- **HS code inference** — describe your product in plain English, get an 8-digit HS suggestion
- **5-country comparison** — model your full sourcing shortlist in one view
- **Multi-SKU analysis** — up to 5 SKUs at once for Pro users
- **CSV + PDF export** — download your analysis for stakeholders and brokers
- **Tariff risk panel** — flags products with elevated Section 301 / additional duty exposure
- **Saved analyses dashboard** — Pro Monthly users can store and revisit past runs

---

## Why This Matters Right Now

US tariff policy has undergone more change in the last 18 months than in the prior 20 years. Section 301 duties on Chinese goods range from 7.5% to 145%. USMCA near-shoring has surged. Vietnam, India, and Thailand have become primary alternates — but each carries its own duty profile, transit cost, and supplier ecosystem.

A 10-percentage-point duty difference on a $500,000 annual import order is $50,000 in landed cost. Most small and mid-size importers are making sourcing decisions based on FOB price alone, leaving significant money — and risk — on the table.

SourcingLens exists to make that calculation fast, accessible, and exportable — without hiring a customs broker for every scenario.

---

## Who Uses This

**Small and mid-size importers** (consumer goods, electronics, apparel, industrial components) who need to model sourcing shifts quickly without a full trade analyst on staff.

**Sourcing managers and procurement leads** at companies evaluating China-plus-one strategies.

**E-commerce sellers** on Amazon, Shopify, or direct-to-consumer who are feeling margin compression from tariff pass-through.

**Freight forwarders and customs brokers** who want a fast client-facing tool for scenario modeling.

**Supply chain consultants** building the business case for a sourcing pivot.

---

## Pricing

| Tier | Price | What You Get |
|------|-------|--------------|
| Free | $0 | 1-vs-1 country comparison, no HS code, no CSV |
| Starter | One-time | 1 SKU, 5-country comparison, HS inference, CSV, narrative summary |
| Pro | One-time | Up to 5 SKUs, CSV + PDF export, tariff risk panel |
| Pro Monthly | Subscription | Everything in Pro + Supabase-backed auth, saved analyses dashboard |

---

## How It Works (Technical)

- Static HTML/CSS/JS frontend + Netlify Functions backend
- HS code inference via OpenAI GPT-4.1-mini (`netlify/functions/hs-infer.js`)
- Duty rate data is embedded and updated periodically
- Auth and saved analyses powered by Supabase (email magic link)
- Stripe Payment Links for all paid tiers
- Deploy: Netlify (publish directory: root, functions directory: `netlify/functions`)

### Environment Variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `OPENAI_API_KEY` | Yes | HS code inference |
| Supabase URL + anon key | Yes (Pro Monthly) | Auth + dashboard |

---

## Local Development

```bash
npm install -g netlify-cli
netlify dev
```

The free comparison and all client-side analysis works immediately. HS inference requires `OPENAI_API_KEY` in `.env`.

---

## Topics

`tariffs` · `import-duty` · `hs-code` · `sourcing` · `supply-chain` · `trade-war` · `landed-cost` · `section-301` · `usmca` · `tariff-calculator` · `china-plus-one` · `procurement` · `customs-duty` · `import-analysis`

---

## Disclaimer

Always confirm HS classifications and duty rates with your licensed customs broker or trade attorney before making sourcing decisions. SourcingLens outputs are directional estimates based on publicly available tariff schedules and are not a substitute for formal binding rulings.
