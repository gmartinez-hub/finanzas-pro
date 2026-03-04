export const config = { maxDuration: 30 };

// Translates Anthropic-format requests from the frontend into Gemini API calls.
// The frontend doesn't need ANY changes.

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  // GET = diagnostic
  if (req.method === "GET") {
    const key = (process.env.GEMINI_API_KEY || "").trim();
    return res.status(200).json({
      status: "ok",
      provider: "gemini",
      hasKey: key.length > 0,
      keyPrefix: key.slice(0, 8) + "...",
      keyLength: key.length,
      timestamp: new Date().toISOString(),
    });
  }

  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  const apiKey = (process.env.GEMINI_API_KEY || "").trim();
  if (!apiKey)
    return res.status(500).json({ error: "GEMINI_API_KEY not configured" });

  try {
    let body = req.body;
    if (typeof body === "string") body = JSON.parse(body);

    if (!body || !body.messages || !Array.isArray(body.messages))
      return res.status(400).json({ error: "messages array required" });

    // --- Convert Anthropic format → Gemini format ---

    // Convert messages
    const contents = body.messages.map((msg) => {
      const role = msg.role === "assistant" ? "model" : "user";
      const parts = [];

      if (typeof msg.content === "string") {
        parts.push({ text: msg.content });
      } else if (Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if (block.type === "text") {
            parts.push({ text: block.text });
          } else if (block.type === "image" && block.source) {
            parts.push({
              inlineData: {
                mimeType: block.source.media_type || "image/png",
                data: block.source.data,
              },
            });
          }
        }
      }

      return { role, parts };
    });

    // Build Gemini payload
    const geminiPayload = {
      contents,
      generationConfig: {
        maxOutputTokens: body.max_tokens || 1500,
        temperature: 0.3,
      },
    };

    // System instruction
    if (body.system && typeof body.system === "string" && body.system.trim()) {
      geminiPayload.systemInstruction = {
        parts: [{ text: body.system.trim() }],
      };
    }

    // Use gemini-1.5-flash-latest (free tier, fast, good)
    const model = "gemini-1.5-flash-latest";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const geminiRes = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(geminiPayload),
    });

    const geminiText = await geminiRes.text();

    if (!geminiRes.ok) {
      console.error("Gemini error:", geminiRes.status, geminiText.slice(0, 500));
      return res.status(geminiRes.status).json({
        error: "Gemini API error",
        status: geminiRes.status,
        detail: geminiText.slice(0, 500),
      });
    }

    const geminiData = JSON.parse(geminiText);

    // --- Convert Gemini response → Anthropic format ---
    // So the frontend works without any changes
    const outputText =
      geminiData.candidates?.[0]?.content?.parts
        ?.map((p) => p.text || "")
        .join("") || "";

    return res.status(200).json({
      content: [{ type: "text", text: outputText }],
    });
  } catch (err) {
    console.error("Proxy error:", err);
    return res.status(500).json({ error: err.message });
  }
}
