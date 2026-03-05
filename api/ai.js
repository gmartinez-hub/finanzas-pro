export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  const claudeKey = (process.env.ANTHROPIC_API_KEY || "").trim();
  const geminiKey = (process.env.GEMINI_API_KEY || "").trim();

  // GET = diagnostic
  if (req.method === "GET") {
    return res.status(200).json({
      status: "ok",
      claude: { available: claudeKey.length > 0, prefix: claudeKey.slice(0, 10) + "..." },
      gemini: { available: geminiKey.length > 0, prefix: geminiKey.slice(0, 8) + "..." },
      priority: claudeKey ? "claude" : geminiKey ? "gemini" : "none",
      timestamp: new Date().toISOString(),
    });
  }

  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  let body = req.body;
  if (typeof body === "string") body = JSON.parse(body);
  if (!body?.messages?.length)
    return res.status(400).json({ error: "messages array required" });

  // --- TRY CLAUDE FIRST ---
  if (claudeKey) {
    const result = await tryClaude(body, claudeKey);
    if (result.ok) return res.status(200).json(result.data);
    console.error("Claude failed:", result.status, result.error);
  }

  // --- FALLBACK TO GEMINI ---
  if (geminiKey) {
    const result = await tryGemini(body, geminiKey);
    if (result.ok) return res.status(200).json(result.data);
    console.error("Gemini failed:", result.status, result.error);
    return res.status(result.status || 502).json({ error: result.error });
  }

  return res.status(500).json({ error: "No AI provider configured" });
}

// ==================== CLAUDE ====================
async function tryClaude(body, apiKey) {
  try {
    const payload = {
      model: body.model || "claude-sonnet-4-5-20250929",
      max_tokens: body.max_tokens || 1500,
      messages: body.messages,
    };
    if (body.system && typeof body.system === "string" && body.system.trim()) {
      payload.system = body.system.trim();
    }

    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(payload),
    });

    const text = await r.text();
    if (!r.ok) return { ok: false, status: r.status, error: text.slice(0, 300) };

    const data = JSON.parse(text);

    // Return in standard format with token tracking
    return {
      ok: true,
      data: {
        content: data.content,
        _provider: "claude",
        _model: data.model,
        _tokens: {
          input: data.usage?.input_tokens || 0,
          output: data.usage?.output_tokens || 0,
          total: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
        },
      },
    };
  } catch (err) {
    return { ok: false, status: 500, error: err.message };
  }
}

// ==================== GEMINI ====================
async function tryGemini(body, apiKey) {
  try {
    // Convert Anthropic message format → Gemini
    const contents = body.messages.map((msg) => {
      const role = msg.role === "assistant" ? "model" : "user";
      const parts = [];
      if (typeof msg.content === "string") {
        parts.push({ text: msg.content });
      } else if (Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if (block.type === "text") parts.push({ text: block.text });
          else if (block.type === "image" && block.source) {
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

    const geminiPayload = {
      contents,
      generationConfig: { maxOutputTokens: 4096, temperature: 0.3 },
    };
    if (body.system && typeof body.system === "string" && body.system.trim()) {
      geminiPayload.systemInstruction = { parts: [{ text: body.system.trim() }] };
    }

    const model = "gemini-2.5-flash";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(geminiPayload),
    });

    const text = await r.text();
    if (!r.ok) return { ok: false, status: r.status, error: text.slice(0, 300) };

    const data = JSON.parse(text);
    const finishReason = data.candidates?.[0]?.finishReason;

    let outputText = data.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
    outputText = outputText.replace(/^```json\s*/i, "").replace(/\s*```$/i, "").trim();

    if (finishReason === "MAX_TOKENS" && outputText.includes("{")) {
      outputText = tryRepairJSON(outputText);
    }

    const usage = data.usageMetadata || {};

    // Return in Anthropic-compatible format
    return {
      ok: true,
      data: {
        content: [{ type: "text", text: outputText }],
        _provider: "gemini",
        _model: model,
        _tokens: {
          input: usage.promptTokenCount || 0,
          output: usage.candidatesTokenCount || 0,
          total: usage.totalTokenCount || 0,
        },
      },
    };
  } catch (err) {
    return { ok: false, status: 500, error: err.message };
  }
}

// ==================== JSON REPAIR ====================
function tryRepairJSON(text) {
  text = text.replace(/,\s*"[^"]*":\s*"[^"]*$/s, "");
  text = text.replace(/,\s*"[^"]*$/, "");
  text = text.replace(/,\s*\{[^}]*$/s, "");

  let braces = 0, brackets = 0, inStr = false, esc = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (esc) { esc = false; continue; }
    if (c === "\\") { esc = true; continue; }
    if (c === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (c === "{") braces++;
    if (c === "}") braces--;
    if (c === "[") brackets++;
    if (c === "]") brackets--;
  }

  let suffix = "";
  while (brackets > 0) { suffix += "]"; brackets--; }
  while (braces > 0) { suffix += "}"; braces--; }

  const repaired = text + suffix;
  try { JSON.parse(repaired); return repaired; } catch { return text; }
}
