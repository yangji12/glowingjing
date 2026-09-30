"""Default budget categories and the keyword rules used when AI is unavailable."""

import re

# Budget groups, in display order. "transfer" rows are tracked but excluded from totals
# (credit-card payments, moving money between your own accounts, etc.).
GROUPS = [
    ("income", "Income"),
    ("fixed", "Fixed"),
    ("flexible", "Flexible"),
    ("non_monthly", "Non-Monthly & Misc"),
    ("transfer", "Transfers (not counted)"),
]
GROUP_KEYS = [g for g, _ in GROUPS]

# (name, emoji, group)
DEFAULT_CATEGORIES = [
    # Income
    ("Paychecks", "💵", "income"),
    ("Rent Income", "🏘️", "income"),
    ("Interest & Dividends", "📈", "income"),
    ("Refunds & Reimbursements", "↩️", "income"),
    ("Other Income", "💰", "income"),
    # Fixed
    ("Mortgage", "🏠", "fixed"),
    ("Rent", "🏢", "fixed"),
    ("Gas & Electric", "⚡", "fixed"),
    ("Water", "💧", "fixed"),
    ("Garbage", "🗑️", "fixed"),
    ("Internet & Cable", "🌐", "fixed"),
    ("Phone", "📱", "fixed"),
    ("Insurance", "☂️", "fixed"),
    ("Auto Payment", "🚗", "fixed"),
    ("Student Loans", "🎓", "fixed"),
    ("Loan Payments", "🏦", "fixed"),
    ("Child Tuition", "👶", "fixed"),
    ("Child Activities", "⚽", "fixed"),
    ("Fitness", "💪", "fixed"),
    ("Subscriptions", "📺", "fixed"),
    # Flexible
    ("Groceries", "🍏", "flexible"),
    ("Restaurants & Bars", "🍽️", "flexible"),
    ("Coffee Shops", "☕", "flexible"),
    ("Shopping", "🛍️", "flexible"),
    ("Clothing", "👕", "flexible"),
    ("Gas", "⛽", "flexible"),
    ("Parking & Tolls", "🅿️", "flexible"),
    ("Public Transit", "🚃", "flexible"),
    ("Rideshare & Taxi", "🚕", "flexible"),
    ("Entertainment & Recreation", "🎬", "flexible"),
    ("Personal Care", "💇", "flexible"),
    ("Medical & Pharmacy", "💊", "flexible"),
    ("Pets", "🐾", "flexible"),
    ("Household", "🧺", "flexible"),
    ("Cash & ATM", "🏧", "flexible"),
    # Non-monthly & miscellaneous
    ("Travel & Vacation", "✈️", "non_monthly"),
    ("Gifts & Donations", "🎁", "non_monthly"),
    ("Home Improvement", "🔨", "non_monthly"),
    ("Auto Maintenance", "🔧", "non_monthly"),
    ("Education", "📚", "non_monthly"),
    ("Taxes & Fees", "🧾", "non_monthly"),
    ("Business Expenses", "💼", "non_monthly"),
    ("Miscellaneous", "💲", "non_monthly"),
    ("Uncategorized", "❓", "non_monthly"),
    # Transfers
    ("Credit Card Payment", "💳", "transfer"),
    ("Transfer", "🔁", "transfer"),
    ("Savings Transfer", "🐷", "transfer"),
]

UNCATEGORIZED = "Uncategorized"

