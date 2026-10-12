/* Money Desk — turns text read from a banking screenshot into transactions.
   Runs entirely on the phone. No network. */
(function (root) {
  const MON = { jan:0, feb:1, mar:2, apr:3, may:4, jun:5, jul:6, aug:7, sep:8, sept:8, oct:9, nov:10, dec:11 };
  const pad = n => String(n).padStart(2, "0");
  const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  function fixYear(y, m, d, today) {
    if (y != null) { if (y < 100) y += 2000; return new Date(y, m, d); }
    let dt = new Date(today.getFullYear(), m, d);
    if (dt - today > 2 * 86400000) dt = new Date(today.getFullYear() - 1, m, d); // no future dates
    return dt;
  }
  const valid = (m, d) => m >= 0 && m < 12 && d >= 1 && d <= 31;

  // Returns {date, match} or null
  function findDate(line, today) {
    let m;
    if ((m = line.match(/\btoday\b/i))) return { date: iso(today), match: m[0] };
    if ((m = line.match(/\byesterday\b/i))) { const d = new Date(today); d.setDate(d.getDate() - 1); return { date: iso(d), match: m[0] }; }
    if ((m = line.match(/\b(\d{4})-(\d{2})-(\d{2})\b/))) return { date: `${m[1]}-${m[2]}-${m[3]}`, match: m[0] };
    const monRe = "(jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*\\.?";
    if ((m = line.match(new RegExp(`(?:\\b(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*,?\\s+)?\\b${monRe}\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?:,?\\s+(\\d{4}))?`, "i")))) {
      const mo = MON[m[1].toLowerCase()], d = +m[2];
      if (valid(mo, d)) return { date: iso(fixYear(m[3] ? +m[3] : null, mo, d, today)), match: m[0] };
    }
    if ((m = line.match(new RegExp(`(?:\\b(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*,?\\s+)?\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+${monRe}(?:,?\\s+(\\d{4}))?`, "i")))) {
      const mo = MON[m[2].toLowerCase()], d = +m[1];
      if (valid(mo, d)) return { date: iso(fixYear(m[3] ? +m[3] : null, mo, d, today)), match: m[0] };
    }
    if ((m = line.match(/(?:^|\s)(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?(?=\s|$)/))) {
      let a = +m[1], b = +m[2], mo, d;
      if (a > 12) { d = a; mo = b - 1; } else { mo = a - 1; d = b; } // US M/D unless impossible
      if (valid(mo, d)) return { date: iso(fixYear(m[3] ? +m[3] : null, mo, d, today)), match: m[0].trim() };
    }
    return null;
  }

  const AMT = /(^|[^\d.,])([-−–+])?\s?(NZ\$|US\$|\$)?\s?([-−–])?(\d{1,3}(?:,\d{3})+|\d+)[.,](\d{2})(?![\d%])(\s?(?:CR|DR)\b)?/gi;
  function findAmount(line) {
    AMT.lastIndex = 0;
    const m = AMT.exec(line);
    if (!m) return null;
    const value = parseFloat(m[5].replace(/,/g, "") + "." + m[6]);
    const neg = !!(m[2] && m[2] !== "+") || !!m[4] || /DR/i.test(m[7] || "");
    const pos = m[2] === "+" || /CR/i.test(m[7] || "");
    return { value, sign: neg ? -1 : pos ? 1 : 0, currency: m[3] && /NZ/i.test(m[3]) ? "NZD" : (m[3] && /US/i.test(m[3]) ? "USD" : null), match: m[0].slice(m[1].length) };
  }

  const SKIP = /\b(balance|available|total|credit limit|minimum payment|interest rate|statement|opening|closing|payment due|apr\b|rewards|points)\b/i;
  const NOISE = /^(pending|posted|processing|completed|card|debit|credit|purchase|transactions?|recent|activity|see all|search|filter|details|\d+)$/i;
  const INCOME = /\b(payroll|salary|wages|deposit|refund|reversal|transfer from|interest paid|direct dep|cashback|reimburse|zelle from|venmo from)\b/i;

  function cleanDesc(s) {
    s = s.replace(/\b(pos|debit|purchase|card|visa|eftpos|recurring|payment to|ach|ppd|web id:?\s*\w+)\b/gi, " ")
         .replace(/\bx{2,}\d+|\*+\d+|#\s?\d+|\b\d{4,}\b/gi, " ")
         .replace(/[|•·~_=<>{}\[\]]/g, " ")
         .replace(/\s{2,}/g, " ").trim().replace(/^[-–:,.*\s]+|[-–:,.*\s]+$/g, "");
    if (s && s === s.toUpperCase() && /[A-Z]{3}/.test(s)) s = s.toLowerCase().replace(/\b[a-z]/g, c => c.toUpperCase()).replace(/'S\b/g, "'s");
    return s.slice(0, 60);
  }
  const hasWords = s => /[a-z]{2,}/i.test(s);

  function parse(text, opts = {}) {
    const today = opts.today ? new Date(opts.today + "T12:00:00") : new Date();
    today.setHours(12, 0, 0, 0);
    const defCur = opts.currency || "USD";
    const lines = String(text).split(/\r?\n/).map(l => l.replace(/\s+/g, " ").trim()).filter(Boolean);
    const out = [];
    let curDate = null, lastText = [];
    for (const raw of lines) {
      if (SKIP.test(raw)) { lastText = []; continue; }
      const dt = findDate(raw, today);
      const amt = findAmount(raw);
      if (!amt) {
        if (dt) {
          curDate = dt.date;
          const rest = cleanDesc(raw.replace(dt.match, " "));
          lastText = rest && hasWords(rest) && !NOISE.test(rest) ? [rest] : [];
        } else if (hasWords(raw) && !NOISE.test(raw)) {
          lastText.push(raw); if (lastText.length > 2) lastText.shift();
        }
        continue;
      }
      if (amt.value <= 0 || amt.value > 1e6) continue;
      let rest = raw.replace(amt.match, " ");
      if (dt) rest = rest.replace(dt.match, " ");
      let desc = cleanDesc(rest);
      if (!hasWords(desc)) desc = cleanDesc(lastText.join(" ")) || "";
      if (!hasWords(desc)) desc = "Unknown";
      const income = amt.sign > 0 || (amt.sign === 0 && INCOME.test(raw + " " + lastText.join(" ")));
      out.push({ date: dt ? dt.date : (curDate || iso(today)), desc, amount: amt.value, kind: income ? "income" : "expense", currency: amt.currency || defCur });
      lastText = [];
    }
    return out;
  }

  // ---- categories ----
  const KEYWORDS = [
    ["Groceries", /safeway|trader joe|whole foods|costco|kroger|walmart|aldi|lucky|sprouts|smart ?& ?final|grocery|market|countdown|woolworths|new world|pak ?n ?save|foodstuffs|99 ranch|h ?mart|raley|nob hill|target.*grocery|instacart/i],
    ["Dining out", /restaurant|cafe|coffee|starbucks|peet|philz|blue bottle|mcdonald|burger|pizza|taco|chipotle|subway|sushi|ramen|thai|doordash|uber ?eats|grubhub|bar\b|pub\b|grill|kitchen|bakery|in-n-out|panera|boba|tea\b/i],
    ["Transport", /uber(?! ?eats)|lyft|chevron|shell|arco|exxon|mobil|76\b|valero|gas|fuel|parking|caltrain|bart|vta|clipper|toll|fastrak|z energy|bp\b|dmv|car wash|tesla supercharg/i],
    ["Subscriptions", /netflix|spotify|hulu|disney|apple\.com|icloud|youtube|prime video|amazon prime|max\.com|hbo|paramount|peacock|audible|patreon|chatgpt|openai|anthropic|claude|adobe|dropbox|google one|microsoft|xbox|playstation|nintendo|gym|fitness|planet fitness/i],
    ["Utilities", /pg&e|pge|electric|water|internet|comcast|xfinity|at&t|verizon|t-mobile|mint mobile|sewer|garbage|recology|power|energy|spark|one nz|2degrees/i],
    ["Housing", /rent|mortgage|landlord|property|hoa|apartment|realty|lease/i],
    ["Health", /pharmacy|cvs|walgreens|rite aid|doctor|dental|dentist|clinic|hospital|kaiser|medical|optometr|chemist/i],
    ["Shopping", /amazon|target|best buy|ikea|home depot|lowe|macy|nordstrom|uniqlo|nike|apple store|ebay|etsy|shein|kmart|warehouse/i],
    ["Entertainment", /cinema|amc|movie|theater|theatre|ticketmaster|stubhub|golf|bowling|concert|museum|steam|game/i],
    ["Travel", /airline|airways|united|delta|southwest|alaska air|air new zealand|qantas|hotel|airbnb|expedia|booking\.com|marriott|hilton/i],
  ];
  function merchantKey(desc) {
    return String(desc).toLowerCase().replace(/[^a-z& ]/g, " ").replace(/\s+/g, " ").trim().split(" ").slice(0, 3).join(" ");
  }
  function guessCategory(desc, kind, rules, categories) {
    if (kind === "income") return "Income";
    const key = merchantKey(desc);
    if (rules && rules[key] && (!categories || categories.includes(rules[key]))) return rules[key];
    for (const [cat, re] of KEYWORDS) if (re.test(desc) && (!categories || categories.includes(cat))) return cat;
    return categories && categories.includes("Other") ? "Other" : (categories ? categories[categories.length - 1] : "Other");
  }

  const api = { parse, findDate, findAmount, cleanDesc, merchantKey, guessCategory };
  if (typeof module !== "undefined") module.exports = api; else root.MDParse = api;
})(this);
