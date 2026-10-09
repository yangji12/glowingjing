# Digital Ad Lab: Google Ads practice simulator

Digital Ad Lab is a classroom simulator. Students build Search, Display, YouTube (Video) and Shopping campaigns the way they would in Google Ads, and ChatGPT ads campaigns the way they would in OpenAI's Ads Manager. They run simulated 30-day rounds and get results back: clicks, impressions, CTR, CPC, CPA, ROAS, revenue and website analytics. Each round also gives a score and specific coaching tied to baseline Google Ads guidelines.

> Digital Ad Lab is for teaching. Its results are modeled estimates built from approximate industry benchmarks, not real Google Ads data. Digital Ad Lab is not affiliated with Google or OpenAI.

## Run it

```bash
python ads-simulator/server.py          # then open http://localhost:8000
```

This needs Python 3.8 or newer and nothing else; the server just hosts the app's files.

For a classroom, run `python ads-simulator/server.py --host 0.0.0.0 --port 8000` on one machine and give students the address. You can also host the `ads-simulator/` folder on any static host, such as GitHub Pages.

Each student's work saves automatically in their own browser. **Settings → Export** downloads a `.json` file that students can submit and instructors can import.

## Student workflow

1. **Business & website**: Students enter their business name, website, industry, service area, goal, value per conversion, profit margin, conversion tracking and a description of what they sell. Or they pick one of four demo businesses: a coffee retailer, a local law firm, a gym, or a B2B SaaS company. **Create a starter Search campaign** builds a Google-default-style draft, taking keywords from the description (or the demo data). The draft runs, but not well, and that gap is the lesson.
2. **Build by platform**: The menu has one workspace per platform: **Google Search, Google Display, YouTube, ChatGPT ads and Google Shopping**. Each workspace lists that platform's campaigns, has a **New campaign** button for that platform, a **Run simulation** button for that platform alone, and shows the platform's latest results, what is working, what is not and what to do next, plus its history across rounds. **All campaigns** lists everything. Inside a platform, students choose an objective, then fill in:
   - **Search**: ad groups and keywords using broad, `"phrase"` and `[exact]` notation, with Keyword Planner estimates. Also negatives, responsive search ads (15 headlines and 4 descriptions, with live ad strength and policy checks), sitelinks, callouts, structured snippets and a call asset.
   - **Display**: in-market, affinity, life-event, custom and remarketing audiences, plus topics, placements, demographics and optimized targeting. Students upload their own images (or drag them in); each is cropped to the required shape (landscape 1.91:1, square 1:1, logo) and saved with the project. Responsive display ads preview in 7 formats.
   - **YouTube (Video)**: the same **campaign subtypes** as Google Ads: Video views; Video reach (Efficient reach, Non-skippable reach, Target frequency); Drive conversions; Ad sequence; Audio reach; and YouTube subscriptions & engagements. Each subtype decides which formats run (picked by video length: bumper ≤6s, non-skippable ≤15s, audio ≤30s) and which bid strategies are allowed (Maximum/Target CPV, Target CPM, conversion bidding, Maximize engagements). Students also choose **placements** (YouTube videos, Home & Watch Next feeds, YouTube search, Shorts, TV screens, Google video partners) and an inventory type for brand safety, fill in the **ABCD creative checklist** (Attract, Brand, Connect, Direct), and upload thumbnails (16:9 and 9:16).
   - **Shopping**: a product feed with feed-quality scoring and product groups.
   - **ChatGPT ads**: follows the three steps of OpenAI's Ads Manager (Create campaign → Ad groups & ads → Review).
     - **Campaign**: an objective that is locked after the first round, as in Ads Manager: Views (CPM), Clicks (CPC) or Conversions (oCPC/oCPM with a conversion event). Then a daily budget (minimum $25) or a campaign total, countries, and platforms (iOS/Android app and web, desktop web). Optional custom audiences from a customer list (including one needs about 25,000 matched users). Measurement: pixel, Conversions API, and click (7/14/30-day) and view (0/1-day) attribution windows. Ads come from manual creatives or a product feed.
     - **Ad groups**: Maximize results or Manual: Max bid, with bid strength. Landing page query parameters with `{campaign_id}`, `{ad_group_id}`, `{ad_id}`, `{ad_account_id}` and `{oppref}`, a default destination URL, and up to 2,000 context hints, each graded for specificity and relevance.
     - **Ads**: title 3–50 characters, body up to 100 characters, a square image and a URL, with live policy review (prohibited and restricted categories, misleading claims).
   - **All types**: budget, bid strategy (Manual CPC, Maximize clicks/conversions/value, Target CPA/ROAS/impression share, vCPM, CPV, CPM), locations with Presence vs. interest, language, ad schedule, device bid adjustments, and network settings.
