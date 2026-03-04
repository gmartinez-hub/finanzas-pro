export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  // GET = diagnostic endpoint
  if (req.method === "GET") {
    const key = (process.env.ANTHROPIC_API_KEY || "").trim();
    return res.status(200).json({
      status: "ok",
      hasKey: key.length > 0,
      keyPrefix: key.slice(0, 10) + "...",
      keyLength: key.length,
      nodeVersion: process.version,
      timestamp: new Date().toISOString(),
    });
  }

  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  const apiKey = (process.env.ANTHROPIC_API_KEY || "").trim();
  if (!apiKey)
    return res.status(500).json({ error: "ANTHROPIC_API_KEY not configured" });

  try {
    let body = req.body;
    if (typeof body === "string") {
      body = JSON.parse(body);
    }

    if (!body || !body.messages || !Array.isArray(body.messages)) {
      return res.status(400).json({
        error: "Invalid request: messages array required",
        receivedKeys: body ? Object.keys(body) : "null body",
      });
    }

    const payload = {
      model: body.model || "claude-sonnet-4-5-20250929",
      max_tokens: body.max_tokens || 1500,
      messages: body.messages,
    };

    if (body.system && typeof body.system === "string" && body.system.trim()) {
      payload.system = body.system.trim();
    }

    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(payload),
    });

    const text = await anthropicRes.text();

    if (!anthropicRes.ok) {
      console.error("Anthropic", anthropicRes.status, text.slice(0, 500));
      return res.status(anthropicRes.status).json({
        error: "Anthropic API error",
        status: anthropicRes.status,
        detail: text.slice(0, 500),
      });
    }

    return res.status(200).json(JSON.parse(text));
  } catch (err) {
    console.error("Proxy error:", err);
    return res.status(500).json({ error: err.message });
  }
}