# Keyword fallback: first match wins. Patterns are matched case-insensitively
# against the transaction description.
KEYWORD_RULES = [
    (r"payroll|direct dep|salary|paycheck|adp |gusto|workday", "Paychecks"),
    (r"interest paid|dividend|int earned", "Interest & Dividends"),
    (r"refund|reversal|cashback|cash back reward|reimburse", "Refunds & Reimbursements"),
    (r"zelle from|venmo cashout|rent from|tenant", "Rent Income"),
    (r"autopay|payment thank you|card payment|cc payment|pymt.*card|epay.*(chase|amex|citi|discover|capital one)", "Credit Card Payment"),
    (r"transfer to sav|to savings|savings transfer", "Savings Transfer"),
    (r"online transfer|xfer|transfer (to|from)|zelle to|venmo", "Transfer"),
    (r"mortgage|rocket mortgage|wells fargo home|mr\.? cooper|loan servic", "Mortgage"),
    (r"\brent\b|apartments|property mgmt|avalon|equity residential", "Rent"),
    (r"pg&e|pge|con ?ed|duke energy|edison|electric|national grid|energy", "Gas & Electric"),
    (r"water (dept|district|util)|water bill|\bwater\b", "Water"),
    (r"waste management|recology|republic services|garbage|trash", "Garbage"),
    (r"comcast|xfinity|spectrum|verizon fios|at&t internet|sonic\.net|cox comm|google fiber", "Internet & Cable"),
    (r"t-mobile|verizon wireless|at&t wireless|mint mobile|visible|cricket", "Phone"),
    (r"geico|state farm|allstate|progressive|insurance|lemonade|usaa ins", "Insurance"),
    (r"toyota financial|honda financial|auto loan|car payment|ally auto|tesla finance", "Auto Payment"),
    (r"navient|nelnet|student loan|great lakes|mohela|fedloan", "Student Loans"),
    (r"tuition|daycare|preschool|kindercare|bright horizons|montessori", "Child Tuition"),
    (r"soccer|swim|ballet|karate|little league|camp|kumon|piano|music lesson|ymca", "Child Activities"),
    (r"gym|fitness|equinox|planet fitness|peloton|orangetheory|24 hour|crossfit|yoga", "Fitness"),
    (r"netflix|spotify|hulu|disney\+|disney plus|hbo|max\.com|apple\.com/bill|youtube premium|icloud|audible|patreon|substack|chatgpt|claude\.ai|anthropic", "Subscriptions"),
    (r"whole foods|trader joe|safeway|kroger|costco|aldi|sprouts|wegmans|publix|h-e-b|heb |grocery|market|99 ranch|h mart|instacart|lucky", "Groceries"),
    (r"starbucks|peet'?s|blue bottle|philz|dunkin|coffee|cafe|espresso|tea ", "Coffee Shops"),
    (r"restaurant|grill|pizza|sushi|taco|burger|chipotle|mcdonald|doordash|uber ?eats|grubhub|kitchen|bistro|bar |pub |diner|ramen|pho|bakery|cheesecake|panera|sweetgreen|in-n-out", "Restaurants & Bars"),
    (r"shell|chevron|exxon|mobil|arco|76 |valero|bp |sunoco|circle k|gas station|fuel", "Gas"),
    (r"parking|toll|fastrak|ezpass|e-zpass|parkmobile|spothero", "Parking & Tolls"),
    (r"bart|mta|clipper|caltrain|metro|transit|amtrak|muni", "Public Transit"),
    (r"uber|lyft|taxi|cab ", "Rideshare & Taxi"),
    (r"amc|cinema|movie|theater|theatre|ticketmaster|steam|playstation|xbox|nintendo|museum|zoo|concert|bowling", "Entertainment & Recreation"),
    (r"salon|barber|spa |nail|sephora|ulta|haircut", "Personal Care"),
    (r"cvs|walgreens|rite aid|pharmacy|medical|dental|dentist|clinic|hospital|kaiser|doctor|optometr|lab corp|quest diag", "Medical & Pharmacy"),
    (r"petco|petsmart|chewy|vet |veterinary|rover", "Pets"),
    (r"nordstrom|gap |old navy|uniqlo|zara|h&m|lululemon|nike|adidas|macy'?s|j\.?crew|banana republic|kohl'?s", "Clothing"),
    (r"home depot|lowe'?s|ace hardware|ikea|wayfair|contractor|plumb", "Home Improvement"),
    (r"target|walmart|bed bath|container store|dollar tree", "Household"),
    (r"amazon|amzn|ebay|etsy|best buy|apple store|shop|store", "Shopping"),
    (r"atm|cash withdrawal|withdrawal", "Cash & ATM"),
    (r"airline|united|delta|american air|southwest|jetblue|alaska air|airbnb|vrbo|hotel|marriott|hilton|hyatt|expedia|booking\.com", "Travel & Vacation"),
    (r"jiffy lube|auto repair|tire|midas|oil change|car wash|dmv", "Auto Maintenance"),
    (r"donation|charity|gofundme|red cross|unicef|church", "Gifts & Donations"),
    (r"irs|tax|franchise tax|fee|service charge|overdraft", "Taxes & Fees"),
    (r"udemy|coursera|books|school|college|university", "Education"),
]

_COMPILED = [(re.compile(p, re.I), c) for p, c in KEYWORD_RULES]


def keyword_category(description: str, amount: float) -> str:
    """Best-effort category from keywords. `amount` > 0 means money came in."""
    for rx, cat in _COMPILED:
        if rx.search(description or ""):
            return cat
    return "Other Income" if amount > 0 else UNCATEGORIZED
