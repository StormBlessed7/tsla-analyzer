// api/polygon.js — Vercel serverless function
// Uses Yahoo Finance options API (free, no API key required)
// Panels: Options Sentiment (P/C ratio, walls), Institutional OI, Unusual Flow

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { type = 'options', ticker = 'TSLA' } = req.query;

  try {
    const url = `https://query2.finance.yahoo.com/v7/finance/options/${encodeURIComponent(ticker)}`;
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    });
    const data = await response.json();

    const result = data?.optionChain?.result?.[0];
    if (!result) return res.status(200).json({ error: `No options data for ${ticker}` });

    const expiry = result.options?.[0];
    const calls = expiry?.calls || [];
    const puts  = expiry?.puts  || [];

    // Normalize to shared contract format
    const mapContract = (c, contractType) => ({
      details: {
        contract_type: contractType,
        strike_price: c.strike,
        expiration_date: new Date(c.expiration * 1000).toISOString().split('T')[0],
      },
      day: { volume: c.volume || 0, vwap: c.lastPrice || 0 },
      open_interest: c.openInterest || 0,
      inTheMoney: c.inTheMoney || false,
    });

    const allContracts = [
      ...calls.map(c => mapContract(c, 'call')),
      ...puts.map(p => mapContract(p, 'put')),
    ];

    // Sentiment metrics
    const callVol  = calls.reduce((s, c) => s + (c.volume || 0), 0);
    const putVol   = puts.reduce((s, p) => s + (p.volume || 0), 0);
    const pcRatio  = (putVol / (callVol || 1)).toFixed(2);
    const callHeavy = callVol >= putVol;

    const callWall = calls.reduce((max, c) => (c.openInterest||0) > (max?.openInterest||0) ? c : max, null);
    const putWall  = puts.reduce((max, p)  => (p.openInterest||0) > (max?.openInterest||0) ? p : max, null);

    // ── type=options: sentiment + contracts for flow analysis ──
    if (type === 'options') {
      return res.status(200).json({
        ticker,
        gex: {
          net: (callVol - putVol).toFixed(0),
          bias: callHeavy
            ? `BULLISH — P/C ratio ${pcRatio} (calls dominate)`
            : `BEARISH — P/C ratio ${pcRatio} (puts dominate)`,
          callWall: callWall?.strike,
          putWall: putWall?.strike,
          pcRatio,
          callVol,
          putVol,
        },
        results: allContracts,
      });
    }

    // ── type=darkpool: top OI contracts (institutional positioning) ──
    if (type === 'darkpool') {
      const topOI = [...allContracts]
        .sort((a, b) => b.open_interest - a.open_interest)
        .slice(0, 20);

      const totalOI = allContracts.reduce((s, c) => s + c.open_interest, 0);
      const top = topOI[0];

      const prints = topOI.map(c => ({
        contractType: c.details.contract_type.toUpperCase(),
        strike: c.details.strike_price,
        expiry: c.details.expiration_date,
        oi: c.open_interest,
        inTheMoney: c.inTheMoney,
      }));

      return res.status(200).json({
        ticker,
        prints,
        summary: {
          totalOI,
          topStrike: top?.details?.strike_price ?? null,
          topType: top?.details?.contract_type?.toUpperCase() ?? null,
          topOI: top?.open_interest ?? null,
        },
      });
    }

    return res.status(200).json({ ticker, results: allContracts });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
