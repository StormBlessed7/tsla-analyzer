// api/polygon.js — Vercel serverless function
// Uses Yahoo Finance options API (free, no API key required)
// Auth flow: fc.yahoo.com → A3 cookie → crumb → options data

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// Module-level session cache (reused across warm invocations)
let _a3 = null;
let _crumb = null;
let _sessionTs = 0;
const TTL = 45 * 60 * 1000; // 45 minutes

async function getSession() {
  if (_crumb && Date.now() - _sessionTs < TTL) return { a3: _a3, crumb: _crumb };

  // Step 1: fc.yahoo.com issues the A3 session cookie
  const fcRes = await fetch('https://fc.yahoo.com', { headers: { 'User-Agent': UA } });
  const setCookie = fcRes.headers.get('set-cookie') || '';
  const a3Match = setCookie.match(/A3=([^;]+)/);
  if (!a3Match) throw new Error('Could not obtain Yahoo session cookie');
  const a3 = a3Match[1];

  // Step 2: get CSRF crumb
  const crumbRes = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', {
    headers: { 'User-Agent': UA, 'Cookie': `A3=${a3}` }
  });
  const crumb = (await crumbRes.text()).trim();
  if (!crumb || crumb.includes('{')) throw new Error('Could not obtain Yahoo crumb');

  _a3 = a3;
  _crumb = crumb;
  _sessionTs = Date.now();
  return { a3, crumb };
}

async function yahooOptions(ticker) {
  const { a3, crumb } = await getSession();
  const url = `https://query2.finance.yahoo.com/v7/finance/options/${encodeURIComponent(ticker)}?crumb=${encodeURIComponent(crumb)}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, 'Cookie': `A3=${a3}` }
  });
  const data = await res.json();

  const result = data?.optionChain?.result?.[0];
  if (!result) throw new Error(`No options data for ${ticker}`);

  const expiry = result.options?.[0];
  const calls = expiry?.calls || [];
  const puts  = expiry?.puts  || [];

  // Normalize to shared contract shape
  const mapC = (c, type) => ({
    details: {
      contract_type: type,
      strike_price: c.strike,
      expiration_date: new Date(c.expiration * 1000).toISOString().split('T')[0],
    },
    day: { volume: c.volume || 0, vwap: c.lastPrice || 0 },
    open_interest: c.openInterest || 0,
    inTheMoney: c.inTheMoney || false,
  });

  return {
    calls: calls.map(c => mapC(c, 'call')),
    puts:  puts.map(p => mapC(p, 'put')),
  };
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { type = 'options', ticker = 'TSLA' } = req.query;

  try {
    const { calls, puts } = await yahooOptions(ticker);
    const all = [...calls, ...puts];

    // ── type=options: P/C sentiment + call/put walls ───────────
    if (type === 'options') {
      const callVol = calls.reduce((s, c) => s + c.day.volume, 0);
      const putVol  = puts.reduce((s, p)  => s + p.day.volume, 0);
      const pcRatio = (putVol / (callVol || 1)).toFixed(2);
      const callHeavy = callVol >= putVol;

      const callWall = calls.reduce((max, c) => c.open_interest > (max?.open_interest||0) ? c : max, null);
      const putWall  = puts.reduce((max, p)  => p.open_interest > (max?.open_interest||0) ? p : max, null);

      return res.status(200).json({
        ticker,
        gex: {
          net: (callVol - putVol).toFixed(0),
          bias: callHeavy
            ? `BULLISH — P/C ratio ${pcRatio} (calls dominate)`
            : `BEARISH — P/C ratio ${pcRatio} (puts dominate)`,
          callWall: callWall?.details?.strike_price,
          putWall:  putWall?.details?.strike_price,
          pcRatio,
          callVol,
          putVol,
        },
        results: all,
      });
    }

    // ── type=darkpool: top OI contracts (institutional positioning)
    if (type === 'darkpool') {
      const sorted = [...all].sort((a, b) => b.open_interest - a.open_interest).slice(0, 20);
      const totalOI = all.reduce((s, c) => s + c.open_interest, 0);
      const top = sorted[0];

      return res.status(200).json({
        ticker,
        prints: sorted.map(c => ({
          contractType: c.details.contract_type.toUpperCase(),
          strike:  c.details.strike_price,
          expiry:  c.details.expiration_date,
          oi:      c.open_interest,
          inTheMoney: c.inTheMoney,
        })),
        summary: {
          totalOI,
          topStrike: top?.details?.strike_price ?? null,
          topType:   top?.details?.contract_type?.toUpperCase() ?? null,
          topOI:     top?.open_interest ?? null,
        },
      });
    }

    return res.status(200).json({ ticker, results: all });

  } catch (err) {
    // If session expired, clear cache so next call re-authenticates
    if (err.message.includes('crumb') || err.message.includes('cookie')) {
      _crumb = null; _a3 = null; _sessionTs = 0;
    }
    return res.status(500).json({ error: err.message });
  }
};
