export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();

  const { ticker } = req.query;
  if (!ticker) return res.status(400).json({ error: "ticker required" });

  const yahooResult = await tryYahoo(ticker);
  if (yahooResult) return res.json(yahooResult);

  const twelveResult = await tryTwelveData(ticker);
  if (twelveResult) return res.json(twelveResult);

  return res.status(404).json({ error: `No se encontró precio para ${ticker}` });
}

async function tryYahoo(ticker) {
  const urls = [
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=1d&interval=1d`,
    `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=1d&interval=1d`,
  ];
  for (const url of urls) {
    try {
      const r = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          "Accept": "application/json",
          "Accept-Language": "en-US,en;q=0.9",
          "Referer": "https://finance.yahoo.com",
        },
        signal: AbortSignal.timeout(5000),
      });
      if (!r.ok) continue;
      const d = await r.json();
      const result = d.chart?.result?.[0];
      if (!result?.meta?.regularMarketPrice) continue;
      return {
        price: result.meta.regularMarketPrice,
        previousClose: result.meta.previousClose,
        currency: result.meta.currency,
        symbol: result.meta.symbol,
        name: result.meta.shortName || ticker,
        source: "yahoo",
      };
    } catch { continue; }
  }
  return null;
}

async function tryTwelveData(ticker) {
  // 800 calls/día gratis. Para key propia: agregar TWELVE_DATA_API_KEY en Vercel env vars
  const apiKey = process.env.TWELVE_DATA_API_KEY || "demo";
  try {
    const r = await fetch(
      `https://api.twelvedata.com/price?symbol=${encodeURIComponent(ticker)}&apikey=${apiKey}`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (!r.ok) return null;
    const d = await r.json();
    if (d.status === "error" || !d.price) return null;
    const price = parseFloat(d.price);
    if (!price || isNaN(price)) return null;
    return {
      price,
      previousClose: null,
      currency: ticker.endsWith(".BA") ? "ARS" : "USD",
      symbol: ticker,
      name: ticker,
      source: "twelve_data",
    };
  } catch { return null; }
}
