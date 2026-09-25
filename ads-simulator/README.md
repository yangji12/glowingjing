# Digital Ad Lab: Google Ads practice simulator

Digital Ad Lab is a classroom simulator. Students build Search, Display, YouTube (Video) and Shopping campaigns the way they would in Google Ads. They run simulated 30-day rounds and get results back: clicks, impressions, CTR, CPC, CPA, ROAS, revenue and website analytics. Each round also gives a score and specific coaching tied to baseline Google Ads guidelines.

> Digital Ad Lab is for teaching. Its results are modeled estimates built from approximate industry benchmarks, not real Google Ads data. Digital Ad Lab is not affiliated with Google.

## Run it

```bash
python ads-simulator/server.py          # then open http://localhost:8000
```

This needs Python 3.8 or newer and nothing else; the server just hosts the app's files.

For a classroom, run `python ads-simulator/server.py --host 0.0.0.0 --port 8000` on one machine and give students the address. You can also host the `ads-simulator/` folder on any static host, such as GitHub Pages.

Each student's work saves automatically in their own browser. **Settings → Export** downloads a `.json` file that students can submit and instructors can import.

## Student workflow

1. **Business & website**: Students enter their business name, website, industry, service area, goal, value per conversion, profit margin, conversion tracking and a description of what they sell. Or they pick one of four demo businesses: a coffee retailer, a local law firm, a gym, or a B2B SaaS company. **Create a starter Search campaign** builds a Google-default-style draft, taking keywords from the description (or the demo data). The draft runs, but not well, and that gap is the lesson.
2. **Campaigns**: Students choose an objective and a campaign type, then fill in:
   - **Search**: ad groups and keywords using broad, `"phrase"` and `[exact]` notation, with Keyword Planner estimates. Also negatives, responsive search ads (15 headlines and 4 descriptions, with live ad strength and policy checks), sitelinks, callouts, structured snippets and a call asset.
   - **Display**: in-market, affinity, life-event, custom and remarketing audiences, plus topics, placements, demographics and optimized targeting. Responsive display ads preview in 7 formats.
   - **Video**: skippable, non-skippable, bumper, in-feed or Shorts format; the creative checklist (hook, early branding, captions, CTA, companion banner); CPV or CPM bidding.
   - **Shopping**: a product feed with feed-quality scoring and product groups.
   - **All types**: budget, bid strategy (Manual CPC, Maximize clicks/conversions/value, Target CPA/ROAS/impression share, vCPM, CPV, CPM), locations with Presence vs. interest, language, ad schedule, device bid adjustments, and network settings.
3. **Ad previews**: Shows each ad as a search result (desktop and mobile), as responsive display ads in several sizes, as YouTube players, Shorts and in-feed ads, and as Shopping cards. A **Show another combination** button demonstrates how the dynamic creative mixes assets.
4. **Run simulation**: Runs one round, which simulates 30 days of auctions.
5. **Reports**: Tabs for campaigns, ad groups, keywords (Quality Score and its three components), search terms (with one-click **Negative** and **Keyword** buttons), audiences and placements, products, devices, GA4-style website analytics, and daily charts. Every table can be exported to CSV.
6. **Score & feedback**: Shows the overall grade, the setup score by area, the performance breakdown, estimated revenue and profit, and a prioritized list of recommendations. Each recommendation links to the guideline behind it.
7. **PDF results overview**: **Download PDF** (on Overview, Score & feedback and Settings) saves a 3-page report of the round: scores, key results with change vs. the previous round, a daily clicks chart, campaign results, the score breakdown, top recommendations, website analytics and round history. It uses jsPDF from cdnjs, so it needs an internet connection.

## How the simulation works (short version)

| Mechanism | Model |
|---|---|
| Ad Rank | effective bid × Quality Score × (1 + asset boost) versus competitor Ad Rank for the industry |
| Quality Score | expected CTR (keyword specificity, intent, ad strength), ad relevance (keyword in headlines, theme tightness), landing page (HTTPS, domain match, deep link, relevance to site content) |
| Actual CPC | the Ad Rank needed to beat the next competitor ÷ your QS, capped at your bid |
| Search terms | exact match shows the keyword; phrase adds modifiers; broad adds related, competitor and junk terms. Negatives block them. Smart Bidding filters some junk |
| Budget | manual and target strategies are throttled (lost IS from budget); Maximize strategies lower bids to fit the budget |
| Conversion rate | industry CVR × search intent × relevance to the business × landing page × location/device/schedule fit × Smart Bidding learning |
| Display/Video | reach from audience size × demographics × location; win rate from bid vs. market CPM; frequency fatigue; accidental app clicks; view rate from length, hook and relevance; ad recall lift |
| Shopping | visibility from feed quality (title, GTIN, image, description) and bids; CTR/CVR from price vs. market and sale price |
| Across rounds | remarketing lists fill from past visitors (tag required); video/display raises brand searches; Smart Bidding learns after a strategy change and matures with conversions |

Each round seeds its randomness from the project seed and the round number. The same setup in the same round therefore always gives the same results, which keeps grading fair. Instructors can give every student the same seed in **Settings**.

**Scoring:** overall = 45% setup + 55% performance.
- **Setup** is a weighted checklist of about 40 checks built from the baseline guidelines (see the **Guidelines** page and `js/data.js`).
- **Performance** combines five parts: profitability (ROAS vs. break-even = 1 ÷ margin), CTR and conversion rate vs. industry benchmarks, quality (QS, ad strength, feed), wasted spend, and delivery. For an awareness goal, reach efficiency replaces profitability.

## Files

```
ads-simulator/
  index.html, css/styles.css
  js/util.js      shared helpers (seeded RNG, keyword/negative matching)
  js/data.js      industry benchmarks, audiences, topics, locations, bid strategies, guidelines, demo businesses
  js/model.js     state, campaign defaults, quick start, ad strength, policy checks, feed quality
  js/engine.js    the auction and traffic simulation
  js/scoring.js   setup checklist, performance score, feedback
  js/previews.js  ad preview renderers
  js/app.js       UI
  server.py       small static file server (stdlib)
  tests/          node --test ads-simulator/tests/*.test.js
```

To tune the market, edit the numbers in `js/data.js`. To add a guideline, add it to `GUIDELINES` and reference its ID from a check in `js/scoring.js`.
