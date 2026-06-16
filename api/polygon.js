// api/polygon.js — Vercel serverless function
// Proxies Polygon.io for: options chain, GEX, dark pool prints
//
// Setup: add POLYGON_API_KEY to your Vercel environment variables
// Free key at: https://polygon.io (free tier = 15-min delayed data, 5 req/min)
//
// Endpoints this file handles (via ?type= param):
//   ?type=options   → options chain snapshot (for GEX calc)
//   ?type=darkpool  → recent dark pool / off-exchange prints
//   ?type=quote     → real-time quote + pre/after market

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const apiKey = process.env.POLYGON_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'POLYGON_API_KEY not configured in Vercel env vars' });
  }

  const { type = 'quote', ticker = 'TSLA', limit = 50 } = req.query;

  try {
    let url;

    if (type === 'options') {
      // Options chain snapshot — used to calculate Gamma Exposure (GEX)
      // Returns all active TSLA options contracts with Greeks
      url = `https://api.polygon.io/v3/snapshot/options/${ticker}?limit=${limit}&apiKey=${apiKey}`;

    } else if (type === 'darkpool') {
      // Last-sale trades feed — off-exchange (dark pool) prints show up as
      // exchange codes: D (FINRA ADF), V (IEX), etc.
      const today = new Date().toISOString().split('T')[0];
      url = `https://api.polygon.io/v3/trades/${ticker}?timestamp.gte=${today}&limit=200&sort=timestamp&order=desc&apiKey=${apiKey}`;

    } else {
      // Real-time quote with pre/after-market data
      url = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/${ticker}?apiKey=${apiKey}`;
    }

    const response = await fetch(url);
    const data = await response.json();

    if (type === 'darkpool' && data.results) {
      // Filter for off-exchange prints (dark pools / ATS)
      // Polygon exchange codes: 4=FINRA ADF, 36=IEX hidden, 26=MEMX dark, etc.
      const darkPoolExchanges = new Set([4, 17, 26, 36, 62, 63, 64]);
      const darkPrints = data.results.filter(t => darkPoolExchanges.has(t.exchange));

      const totalVolume = darkPrints.reduce((s, t) => s + (t.size || 0), 0);
      const largestPrint = darkPrints.reduce((max, t) => t.size > (max?.size || 0) ? t : max, null);
      const avgPrice = darkPrints.length
        ? (darkPrints.reduce((s, t) => s + t.price * t.size, 0) / totalVolume).toFixed(2)
        : null;

      return res.status(200).json({
        ticker,
        darkPoolPrints: darkPrints.slice(0, 20),
        summary: {
          totalDarkVolume: totalVolume,
          printCount: darkPrints.length,
          avgDarkPrice: avgPrice,
          largestPrint: largestPrint ? { price: largestPrint.price, size: largestPrint.size } : null,
        }
      });
    }

    if (type === 'options' && data.results) {
      // Calculate Gamma Exposure (GEX)
      // GEX = gamma × open_interest × 100 shares per contract
      // Positive GEX → dealers stabilise price (buy dips)
      // Negative GEX → dealers amplify moves (sell drops)
      let totalCallGEX = 0;
      let totalPutGEX = 0;
      const byStrike = {};

      for (const contract of data.results) {
        const d = contract.details || {};
        const g = contract.greeks || {};
        const gamma = g.gamma || 0;
        const oi = contract.open_interest || 0;
        const strike = d.strike_price;
        const contractType = d.contract_type;
        const gex = gamma * oi * 100;

        if (contractType === 'call') totalCallGEX += gex;
        else totalPutGEX -= gex;

        if (strike) {
          if (!byStrike[strike]) byStrike[strike] = { call: 0, put: 0, net: 0 };
          if (contractType === 'call') byStrike[strike].call += gex;
          else byStrike[strike].put -= gex;
          byStrike[strike].net = byStrike[strike].call + byStrike[strike].put;
        }
      }

      const netGEX = totalCallGEX + totalPutGEX;
      const strikes = Object.entries(byStrike).map(([k, v]) => ({ strike: +k, ...v }));
      const callWall = strikes.reduce((max, s) => s.call > (max?.call || 0) ? s : max, null);
      const putWall = strikes.reduce((min, s) => s.put < (min?.put || 0) ? s : min, null);

      return res.status(200).json({
        ticker,
        gex: {
          net: netGEX.toFixed(2),
          calls: totalCallGEX.toFixed(2),
          puts: totalPutGEX.toFixed(2),
          bias: netGEX > 0
            ? 'POSITIVE — dealers stabilise price (buy dips)'
            : 'NEGATIVE — dealers amplify moves (sell drops)',
          callWall: callWall?.strike,
          putWall: putWall?.strike,
        },
        topStrikes: strikes
          .sort((a, b) => Math.abs(b.net) - Math.abs(a.net))
          .slice(0, 10),
      });
    }

    return res.status(200).json(data);

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