3. **Ad previews & stimuli**: Shows each ad in context: search results (desktop and mobile), responsive display ads in several sizes and on a news article, YouTube watch pages (desktop and mobile), feeds, search results, Shorts, TV screens and a video partner site, Shopping cards, and a ChatGPT-style chat answer with the Sponsored card or product carousel below it (desktop and mobile). Students can load a video file to play inside the YouTube mock-ups (session only). **Stimulus view** opens any ad in one full-size context and downloads it as a PNG, useful for class critiques or as experiment stimuli. The mock-ups use neutral branding.
4. **Run simulation**: Runs one round, which simulates 30 days of auctions. Students choose **All platforms** or a single platform (also available from each platform's page and campaign editor). A single-platform round is scored on that platform's campaigns and compared with the previous round of the same kind; Smart Bidding learning follows each campaign's own last run. Cross-channel results need an all-platforms round.
5. **Reports**: Tabs for campaigns, ad groups, keywords (Quality Score and its three components), search terms (opens on the **Wasted spend** view, with one-click **Negative** and **Keyword** buttons; blocking a term that converts or is your own keyword asks for confirmation), audiences and placements, products, devices, YouTube placements, ChatGPT ads (matched conversations, ads, and actual vs. reported conversions), GA4-style website analytics, and daily charts. Every table can be exported to CSV.
6. **Cross-channel results**: Three tabs for reviewing the round across channels.
   - **Final overview**: Totals, the strongest and weakest channel, a scorecard that gives every campaign a verdict and the reason for it, and profit by channel across rounds.
   - **Channel comparison**: Every channel side by side with its benchmark (green beats typical, red is worse), share of spend vs. share of revenue, and ROAS against the break-even line. Each channel is judged on its job: Search, Shopping and ChatGPT ads on profit, and Display and YouTube on profit and the awareness they build.
   - **What worked & what next**: For each channel, what is working, what is not and what to do next, plus a budget plan for the next round. Students record a decision for each channel (scale, keep, fix, cut or pause) with their reasoning and a reflection. These are saved with the project and included in the PDF.
7. **Score & feedback**: Shows the overall grade, the setup score by area, the performance breakdown, estimated revenue and profit, and a prioritized list of recommendations. Each recommendation links to the guideline behind it.
8. **PDF results overview**: **Download PDF** (on Overview, Cross-channel results, Score & feedback and Settings) saves a report of the round: scores, key results with change vs. the previous round, a daily clicks chart, campaign results, cross-channel results (verdicts, what worked, what to do next, the budget plan and the student's decisions), the score breakdown, top recommendations, website analytics and round history. It uses jsPDF from cdnjs (PNG stimuli use html2canvas), so these need an internet connection.

## How the simulation works (short version)

| Mechanism | Model |
|---|---|
| Ad Rank | effective bid × Quality Score × (1 + asset boost) versus competitor Ad Rank for the industry |
| Quality Score | expected CTR (keyword specificity, intent, ad strength), ad relevance (keyword in headlines, theme tightness), landing page (HTTPS, domain match, deep link, relevance to site content) |
| Actual CPC | the Ad Rank needed to beat the next competitor ÷ your QS, capped at your bid |
| Search terms | exact match shows the keyword; phrase adds modifiers; broad adds related, competitor and junk terms. Negatives block them. Smart Bidding filters some junk |
| Budget | manual and target strategies are throttled (lost IS from budget); Maximize strategies lower bids to fit the budget |
| Conversion rate | industry CVR × search intent × relevance to the business × landing page × location/device/schedule fit × Smart Bidding learning |
| Display/Video | reach from audience size × demographics × location; win rate from bid vs. market CPM (with price floors); frequency fatigue; accidental app clicks. YouTube adds subtype effects (reach vs. views vs. conversions vs. recall vs. subscribers; Target frequency holds the weekly frequency goal; Ad sequence rewards multi-step stories; Audio reach depends on the voiceover), placement effects (cost, view rate, clicks, conversions and recall differ by placement), the ABCD creative score, and engaged-view conversions; Shorts favors vertical video and TV screens favor the brand being said aloud |
| ChatGPT ads | conversation volume from locations × platforms × hint coverage; a relevance-weighted second-price auction (relevance from hints, landing page, title and copy) with a reserve price. Broad or one-word hints drift into off-target conversations; health, finance and legal businesses lose the sensitive share of conversations. Benchmarks: CTR ≈ 0.7%, CPM ≈ $25–60. Reported conversions = actual × pixel/CAPI match rate (higher with `{oppref}`) × attribution window |
| Shopping | visibility from feed quality (title, GTIN, image, description) and bids; CTR/CVR from price vs. market and sale price |
| Across rounds | remarketing lists fill from past visitors (tag required); video/display raises brand searches; Smart Bidding learns after a strategy change and matures with conversions |
| Audience fit | each audience and topic has keywords; "Fits your business" means they match words in the student's description and products, "Fits your industry" falls back to the industry. Fit drives reach quality in the simulation |
| Calibration | Display and YouTube convert less efficiently per dollar than Search: a decent Display or YouTube campaign typically returns about half to three-quarters of Search's ROAS (more of it from view-through and engaged-view conversions). Each industry's default value per conversion is set so an average Search advertiser roughly breaks even after margin. Sensible setups therefore earn a profit, and empty or nonsensical ones lose money (see `tests/calibration.test.js`). Incomplete ads and misconfigured bidding still run, with a penalty and a clear warning, instead of producing an empty report |

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
  js/previews.js  Search/Display/Shopping preview renderers
  js/youtube.js   YouTube mock-ups in context (watch pages, feeds, search, Shorts, TV, partners)
  js/chatgpt.js   ChatGPT-style chat answer with a Sponsored ad card or product carousel
  js/crosschannel.js  cross-channel analysis (verdicts, diagnosis, budget plan)
  js/report-pdf.js  PDF results overview
  js/app.js       UI
  server.py       small static file server (stdlib)
  tests/          node --test ads-simulator/tests/*.test.js
```

To tune the market, edit the numbers in `js/data.js`. To add a guideline, add it to `GUIDELINES` and reference its ID from a check in `js/scoring.js`.
