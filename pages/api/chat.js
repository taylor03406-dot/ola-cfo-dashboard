export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { messages, system, max_tokens } = req.body;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Missing API key' });
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: max_tokens || 1000,
        system: (system || '') + ' IMPORTANT: Do not use markdown formatting, asterisks, or bold text. Plain text only. Always use the Thai Baht symbol ฿ (not B or THB) before all amounts.',
        messages
      })
    });
    const data = await response.json();
    if (data.content && data.content[0] && data.content[0].text) {
      data.content[0].text = data.content[0].text
        .replace(/\*\*/g, '')
        .replace(/\*/g, '')
        .replace(/\bB(\d)/g, '฿$1')
        .replace(/\bTHB\s*/g, '฿');
    }
    res.status(200).json(data);
  } catch (e) {
    res.status(500).json({ error: 'Failed' });
  }
}
