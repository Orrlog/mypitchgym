const { OpenAI } = require('openai');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const SALES_STYLES = {
  'consultative': 'Consultative Selling — should have asked diagnostic questions, understood needs before pitching, built trust through expertise.',
  'direct': 'Direct Response Selling — should have gotten to the point fast, stated value clearly, asked for the decision directly.',
  'neuro-engagement': 'Neuro-Engagement — should have asked questions that bypass resistance, helped prospect realize the problem, used feeling/finding/knowing patterns.',
  'challenger': 'Challenger Selling — should have challenged the prospect\'s worldview, taught something new, tailored the message, taken control.',
  'pain-first': 'Pain-First Qualification — should have uncovered pain before pitching, qualified hard, used upfront contracts.',
  'rapport': 'Rapport & Influence — should have mirrored language, paced and matched, used embedded commands, anchored positive emotions.',
  'linear': 'Linear Persuasion — should have kept prospect moving forward, built certainty step by step, looped back on resistance.'
};

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
    const { transcript, script, sales_style, product } = req.body;

    // Format transcript into readable conversation
    const transcriptText = (transcript || []).map(t => {
      const speaker = t.role === 'user' ? 'SALESPERSON' : 'PROSPECT';
      return `${speaker}: ${t.content}`;
    }).join('\n\n');

    // Format script for reference
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

    const styleDesc = SALES_STYLES[sales_style] || SALES_STYLES['consultative'];
    const channelText = SALES_CHANNELS[product?.sales_channel] || 'phone call';
    const difficulty = product?.difficulty || 'beginner';
    const coachingTone = difficulty === 'pro'
      ? 'Score strictly. Hold them to professional standards. A 7/10 means they were genuinely good. Do not inflate scores. Be direct about what was weak.'
      : 'Score generously. A 7/10 means they showed promise and have room to grow. Encourage effort, be constructive, but still honest about what needs work.';

    const systemPrompt = `You are an expert sales coach with 20+ years of experience training salespeople. You've just listened to a practice call and you're giving the salesperson feedback.

${coachingTone}

SALES STYLE THEY WERE USING:
${styleDesc}

SALES CHANNEL: ${channelText}
PRODUCT BEING SOLD:
${product?.product_name || 'Unknown'}
Price: ${product?.price_range || 'Not specified'}

THE SCRIPT THEY SHOULD HAVE FOLLOWED:
${scriptText}

THE ACTUAL CALL TRANSCRIPT:
${transcriptText}

Analyze this call and provide coaching. Be specific, honest, and constructive. Don't sugarcoat — real coaches don't. But also recognize what they did well.

Score the call 1-10 based on:
- Did they use the opener from the script?
- Did they ask discovery questions?
- Did they present benefits naturally?
- How well did they handle objections?
- Did they attempt to close?
- Did they follow the sales methodology they chose?

Respond as valid JSON only:
{
  "score": <number 1-10>,
  "summary": "<one sentence overall assessment>",
  "nailed": ["<specific thing they did well>", "<specific thing they did well>"],
  "missed": ["<specific thing they missed or did poorly>", "<specific thing they missed>"],
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
