module.exports = function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.json({ token: process.env.FINNHUB_API_KEY || '' });
};
