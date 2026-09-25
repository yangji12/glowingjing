/* AdSim reference data: industry benchmarks, targeting options, and baseline guidelines.
 *
 * Benchmark values are rounded approximations of publicly reported Google Ads industry
 * averages (search CTR/CPC/CVR, display, video, shopping). They are for teaching only and
 * give the simulator a realistic "market" to compete in.
 */
(function (root) {
  'use strict';
  var AdSim = (root.AdSim = root.AdSim || {});

  // ctr/cvr are fractions, cpc in USD. value = default value per conversion (AOV or lead value).
  // volume = relative search demand. competition = 0..1 auction pressure.
  // ages = relative conversion propensity for [18-24, 25-34, 35-44, 45-54, 55-64, 65+, unknown].
  var INDUSTRIES = {
    retail:       { name: 'E-commerce & Retail',        search: { ctr: 0.065, cpc: 1.20, cvr: 0.029 }, display: { ctr: 0.0050, cpc: 0.50, cvr: 0.0060 }, video: { cpv: 0.030, viewRate: 0.31 }, shopping: { ctr: 0.0086, cpc: 0.66, cvr: 0.018 }, value: 75,   margin: 0.40, volume: 1.2, competition: 0.70, local: false, ages: [1.0, 1.2, 1.1, 1.0, 0.9, 0.7, 0.8],
      vocab: 'shop store products clothing apparel shoes accessories gifts home goods', competitors: ['amazon', 'walmart', 'target'] },
    travel:       { name: 'Travel & Hospitality',       search: { ctr: 0.090, cpc: 1.55, cvr: 0.036 }, display: { ctr: 0.0060, cpc: 0.45, cvr: 0.0050 }, video: { cpv: 0.030, viewRate: 0.31 }, shopping: { ctr: 0.0080, cpc: 0.70, cvr: 0.015 }, value: 420,  margin: 0.25, volume: 1.0, competition: 0.65, local: false, ages: [0.8, 1.1, 1.1, 1.1, 1.1, 1.0, 0.8],
      vocab: 'travel trip vacation hotel tour tours flights booking resort holiday getaway', competitors: ['expedia', 'booking', 'airbnb'] },
    education:    { name: 'Education & Training',       search: { ctr: 0.061, cpc: 4.00, cvr: 0.070 }, display: { ctr: 0.0050, cpc: 0.60, cvr: 0.0080 }, video: { cpv: 0.035, viewRate: 0.30 }, shopping: { ctr: 0.0070, cpc: 0.80, cvr: 0.012 }, value: 1500, margin: 0.50, volume: 0.8, competition: 0.60, local: false, ages: [1.8, 1.4, 0.9, 0.6, 0.4, 0.2, 0.8],
      vocab: 'course courses class classes degree program online learning school training certificate certification tutoring bootcamp', competitors: ['coursera', 'udemy', 'edx'] },
    health:       { name: 'Health & Fitness',           search: { ctr: 0.061, cpc: 3.50, cvr: 0.071 }, display: { ctr: 0.0059, cpc: 0.70, cvr: 0.0080 }, video: { cpv: 0.030, viewRate: 0.32 }, shopping: { ctr: 0.0085, cpc: 0.70, cvr: 0.017 }, value: 480,  margin: 0.60, volume: 0.9, competition: 0.60, local: true,  ages: [1.3, 1.3, 1.1, 0.9, 0.7, 0.6, 0.8],
      vocab: 'gym fitness training personal trainer workout yoga pilates classes membership health studio', competitors: ['planet fitness', 'la fitness', 'orangetheory'] },
    legal:        { name: 'Legal Services',             search: { ctr: 0.052, cpc: 8.60, cvr: 0.061 }, display: { ctr: 0.0045, cpc: 0.72, cvr: 0.0080 }, video: { cpv: 0.040, viewRate: 0.28 }, shopping: { ctr: 0.0060, cpc: 1.00, cvr: 0.010 }, value: 2500, margin: 0.40, volume: 0.5, competition: 0.90, local: true,  ages: [0.6, 1.0, 1.2, 1.2, 1.1, 0.9, 0.8],
      vocab: 'lawyer lawyers attorney attorneys law firm legal injury accident divorce consultation claim', competitors: ['morgan and morgan', 'legalzoom', 'avvo'] },
    homeservices: { name: 'Home Services',              search: { ctr: 0.058, cpc: 6.50, cvr: 0.110 }, display: { ctr: 0.0050, cpc: 0.80, cvr: 0.0090 }, video: { cpv: 0.035, viewRate: 0.29 }, shopping: { ctr: 0.0070, cpc: 0.90, cvr: 0.012 }, value: 450,  margin: 0.45, volume: 0.7, competition: 0.80, local: true,  ages: [0.3, 0.9, 1.3, 1.3, 1.2, 1.0, 0.8],
      vocab: 'plumber plumbing repair installation hvac heating cooling cleaning roofing electrician contractor remodel', competitors: ['angi', 'homeadvisor', 'thumbtack'] },
    b2b:          { name: 'B2B / SaaS',                 search: { ctr: 0.058, cpc: 5.50, cvr: 0.035 }, display: { ctr: 0.0046, cpc: 0.79, cvr: 0.0080 }, video: { cpv: 0.045, viewRate: 0.27 }, shopping: { ctr: 0.0060, cpc: 1.10, cvr: 0.010 }, value: 1200, margin: 0.80, volume: 0.6, competition: 0.75, local: false, ages: [0.5, 1.2, 1.3, 1.2, 0.9, 0.4, 0.8],
      vocab: 'software platform tool app saas business team management solution crm automation project workflow', competitors: ['salesforce', 'hubspot', 'monday'] },
    finance:      { name: 'Finance & Insurance',        search: { ctr: 0.058, cpc: 4.50, cvr: 0.051 }, display: { ctr: 0.0052, cpc: 0.86, cvr: 0.0100 }, video: { cpv: 0.040, viewRate: 0.28 }, shopping: { ctr: 0.0060, cpc: 1.00, cvr: 0.010 }, value: 800,  margin: 0.50, volume: 0.8, competition: 0.85, local: false, ages: [0.6, 1.1, 1.2, 1.2, 1.1, 1.0, 0.8],
      vocab: 'insurance loan loans mortgage finance credit bank banking investment advisor accounting tax', competitors: ['geico', 'rocket mortgage', 'nerdwallet'] },
    restaurants:  { name: 'Restaurants & Food',         search: { ctr: 0.078, cpc: 1.95, cvr: 0.075 }, display: { ctr: 0.0060, cpc: 0.40, cvr: 0.0080 }, video: { cpv: 0.025, viewRate: 0.33 }, shopping: { ctr: 0.0090, cpc: 0.60, cvr: 0.020 }, value: 45,   margin: 0.30, volume: 1.1, competition: 0.55, local: true,  ages: [1.3, 1.3, 1.1, 0.9, 0.8, 0.6, 0.8],
      vocab: 'restaurant food menu delivery takeout dining pizza cafe coffee catering brunch dinner', competitors: ['doordash', 'ubereats', 'grubhub'] },
    realestate:   { name: 'Real Estate',                search: { ctr: 0.084, cpc: 2.10, cvr: 0.025 }, display: { ctr: 0.0100, cpc: 0.75, cvr: 0.0080 }, video: { cpv: 0.030, viewRate: 0.30 }, shopping: { ctr: 0.0070, cpc: 0.80, cvr: 0.010 }, value: 2500, margin: 0.35, volume: 0.8, competition: 0.70, local: true,  ages: [0.4, 1.3, 1.4, 1.1, 0.9, 0.7, 0.8],
      vocab: 'homes home real estate realtor agent house houses condo apartment property listing listings sell', competitors: ['zillow', 'redfin', 'realtor'] },
    automotive:   { name: 'Automotive',                 search: { ctr: 0.064, cpc: 2.40, cvr: 0.090 }, display: { ctr: 0.0060, cpc: 0.58, cvr: 0.0100 }, video: { cpv: 0.030, viewRate: 0.31 }, shopping: { ctr: 0.0080, cpc: 0.70, cvr: 0.015 }, value: 600,  margin: 0.30, volume: 0.9, competition: 0.70, local: true,  ages: [0.7, 1.1, 1.2, 1.1, 1.0, 0.8, 0.8],
      vocab: 'car cars auto dealer dealership vehicle vehicles repair used lease suv truck tires', competitors: ['carmax', 'carvana', 'autotrader'] },
    beauty:       { name: 'Beauty & Personal Care',     search: { ctr: 0.069, cpc: 2.00, cvr: 0.055 }, display: { ctr: 0.0050, cpc: 0.50, cvr: 0.0100 }, video: { cpv: 0.025, viewRate: 0.33 }, shopping: { ctr: 0.0095, cpc: 0.60, cvr: 0.021 }, value: 55,   margin: 0.55, volume: 1.0, competition: 0.65, local: false, ages: [1.4, 1.4, 1.1, 0.9, 0.7, 0.5, 0.8],
      vocab: 'beauty skincare skin makeup salon spa hair cosmetics nails serum cream', competitors: ['sephora', 'ulta', 'glossier'] }
  };

  var AGE_BANDS = ['18-24', '25-34', '35-44', '45-54', '55-64', '65+', 'Unknown'];
  var AGE_SHARE = [0.12, 0.18, 0.17, 0.16, 0.16, 0.17, 0.04];
  var GENDERS = ['Female', 'Male', 'Unknown'];

  // weight = share of US-sized demand; cpc/cvr = multipliers vs. US.
  var LOCATIONS = [
    { id: 'us', name: 'United States', weight: 1.0, cpc: 1.0, cvr: 1.0, kind: 'country' },
    { id: 'ca', name: 'Canada', weight: 0.12, cpc: 0.85, cvr: 0.95, kind: 'country' },
    { id: 'uk', name: 'United Kingdom', weight: 0.2, cpc: 0.85, cvr: 0.95, kind: 'country' },
    { id: 'au', name: 'Australia', weight: 0.08, cpc: 0.9, cvr: 0.95, kind: 'country' },
    { id: 'de', name: 'Germany', weight: 0.25, cpc: 0.8, cvr: 0.85, kind: 'country' },
    { id: 'in', name: 'India', weight: 0.9, cpc: 0.25, cvr: 0.35, kind: 'country' },
    { id: 'r5', name: 'Local: 5-mile radius', weight: 0.004, cpc: 1.0, cvr: 1.0, kind: 'radius' },
    { id: 'r10', name: 'Local: 10-mile radius', weight: 0.012, cpc: 1.0, cvr: 1.0, kind: 'radius' },
    { id: 'r25', name: 'Local: 25-mile radius', weight: 0.03, cpc: 1.0, cvr: 1.0, kind: 'radius' },
    { id: 'r50', name: 'Local: 50-mile radius', weight: 0.06, cpc: 1.0, cvr: 0.95, kind: 'radius' }
  ];

  // Audience segments. size = monthly display impressions available (US), before demographics.
  var AUDIENCES = [
    { id: 'aff_foodies', type: 'affinity', name: 'Affinity: Foodies', size: 90e6, inds: ['restaurants', 'retail'] },
    { id: 'aff_fitness', type: 'affinity', name: 'Affinity: Health & Fitness Buffs', size: 80e6, inds: ['health', 'beauty'] },
    { id: 'aff_travel', type: 'affinity', name: 'Affinity: Travel Buffs', size: 100e6, inds: ['travel'] },
    { id: 'aff_tech', type: 'affinity', name: 'Affinity: Technophiles', size: 110e6, inds: ['b2b', 'retail'] },
    { id: 'aff_beauty', type: 'affinity', name: 'Affinity: Beauty Mavens', size: 70e6, inds: ['beauty'] },
    { id: 'aff_home', type: 'affinity', name: 'Affinity: Home Decor Enthusiasts', size: 75e6, inds: ['homeservices', 'realestate', 'retail'] },
    { id: 'aff_auto', type: 'affinity', name: 'Affinity: Auto Enthusiasts', size: 60e6, inds: ['automotive'] },
    { id: 'aff_biz', type: 'affinity', name: 'Affinity: Business Professionals', size: 95e6, inds: ['b2b', 'finance', 'legal', 'education'] },
    { id: 'aff_value', type: 'affinity', name: 'Affinity: Value Shoppers', size: 120e6, inds: ['retail', 'beauty', 'restaurants'] },
    { id: 'im_travel', type: 'inMarket', name: 'In-market: Trips & Hotels', size: 30e6, inds: ['travel'] },
    { id: 'im_edu', type: 'inMarket', name: 'In-market: Post-secondary & Online Education', size: 18e6, inds: ['education'] },
    { id: 'im_fitness', type: 'inMarket', name: 'In-market: Fitness Services & Gyms', size: 15e6, inds: ['health'] },
    { id: 'im_legal', type: 'inMarket', name: 'In-market: Legal Services', size: 8e6, inds: ['legal'] },
    { id: 'im_home', type: 'inMarket', name: 'In-market: Home Improvement Services', size: 20e6, inds: ['homeservices'] },
    { id: 'im_software', type: 'inMarket', name: 'In-market: Business Software', size: 14e6, inds: ['b2b'] },
    { id: 'im_finance', type: 'inMarket', name: 'In-market: Financial & Insurance Services', size: 25e6, inds: ['finance'] },
    { id: 'im_realestate', type: 'inMarket', name: 'In-market: Residential Properties', size: 16e6, inds: ['realestate'] },
    { id: 'im_autos', type: 'inMarket', name: 'In-market: Autos & Vehicles', size: 22e6, inds: ['automotive'] },
    { id: 'im_apparel', type: 'inMarket', name: 'In-market: Apparel & Accessories', size: 40e6, inds: ['retail', 'beauty'] },
    { id: 'im_coffee', type: 'inMarket', name: 'In-market: Gourmet Food & Coffee', size: 12e6, inds: ['retail', 'restaurants'] },
    { id: 'im_beauty', type: 'inMarket', name: 'In-market: Beauty Products & Services', size: 28e6, inds: ['beauty'] },
    { id: 'im_dining', type: 'inMarket', name: 'In-market: Restaurants & Food Delivery', size: 35e6, inds: ['restaurants'] },
    { id: 'life_moving', type: 'lifeEvent', name: 'Life event: Recently moved', size: 10e6, inds: ['homeservices', 'realestate', 'finance'] },
    { id: 'life_grad', type: 'lifeEvent', name: 'Life event: Graduating soon', size: 6e6, inds: ['education', 'finance'] },
    { id: 'life_wedding', type: 'lifeEvent', name: 'Life event: Getting married soon', size: 5e6, inds: ['travel', 'beauty', 'retail', 'finance'] },
    { id: 'custom', type: 'custom', name: 'Custom segment: people who searched your keywords', size: 9e6, inds: 'all' },
    { id: 'rmk_all', type: 'remarketing', name: 'Your data: All website visitors (30 days)', size: 0, inds: 'all' },
    { id: 'rmk_engaged', type: 'remarketing', name: 'Your data: Engaged visitors / cart abandoners', size: 0, inds: 'all' }
  ];

  // How each audience type behaves (multipliers vs. industry display baseline).
  var AUDIENCE_TYPES = {
    affinity:    { label: 'Affinity',   ctr: 0.9,  cvr: 0.6, cpm: 0.8, funnel: 'Awareness' },
    inMarket:    { label: 'In-market',  ctr: 1.25, cvr: 1.5, cpm: 1.3, funnel: 'Consideration' },
    lifeEvent:   { label: 'Life event', ctr: 1.05, cvr: 1.15, cpm: 1.1, funnel: 'Consideration' },
    custom:      { label: 'Custom',     ctr: 1.2,  cvr: 1.35, cpm: 1.2, funnel: 'Consideration' },
    remarketing: { label: 'Your data',  ctr: 2.0,  cvr: 3.5, cpm: 1.8, funnel: 'Conversion' },
    topic:       { label: 'Topic',      ctr: 1.0,  cvr: 0.9, cpm: 1.0, funnel: 'Awareness' },
    placement:   { label: 'Placement',  ctr: 1.1,  cvr: 1.0, cpm: 1.2, funnel: 'Consideration' },
    optimized:   { label: 'Optimized targeting', ctr: 0.85, cvr: 0.7, cpm: 0.9, funnel: 'Mixed' },
    network:     { label: 'Entire network (untargeted)', ctr: 0.6, cvr: 0.2, cpm: 0.6, funnel: 'None' }
  };

  var TOPICS = [
    { id: 't_food', name: 'Food & Drink', size: 60e6, inds: ['restaurants', 'retail'] },
    { id: 't_travel', name: 'Travel', size: 55e6, inds: ['travel'] },
    { id: 't_edu', name: 'Jobs & Education', size: 45e6, inds: ['education'] },
    { id: 't_health', name: 'Health', size: 50e6, inds: ['health'] },
    { id: 't_fitness', name: 'Beauty & Fitness', size: 50e6, inds: ['health', 'beauty'] },
    { id: 't_law', name: 'Law & Government', size: 20e6, inds: ['legal'] },
    { id: 't_home', name: 'Home & Garden', size: 45e6, inds: ['homeservices', 'realestate', 'retail'] },
    { id: 't_biz', name: 'Business & Industrial', size: 40e6, inds: ['b2b', 'finance'] },
    { id: 't_finance', name: 'Finance', size: 40e6, inds: ['finance'] },
    { id: 't_realestate', name: 'Real Estate', size: 25e6, inds: ['realestate'] },
    { id: 't_autos', name: 'Autos & Vehicles', size: 40e6, inds: ['automotive'] },
    { id: 't_shopping', name: 'Shopping', size: 70e6, inds: ['retail', 'beauty'] },
    { id: 't_tech', name: 'Computers & Electronics', size: 60e6, inds: ['b2b', 'retail'] },
    { id: 't_news', name: 'News', size: 150e6, inds: [] },
    { id: 't_games', name: 'Games', size: 200e6, inds: [] }
  ];

  var CAMPAIGN_TYPES = {
    search:   { name: 'Search', icon: '🔍', desc: 'Text ads on search results when people search for your keywords. Best for capturing existing demand (sales, leads).' },
    display:  { name: 'Display', icon: '🖼️', desc: 'Responsive image ads across websites and apps. Best for awareness, consideration, and remarketing.' },
    video:    { name: 'Video (YouTube)', icon: '▶️', desc: 'Video ads on YouTube. Best for awareness and consideration; drives reach and brand lift.' },
    shopping: { name: 'Shopping', icon: '🛒', desc: 'Product listings with image, price, and store name built from your product feed. Best for online retail sales.' }
  };

  var GOALS = {
    sales:     { name: 'Sales', fit: { search: 3, shopping: 3, display: 1, video: 1 } },
    leads:     { name: 'Leads', fit: { search: 3, display: 1, video: 1, shopping: 0 } },
    traffic:   { name: 'Website traffic', fit: { search: 3, display: 2, shopping: 2, video: 1 } },
    awareness: { name: 'Brand awareness & reach', fit: { video: 3, display: 3, search: 1, shopping: 0 } },
    consideration: { name: 'Product & brand consideration', fit: { video: 3, display: 2, search: 2, shopping: 1 } }
  };

  var BID_STRATEGIES = {
    manual_cpc:      { name: 'Manual CPC', types: ['search', 'display', 'shopping'], needsConv: false, auto: false, desc: 'You set the max cost-per-click for each ad group/keyword. Full control, more work.' },
    max_clicks:      { name: 'Maximize clicks', types: ['search', 'display', 'shopping'], needsConv: false, auto: true, desc: 'Automatically sets bids to get as many clicks as possible within budget. Good for new accounts and traffic goals.' },
    max_conversions: { name: 'Maximize conversions', types: ['search', 'display', 'video'], needsConv: true, auto: true, desc: 'Smart Bidding: spends the budget to get the most conversions. Needs conversion tracking.' },
    target_cpa:      { name: 'Target CPA', types: ['search', 'display', 'video'], needsConv: true, auto: false, desc: 'Smart Bidding: aims for conversions at your target cost per acquisition. Best with 15–30+ conversions/month.' },
    max_conv_value:  { name: 'Maximize conversion value', types: ['search'], needsConv: true, auto: true, desc: 'Smart Bidding: spends the budget to get the most revenue. Needs conversion values.' },
    target_roas:     { name: 'Target ROAS', types: ['search', 'shopping'], needsConv: true, auto: false, desc: 'Smart Bidding: aims for your target return on ad spend. Needs conversion values and history.' },
    target_is:       { name: 'Target impression share', types: ['search'], needsConv: false, auto: false, desc: 'Bids to show your ad at the top of the page a % of the time. Typically for brand terms.' },
    vcpm:            { name: 'Viewable CPM (vCPM)', types: ['display'], needsConv: false, auto: false, desc: 'Pay per 1,000 viewable impressions. For awareness.' },
    max_cpv:         { name: 'Maximum CPV', types: ['video'], needsConv: false, auto: false, desc: 'Pay per view (30s or full video, or interaction). For skippable in-stream and in-feed.' },
    target_cpm:      { name: 'Target CPM', types: ['video'], needsConv: false, auto: false, desc: 'Pay per 1,000 impressions. For bumper, non-skippable and reach campaigns.' }
  };

  var VIDEO_FORMATS = {
    skippable: { name: 'Skippable in-stream', maxLen: null, billing: 'cpv', desc: 'Plays before/during videos; viewers can skip after 5 seconds. You pay for 30s views (or full view if shorter) or clicks.' },
    nonskip:   { name: 'Non-skippable in-stream', maxLen: 15, billing: 'cpm', desc: '15 seconds or shorter; viewers must watch. Pay per 1,000 impressions.' },
    bumper:    { name: 'Bumper', maxLen: 6, billing: 'cpm', desc: '6 seconds or shorter; non-skippable. Great for reach and message reinforcement.' },
    infeed:    { name: 'In-feed video', maxLen: null, billing: 'cpv', desc: 'Thumbnail + text in YouTube search/watch next. Pay when people click to watch.' },
    shorts:    { name: 'YouTube Shorts', maxLen: 60, billing: 'cpm', desc: 'Vertical (9:16) video between Shorts. Best with vertical creative under 60s.' }
  };

  // Search-term modifiers used to expand phrase and broad match keywords.
  var MODIFIERS = {
    high: [
      { w: 'near me', pos: 'suffix' }, { w: 'price', pos: 'suffix' }, { w: 'buy', pos: 'prefix' },
      { w: 'best', pos: 'prefix' }, { w: 'online', pos: 'suffix' }, { w: 'cost', pos: 'suffix' },
      { w: 'book', pos: 'prefix' }, { w: 'order', pos: 'prefix' }, { w: 'quote', pos: 'suffix' },
      { w: 'deals', pos: 'suffix' }, { w: 'hire', pos: 'prefix' }, { w: 'top rated', pos: 'prefix' }
    ],
    low: [
      { w: 'free', pos: 'prefix' }, { w: 'jobs', pos: 'suffix' }, { w: 'how to', pos: 'prefix' },
      { w: 'diy', pos: 'prefix' }, { w: 'salary', pos: 'suffix' }, { w: 'what is', pos: 'prefix' },
      { w: 'used', pos: 'prefix' }, { w: 'reddit', pos: 'suffix' }, { w: 'meaning', pos: 'suffix' },
      { w: 'pdf', pos: 'suffix' }, { w: 'internship', pos: 'suffix' }, { w: 'wiki', pos: 'suffix' }
    ]
  };

  var HIGH_INTENT_WORDS = ['buy', 'price', 'prices', 'cost', 'near', 'order', 'book', 'hire', 'quote', 'deal', 'deals', 'sale', 'discount', 'coupon', 'shop', 'purchase', 'appointment', 'service', 'services', 'company', 'best', 'top', 'delivery', 'subscription', 'trial', 'demo', 'consultation', 'rates', 'for sale'];
  var LOW_INTENT_WORDS = ['free', 'jobs', 'job', 'how', 'what', 'why', 'diy', 'salary', 'used', 'reddit', 'meaning', 'pdf', 'internship', 'wiki', 'definition', 'history', 'career', 'careers', 'download', 'template', 'example', 'examples', 'tutorial'];
  var CTA_WORDS = ['buy', 'shop', 'get', 'book', 'call', 'start', 'try', 'order', 'sign up', 'join', 'learn', 'contact', 'schedule', 'request', 'claim', 'save', 'discover', 'explore', 'apply', 'download', 'subscribe', 'visit', 'reserve', 'enroll', 'register', 'compare', 'find'];

  // Baseline guidelines. Every scoring check and feedback item links back to one of these.
  var GUIDELINES = [
    { id: 'ACC-1', cat: 'Measurement', title: 'Set up conversion tracking before you launch', text: 'Install the Google tag / conversion tracking on your website so you can see which clicks turn into sales or leads. Without it, conversion-based Smart Bidding (Maximize conversions, Target CPA/ROAS) cannot optimize and remarketing lists cannot fill.' },
    { id: 'ACC-2', cat: 'Measurement', title: 'Give conversions a realistic value', text: 'Assign each conversion a value (average order value, or lead value × close rate). Values let you measure revenue and ROAS and use value-based bidding.' },
    { id: 'ACC-3', cat: 'Strategy', title: 'Match campaign type to the business goal', text: 'Search and Shopping capture existing demand and fit Sales/Leads. Display and Video build awareness and consideration and are strongest for reach and remarketing. Pick the objective first, then the campaign type.' },
    { id: 'STR-1', cat: 'Structure', title: 'Keep Search campaigns on the Search Network', text: 'Turn off "Display Network" expansion on Search campaigns. Search and Display behave very differently (intent vs. interruption), so mixing them hides performance and wastes budget. Build a separate Display campaign instead.' },
    { id: 'STR-2', cat: 'Structure', title: 'Build tightly themed ad groups', text: 'Group 5–20 closely related keywords that share one theme, and write ads specifically for that theme. If keywords need different ad messages or landing pages, split them into different ad groups.' },
    { id: 'STR-3', cat: 'Structure', title: 'Fund campaigns enough to learn', text: 'A daily budget should buy at least ~10 clicks at the expected CPC. For Target CPA, a daily budget of at least 2–3× the target CPA lets Smart Bidding gather data. Too many campaigns on a small budget spreads spend too thin.' },
    { id: 'STR-4', cat: 'Structure', title: 'Separate brand and non-brand keywords', text: 'Brand searches are cheap and convert well; generic searches are expensive and competitive. Keep them in separate campaigns or ad groups so you can budget and judge them separately.' },
    { id: 'KW-1', cat: 'Keywords', title: 'Use match types deliberately', text: 'Exact [keyword] and phrase "keyword" give control. Broad match reaches more related searches and works best when paired with Smart Bidding and a solid negative keyword list. All-broad with manual bidding usually wastes spend.' },
    { id: 'KW-2', cat: 'Keywords', title: 'Add negative keywords and review search terms every round', text: 'Block searches that will not convert, such as "free", "jobs", "DIY", "how to", or "salary". Review the Search terms report after every round and add irrelevant terms as negatives.' },
    { id: 'KW-3', cat: 'Keywords', title: 'Choose keywords that describe what you sell', text: 'Keywords should match your products or services and appear on your landing page. Irrelevant keywords get low Quality Scores, high CPCs and few conversions.' },
    { id: 'KW-4', cat: 'Keywords', title: 'Avoid duplicate keywords', text: 'The same keyword in multiple ad groups makes your own ad groups compete with each other and muddies reporting.' },
    { id: 'KW-5', cat: 'Keywords', title: 'Prefer specific keywords over one-word generic ones', text: 'Single words like "shoes" are expensive and show vague intent. Two- to four-word keywords ("women\'s trail running shoes") are cheaper and convert better.' },
    { id: 'QS-1', cat: 'Quality', title: 'Improve Quality Score through relevance', text: 'Quality Score (1–10) combines expected CTR, ad relevance and landing page experience. Higher Quality Score lowers your CPC and improves your ad position. Put keywords in headlines, keep ad groups tight, and send people to a matching landing page.' },
    { id: 'AD-1', cat: 'Ads', title: 'Give responsive search ads plenty of assets', text: 'Provide at least 8–10 unique headlines (up to 15, max 30 characters) and at least 3–4 descriptions (max 90 characters). Aim for "Good" or "Excellent" ad strength.' },
    { id: 'AD-2', cat: 'Ads', title: 'Put keywords in your headlines', text: 'Include the ad group\'s main keywords in at least 2–3 headlines. Matching the search wording raises ad relevance and CTR.' },
    { id: 'AD-3', cat: 'Ads', title: 'Include a call to action and a unique selling point', text: 'Tell people what to do (Shop, Book, Get a Quote) and why you (free shipping, 24/7, 20% off, rated 4.9★). Numbers and offers increase CTR.' },
    { id: 'AD-4', cat: 'Ads', title: 'Follow editorial policies', text: 'No exclamation marks in headlines, no repeated punctuation ("!!"), no ALL-CAPS words for emphasis, and no phone numbers in ad text (use a call asset). Violating assets are disapproved and will not serve.' },
    { id: 'AD-5', cat: 'Ads', title: 'Avoid duplicate headlines', text: 'Duplicate or near-duplicate headlines give the system fewer combinations to test and lower ad strength.' },
    { id: 'AST-1', cat: 'Assets', title: 'Add at least 4 sitelinks', text: 'Sitelinks (max 25 characters, with two description lines) make your ad larger and send people directly to useful pages. At least 2 are needed to show; 4+ is recommended.' },
    { id: 'AST-2', cat: 'Assets', title: 'Add callouts and structured snippets', text: 'Callouts (max 25 characters, e.g., "Free Shipping") and structured snippets (e.g., Types: …) add information at no extra cost and raise CTR.' },
    { id: 'AST-3', cat: 'Assets', title: 'Add a call asset for lead generation and local businesses', text: 'If people call you to buy, add your phone number as a call asset instead of writing it in the ad text.' },
    { id: 'BID-1', cat: 'Bidding', title: 'Pick a bid strategy that matches your goal and data', text: 'New campaigns without conversion history: Manual CPC, Maximize clicks, or Maximize conversions. Target CPA works best with 15–30+ conversions in 30 days; Target ROAS needs conversion values and similar history.' },
    { id: 'BID-2', cat: 'Bidding', title: 'Set realistic targets', text: 'A Target CPA far below the industry/historical CPA, or a Target ROAS far above what you achieve, throttles traffic. Start near your actual results and tighten gradually (10–20% at a time).' },
    { id: 'BID-3', cat: 'Bidding', title: 'Know your break-even ROAS', text: 'Break-even ROAS = 1 ÷ profit margin. With a 40% margin, you need at least 2.5× ROAS (i.e., $2.50 revenue per $1 spent) to avoid losing money on ads.' },
    { id: 'BID-4', cat: 'Bidding', title: 'Give Smart Bidding time to learn', text: 'Every time you change the bid strategy, there is a learning period (about 1–2 weeks) where performance is less stable. Avoid switching strategies every round.' },
    { id: 'TGT-1', cat: 'Targeting', title: 'Target locations where your customers are', text: 'Local businesses should target a radius around their service area and use "Presence: people in or regularly in your locations". National targeting for a local business wastes most of the budget.' },
    { id: 'TGT-2', cat: 'Targeting', title: 'Adjust by device and schedule based on data', text: 'Use device bid adjustments and ad schedules after you see which devices and times convert. Excluding a device (−100%) before you have data can remove your best customers.' },
    { id: 'TGT-3', cat: 'Targeting', title: 'Focus demographics on your real customers', text: 'Exclude age ranges that are clearly not your customers, but keep "Unknown" unless you have a reason—many real users are unclassified.' },
    { id: 'DSP-1', cat: 'Display', title: 'Always target Display campaigns', text: 'Use in-market, custom segments, remarketing, or relevant topics/placements. Running on the entire network without targeting buys cheap, irrelevant impressions.' },
    { id: 'DSP-2', cat: 'Display', title: 'Complete your responsive display ad', text: 'Provide up to 5 short headlines (30 chars), a long headline (90), up to 5 descriptions (90), your business name, a landscape (1.91:1) and square (1:1) image, and a logo. More assets = more placements and formats.' },
    { id: 'DSP-3', cat: 'Display', title: 'Control placement quality and frequency', text: 'Exclude mobile app/game placements (accidental clicks) unless they convert, and set a frequency cap (e.g., 3–5 impressions per user per day) to avoid ad fatigue.' },
    { id: 'DSP-4', cat: 'Display', title: 'Use remarketing to bring visitors back', text: 'Remarketing to past website visitors is usually the highest-converting Display audience. It requires the Google tag to build a list.' },
    { id: 'VID-1', cat: 'Video', title: 'Hook viewers in the first 5 seconds', text: 'Show your brand and the core message in the first 5 seconds—before the Skip button appears. Strong hooks raise view rate and ad recall.' },
    { id: 'VID-2', cat: 'Video', title: 'Match video length to the format', text: 'Bumper ads: 6 seconds max. Non-skippable in-stream: 15 seconds max. Skippable: any length, but 15–60 seconds tends to perform best. Shorts: vertical 9:16, under 60 seconds.' },
    { id: 'VID-3', cat: 'Video', title: 'Add a call to action and companion banner', text: 'Add a CTA button and headline so interested viewers can click through to your website; a companion banner extends your message on desktop.' },
    { id: 'VID-4', cat: 'Video', title: 'Choose format and bidding by goal', text: 'Awareness: bumper/non-skippable with Target CPM. Consideration: skippable in-stream or in-feed with Maximum CPV. Action: skippable with conversion bidding (needs tracking).' },
    { id: 'SHP-1', cat: 'Shopping', title: 'Write descriptive product titles', text: 'Front-load Brand + Product type + key attributes (color, size, material, model). Titles of 70–150 characters perform best; only the first ~70 are visible, so put the most important words first.' },
    { id: 'SHP-2', cat: 'Shopping', title: 'Provide complete product data', text: 'Include GTIN, brand, a high-quality image, accurate price and availability. Products missing required data are disapproved; products missing GTIN get less visibility.' },
    { id: 'SHP-3', cat: 'Shopping', title: 'Write useful product descriptions', text: 'Descriptions should cover features, materials, sizing and use cases (150+ characters minimum; 500+ recommended).' },
    { id: 'SHP-4', cat: 'Shopping', title: 'Segment product groups and bid by value', text: 'Split "All products" by category or brand so you can bid more on high-margin, high-converting products and less (or exclude) on the rest. Add negative keywords to Shopping campaigns too.' },
    { id: 'SHP-5', cat: 'Shopping', title: 'Price competitively and show sales', text: 'Shoppers compare prices side-by-side. Products priced above the market get fewer clicks; sale prices show a strike-through that lifts CTR.' },
    { id: 'LP-1', cat: 'Landing page', title: 'Send clicks to a fast, relevant, secure landing page', text: 'Use HTTPS, a mobile-friendly design, and a page that matches the ad and keyword. Deep-link to the specific product or service page rather than the homepage.' },
    { id: 'LP-2', cat: 'Landing page', title: 'Final URLs must match your website', text: 'The final URL domain must match the domain shown in the ad. Mismatched domains are disapproved.' }
  ];

  var GUIDE_INDEX = {};
  GUIDELINES.forEach(function (g) { GUIDE_INDEX[g.id] = g; });

  // Demo businesses for students who do not have a website.
  var TEMPLATES = [
    {
      id: 'coffee', label: 'Brew Haven Coffee (online retail)',
      account: {
        businessName: 'Brew Haven Coffee', website: 'https://www.brewhaven.example', industry: 'retail', serviceArea: 'national',
        goal: 'sales', value: 38, margin: 0.45, brandColor: '#6b3e26',
        description: 'Small-batch specialty coffee roaster selling fresh roasted whole bean coffee, ground coffee, espresso blends, single origin coffee, coffee subscriptions and brewing gear online with free shipping over $35.'
      },
      scan: {
        title: 'Brew Haven Coffee | Fresh Roasted Specialty Coffee Beans Online',
        description: 'Order fresh roasted specialty coffee beans, espresso blends and coffee subscriptions. Roasted to order, shipped free over $35.',
        keywords: ['coffee', 'coffee beans', 'espresso', 'single origin', 'subscription', 'roaster', 'whole bean', 'ground coffee', 'decaf', 'cold brew', 'french press', 'pour over'],
        links: [
          { text: 'Shop Coffee', url: '/shop' }, { text: 'Subscriptions', url: '/subscribe' }, { text: 'Espresso Blends', url: '/espresso' },
          { text: 'Brewing Gear', url: '/gear' }, { text: 'Our Story', url: '/about' }
        ],
        https: true, hasViewport: true
      },
      products: [
        { title: 'Brew Haven Ethiopia Yirgacheffe Whole Bean Coffee - Light Roast, Floral & Citrus Notes, 12 oz Bag', price: 18.5, salePrice: 0, marketPrice: 19, brand: 'Brew Haven', gtin: '850012345671', category: 'Coffee Beans', imageUrl: 'generated', description: 'Single origin Ethiopian Yirgacheffe coffee, washed process, light roast with floral jasmine and bright citrus notes. Roasted to order in small batches and shipped within 24 hours. Ideal for pour over, drip and Chemex brewing. 12 oz resealable bag with one-way valve.', availability: 'in_stock', link: '/shop/ethiopia' },
        { title: 'Espresso Blend', price: 16, salePrice: 0, marketPrice: 15, brand: 'Brew Haven', gtin: '', category: 'Coffee Beans', imageUrl: 'generated', description: 'Our house espresso.', availability: 'in_stock', link: '/shop/espresso' },
        { title: 'Brew Haven Cold Brew Coffee Packs - Coarse Ground, Medium Dark Roast, 4 Pitcher Packs', price: 14, salePrice: 11.9, marketPrice: 13, brand: 'Brew Haven', gtin: '850012345688', category: 'Ground Coffee', imageUrl: 'generated', description: 'Pre-measured coarse ground cold brew coffee packs. Just add water, steep 12-18 hours, and enjoy smooth, low-acid cold brew with chocolate and caramel notes. Each pack makes a 64 oz pitcher. Medium dark roast.', availability: 'in_stock', link: '/shop/cold-brew' },
        { title: 'Pour Over Coffee Dripper Ceramic White', price: 32, salePrice: 0, marketPrice: 24, brand: '', gtin: '', category: 'Brewing Gear', imageUrl: '', description: 'Ceramic dripper.', availability: 'in_stock', link: '/gear/dripper' }
      ]
    },
    {
      id: 'law', label: 'Summit Injury Law (local legal leads)',
      account: {
        businessName: 'Summit Injury Law', website: 'https://www.summitinjurylaw.example', industry: 'legal', serviceArea: 'local',
        goal: 'leads', value: 2500, margin: 0.4, brandColor: '#1d3557',
        description: 'Denver personal injury lawyers handling car accident, truck accident, slip and fall and workplace injury claims. Free consultation, no fee unless we win.'
      },
      scan: {
        title: 'Summit Injury Law | Denver Personal Injury Lawyers | Free Consultation',
        description: 'Injured in a car accident? Our Denver personal injury attorneys fight for maximum compensation. No fee unless we win. Call for a free consultation.',
        keywords: ['personal injury lawyer', 'car accident attorney', 'denver injury attorney', 'truck accident', 'slip and fall', 'workplace injury', 'free consultation', 'compensation', 'claim'],
        links: [
          { text: 'Car Accidents', url: '/car-accident-lawyer' }, { text: 'Truck Accidents', url: '/truck-accident-lawyer' },
          { text: 'Free Case Review', url: '/contact' }, { text: 'Our Results', url: '/results' }, { text: 'Meet the Team', url: '/attorneys' }
        ],
        https: true, hasViewport: true
      },
      products: []
    },
    {
      id: 'gym', label: 'FitLab Studio (local fitness)',
      account: {
        businessName: 'FitLab Studio', website: 'https://www.fitlabstudio.example', industry: 'health', serviceArea: 'local',
        goal: 'leads', value: 480, margin: 0.6, brandColor: '#e4572e',
        description: 'Boutique fitness studio in Austin offering HIIT classes, strength training, personal training and yoga. First class free, flexible memberships.'
      },
      scan: {
        title: 'FitLab Studio Austin | HIIT, Strength & Personal Training',
        description: 'Austin boutique gym with HIIT classes, strength training, yoga and personal trainers. Try your first class free.',
        keywords: ['gym', 'hiit classes', 'personal trainer', 'austin', 'strength training', 'yoga', 'fitness classes', 'membership'],
        links: [
          { text: 'Class Schedule', url: '/schedule' }, { text: 'Personal Training', url: '/personal-training' },
          { text: 'Memberships', url: '/pricing' }, { text: 'Free First Class', url: '/free-class' }
        ],
        https: true, hasViewport: true
      },
      products: []
    },
    {
      id: 'saas', label: 'TaskFlow (B2B SaaS)',
      account: {
        businessName: 'TaskFlow', website: 'https://www.taskflow.example', industry: 'b2b', serviceArea: 'national',
        goal: 'leads', value: 1200, margin: 0.8, brandColor: '#3a0ca3',
        description: 'TaskFlow is project management software for small teams: task boards, time tracking, workflow automation and client portals. 14-day free trial.'
      },
      scan: {
        title: 'TaskFlow — Project Management Software for Small Teams',
        description: 'Plan projects, track time and automate workflows. Project management software built for agencies and small teams. Start a 14-day free trial.',
        keywords: ['project management software', 'task management', 'time tracking', 'workflow automation', 'team collaboration', 'agency', 'kanban', 'client portal'],
        links: [
          { text: 'Features', url: '/features' }, { text: 'Pricing', url: '/pricing' }, { text: 'Start Free Trial', url: '/signup' },
          { text: 'Book a Demo', url: '/demo' }, { text: 'Integrations', url: '/integrations' }
        ],
        https: true, hasViewport: true
      },
      products: []
    }
  ];

  AdSim.data = {
    INDUSTRIES: INDUSTRIES, AGE_BANDS: AGE_BANDS, AGE_SHARE: AGE_SHARE, GENDERS: GENDERS,
    LOCATIONS: LOCATIONS, AUDIENCES: AUDIENCES, AUDIENCE_TYPES: AUDIENCE_TYPES, TOPICS: TOPICS,
    CAMPAIGN_TYPES: CAMPAIGN_TYPES, GOALS: GOALS, BID_STRATEGIES: BID_STRATEGIES,
    VIDEO_FORMATS: VIDEO_FORMATS, MODIFIERS: MODIFIERS, HIGH_INTENT_WORDS: HIGH_INTENT_WORDS,
    LOW_INTENT_WORDS: LOW_INTENT_WORDS, CTA_WORDS: CTA_WORDS, GUIDELINES: GUIDELINES,
    GUIDE_INDEX: GUIDE_INDEX, TEMPLATES: TEMPLATES
  };
})(typeof window !== 'undefined' ? window : globalThis);
