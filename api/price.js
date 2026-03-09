export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");

  if (req.method === "OPTIONS") return res.status(200).end();

  const { ticker } = req.query;
  if (!ticker) return res.status(400).json({ error: "ticker required" });

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
      ticker
    )}?range=1d&interval=1d`;

    const r = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "application/json",
        "Accept-Language": "en-US,en;q=0.9",
        Referer: "https://finance.yahoo.com",
      },
    });

    if (!r.ok) {
      // Fallback a query2
      const r2 = await fetch(
        `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=1d&interval=1d`,
        {
          headers: {
            "User-Agent": "Mozilla/5.0",
            Accept: "application/json",
          },
        }
      );
      if (!r2.ok)
        return res.status(404).json({ error: `Ticker ${ticker} no encontrado` });
      const d2 = await r2.json();
      const result2 = d2.chart?.result?.[0];
      if (!result2) return res.status(404).json({ error: "Sin datos" });
      return res.json({
        price: result2.meta.regularMarketPrice,
        previousClose: result2.meta.previousClose,
        currency: result2.meta.currency,
        symbol: result2.meta.symbol,
        name: result2.meta.shortName || ticker,
      });
    }

    const d = await r.json();
    const result = d.chart?.result?.[0];

    if (!result || !result.meta?.regularMarketPrice) {
      return res.status(404).json({ error: `Ticker ${ticker} no encontrado` });
    }

    return res.json({
      price: result.meta.regularMarketPrice,
      previousClose: result.meta.previousClose,
      currency: result.meta.currency,
      symbol: result.meta.symbol,
      name: result.meta.shortName || ticker,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
