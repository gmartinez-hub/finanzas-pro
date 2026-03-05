export const config = { maxDuration: 60 };

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
      model: "gemini-2.5-flash",
      hasKey: key.length > 0,
      keyPrefix: key.slice(0, 8) + "...",
      keyLength: key.length,
      maxOutputTokens: 8192,
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

    // --- Convert Anthropic message format → Gemini format ---
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

    // Use 8192 tokens minimum — Gemini counts tokens differently than Claude,
    // and financial JSON responses are verbose. The frontend sends 1500 which
    // was fine for Claude but causes truncation on Gemini.
    const maxTokens = Math.max(body.max_tokens || 1500, 4096);

    const geminiPayload = {
      contents,
      generationConfig: {
        maxOutputTokens: maxTokens,
        temperature: 0.3,
      },
    };

    // System instruction
    if (body.system && typeof body.system === "string" && body.system.trim()) {
      geminiPayload.systemInstruction = {
        parts: [{ text: body.system.trim() }],
      };
    }

    const model = "gemini-2.5-flash";
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

    // Check if response was truncated
    const finishReason = geminiData.candidates?.[0]?.finishReason;
    if (finishReason === "MAX_TOKENS") {
      console.warn("Gemini response truncated (MAX_TOKENS)");
    }

    // Extract text from response
    let outputText =
      geminiData.candidates?.[0]?.content?.parts
        ?.map((p) => p.text || "")
        .join("") || "";

    // Clean markdown fences that Gemini sometimes adds
    outputText = outputText.replace(/^```json\s*/i, "").replace(/\s*```$/i, "").trim();

    // If the response looks like truncated JSON, try to repair it
    if (finishReason === "MAX_TOKENS" && outputText.includes("{")) {
      outputText = tryRepairJSON(outputText);
    }

    // Return in Anthropic response format so frontend works unchanged
    return res.status(200).json({
      content: [{ type: "text", text: outputText }],
    });
  } catch (err) {
    console.error("Proxy error:", err);
    return res.status(500).json({ error: err.message });
  }
}

// Attempts to close truncated JSON by balancing braces/brackets
function tryRepairJSON(text) {
  // Strip any trailing incomplete string value
  // e.g. ..."thesis": "Some text that got cu
  text = text.replace(/,\s*"[^"]*":\s*"[^"]*$/s, "");
  text = text.replace(/,\s*"[^"]*$/, "");

  let braces = 0;
  let brackets = 0;
  let inString = false;
  let escape = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (escape) { escape = false; continue; }
    if (c === "\\") { escape = true; continue; }
    if (c === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (c === "{") braces++;
    if (c === "}") braces--;
    if (c === "[") brackets++;
    if (c === "]") brackets--;
  }

  // Close open arrays and objects
  let suffix = "";
  while (brackets > 0) { suffix += "]"; brackets--; }
  while (braces > 0) { suffix += "}"; braces--; }

  const repaired = text + suffix;

  // Verify it actually parses
  try {
    JSON.parse(repaired);
    return repaired;
  } catch {
    return text; // Return original if repair failed
  }
}
