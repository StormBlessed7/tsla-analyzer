module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const { q } = req.query;
  if (!q) return res.status(400).json({ error: 'q required' });
  try {
    const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=6&newsCount=0&enableFuzzyQuery=false`;
    const r = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Accept': 'application/json' }
    });
    const data = await r.json();
    const quotes = (data?.quotes || [])
      .filter(q => ['EQUITY', 'ETF', 'INDEX'].includes(q.quoteType))
      .slice(0, 5)
      .map(q => ({ symbol: q.symbol, name: q.shortname || q.longname || q.symbol, type: q.quoteType }));
    return res.status(200).json({ quotes });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
