export const config = {
  maxDuration: 30,
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('ANTHROPIC_API_KEY not set');
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });
  }

  try {
    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch { return res.status(400).json({ error: 'Invalid JSON body' }); }
    }
    if (!body || !body.messages) {
      return res.status(400).json({ error: 'Missing messages in request body' });
    }

    const payload = {
      model: body.model || 'claude-sonnet-4-20250514',
      max_tokens: body.max_tokens || 1500,
      messages: body.messages,
    };

    if (body.system && typeof body.system === 'string' && body.system.trim()) {
      payload.system = body.system.trim();
    }

    console.log('Proxy -> Anthropic:', JSON.stringify({ model: payload.model, msgCount: payload.messages.length, hasSystem: !!payload.system }));

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(payload),
    });

    const responseText = await response.text();

    if (!response.ok) {
      console.error('Anthropic error:', response.status, responseText.slice(0, 500));
      return res.status(response.status).json({
        error: responseText,
        anthropicStatus: response.status,
      });
    }

    const data = JSON.parse(responseText);
    return res.status(200).json(data);
  } catch (err) {
    console.error('Proxy crash:', err.message);
    return res.status(500).json({ error: 'Proxy error: ' + err.message });
  }
}
