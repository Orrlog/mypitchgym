const { OpenAI } = require('openai');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const SALES_CHANNELS = {
  'phone': 'phone call',
  'in_person': 'in-person walk-in',
  'door': 'door-to-door'
};

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { transcript, script, product } = req.body;

    const transcriptText = (transcript || []).map(t => {
      const speaker = t.role === 'user' ? 'SALESPERSON' : 'PROSPECT';
      return `${speaker}: ${t.content}`;
    }).join('\n\n');

    let scriptText = '';
    if (script) {
      if (typeof script === 'string') {
        scriptText = script;
      } else if (script.full_script) {
        scriptText = script.full_script;
      } else {
        scriptText = Object.entries(script)
          .map(([k, v]) => `${k.toUpperCase()}: ${v}`)
          .join('\n\n');
      }
    }

    const channelText = SALES_CHANNELS[product?.sales_channel] || 'phone call';
    const difficulty = product?.difficulty || 'beginner';
    const coachingTone = difficulty === 'pro'
      ? 'Score strictly. Hold them to professional standards. A 7/10 means they were genuinely good. Do not inflate scores. Be direct about what was weak.'
      : 'Score fairly but constructively. A 7/10 means they showed promise. Be honest about what needs work but recognize effort.';

    const systemPrompt = `You are an expert sales coach with 20+ years of experience training salespeople. You've just listened to a practice call and you're giving the salesperson feedback.

${coachingTone}

SALES CHANNEL: ${channelText}
PRODUCT BEING SOLD:
${product?.product_name || 'Unknown'}
Price: ${product?.price_range || 'Not specified'}

THE SCRIPT THEY WERE FOLLOWING (if provided):
${scriptText || 'No script provided. Evaluate based on general sales best practices.'}

THE ACTUAL CALL TRANSCRIPT:
${transcriptText}

Analyze this call and provide coaching. Be specific, honest, and constructive. Don't sugarcoat -- real coaches don't. But also recognize what they did well.

Score the call 1-10 based on:
- Did they open with a strong hook?
- Did they ask discovery questions before pitching?
- Did they present benefits that matched the prospect's needs?
- How well did they handle objections?
- Did they attempt to close or move to next steps?
- Did they maintain control of the conversation?
- Did they sound natural and confident?

Respond as valid JSON only:
{
  "score": <number 1-10>,
  "summary": "<one sentence overall assessment>",
  "nailed": ["<specific thing they did well>", "<specific thing they did well>"],
  "missed": ["<specific thing they missed or did poorly - be specific about which part of the call>", "<specific thing they missed>"],
  "objection_handling": "<assessment of how they handled objections, 1-2 sentences>",
  "tips": ["<specific actionable tip for next time>", "<specific actionable tip>", "<specific actionable tip>"]
}`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: 'Coach me on this call.' }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.5,
      max_tokens: 800
    });

    const coaching = JSON.parse(response.choices[0].message.content);

    return res.status(200).json(coaching);
  } catch (error) {
    console.error('Coach error:', error);
    return res.status(500).json({ error: 'Failed to generate coaching feedback. Please try again.' });
  }
};
