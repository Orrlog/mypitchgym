const { OpenAI } = require('openai');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { script, original_script, product } = req.body;

    // Combine into a single text representation for analysis
    let scriptText = '';
    if (original_script) {
      scriptText = original_script;
    } else if (typeof script === 'string') {
      scriptText = script;
    } else if (script && typeof script === 'object') {
      scriptText = Object.entries(script)
        .map(([k, v]) => `${k.toUpperCase()}: ${v}`)
        .join('\n\n');
    }

    const systemPrompt = `You are an expert sales script doctor. You take existing sales scripts and make them sharper, more persuasive, and more natural.

Analyze this script and rewrite it with improvements. Focus on:

1. HOOKS — Strengthen the opener. Make it more attention-grabbing. Give it a better angle that makes the prospect want to keep listening.
2. ANGLES — Reframe the pitch around a stronger angle. What's the most compelling way to position this product?
3. OBJECTION HANDLING — Tighten every objection response. Make them shorter, more natural, and more effective.
4. DISCOVERY — Improve the questions. Make them more incisive and harder to deflect.
5. CLOSE — Make the close cleaner and more natural. Less pushy, more confident.

PRODUCT CONTEXT: ${product ? product.product_name : 'Not specified'}
SALES STYLE: ${product ? product.sales_style : 'consultative'}

HERE IS THE ORIGINAL SCRIPT TO IMPROVE:
${scriptText}

Rewrite the entire script with your improvements. Keep the same 5-section structure:
1. OPENER
2. DISCOVERY
3. BENEFITS
4. OBJECTION_HANDLING
5. CLOSE

Also provide a brief summary of what you changed and why.

Respond as valid JSON only:
{
  "improved_script": "The full rewritten script as plain text, with section headers",
  "changes_summary": "2-3 sentences on what was improved and why",
  "improved_script_parsed": {
    "opener": "...",
    "discovery": "...",
    "benefits": "...",
    "objection_handling": "...",
    "close": "..."
  }
}`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: 'Improve my script.' }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.8,
      max_tokens: 2000
    });

    const result = JSON.parse(response.choices[0].message.content);

    return res.status(200).json(result);
  } catch (error) {
    console.error('Improve script error:', error);
    return res.status(500).json({ error: 'Failed to improve script. Please try again.' });
  }
};
