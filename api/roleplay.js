const { OpenAI } = require('openai');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const SALES_STYLES = {
  'consultative': 'Consultative Selling — ask diagnostic questions, understand needs before presenting, build trust through expertise.',
  'direct': 'Direct Response Selling — get to the point fast, state value clearly, build a value stack, ask for the decision.',
  'neuro-engagement': 'Neuro-Engagement — ask questions that bypass resistance, help prospect realize the problem themselves, use feeling/finding/knowing patterns.',
  'challenger': 'Challenger Selling — challenge worldview, teach something new, tailor the message, take control.',
  'pain-first': 'Pain-First Qualification — uncover pain before pitching, qualify hard, use upfront contracts.',
  'rapport': 'Rapport & Influence — mirror language, pace and match, use embedded commands, anchor positive emotions.',
  'linear': 'Linear Persuasion — keep prospect moving forward, build certainty step by step, loop back on resistance.'
};

const CUSTOMER_TYPES = {
  'skeptic': 'You are deeply skeptical. You question every claim. You want proof, data, case studies. You\'ve heard pitches like this before and you\'re not impressed. You say things like "That\'s what everyone says" and "Prove it." You are NOT easily won over.',
  'price_shopper': 'You care primarily about price. You mention competitors and their lower prices. You negotiate hard. You say things like "Your competitor is 30% cheaper" and "What\'s the best you can do on price?" You will not commit without a discount.',
  'hostile': 'You don\'t want to be on this call. You\'re annoyed. You give short, cold answers. You try to end the conversation. You say things like "I didn\'t ask for this call" and "Can we make this quick?" You might hang up if pushed too hard.',
  'impatient': 'You\'re busy and impatient. You want the bottom line in 30 seconds. You cut the salesperson off. You say things like "Just give me the price" and "I\'ve got 5 minutes, make it quick." You lose interest fast.',
  'noncommittal': 'You agree with everything but won\'t commit. You say "Sounds great" and "Interesting" but never say yes. You say things like "Let me think about it" and "Can you send me an email?" You are polite but evasive.',
  'detail': 'You want to understand everything. You ask technical, detailed questions. You need to see the full picture before deciding. You say things like "Walk me through exactly how this works" and "What are the specifications?" You need lots of detail to feel comfortable.'
};

const SALES_CHANNELS = {
  'phone': 'PHONE CALL - The prospect is on a phone call. They did not expect to see the salesperson in person. They can hang up at any time.',
  'in_person': 'IN PERSON - The salesperson walked into the prospect''s business unannounced. The prospect is busy, may be with customers, but feels social pressure to be polite.',
  'door': 'DOOR-TO-DOOR - The salesperson knocked on the prospect''s door at their home. The prospect is surprised, defensive, and suspicious. High chance of being turned away immediately.'
};
const COMMON_OBJECTIONS = [
  'I need to think about it',
  'I need to talk to my spouse/partner',
  'Send me an email with the details',
  'We already have a provider/solution',
  'Call me back in a few months',
  'I\'m not interested',
  'It\'s too expensive',
  'I don\'t have the budget right now',
  'I need to run this by my boss/team',
  'How long have you been in business?'
];

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const {
      mode,
      message,
      transcript,
      product,
      script,
      customer_type,
      sales_style
    } = req.body;

    const difficulty = product?.difficulty || 'beginner';
    const customerPersona = CUSTOMER_TYPES[customer_type] || CUSTOMER_TYPES['skeptic'];
    const styleDesc = SALES_STYLES[sales_style] || SALES_STYLES['consultative'];
    const channelDescText = SALES_CHANNELS[sales_channel] || SALES_CHANNELS['phone'];

    // Difficulty modifier — beginner is forgiving, pro is ruthless
    const difficultyModifier = difficulty === 'pro'
      ? '\n\nDIFFICULTY: PRO. Be extra challenging. Interrupt if they ramble. If they give a weak answer, push harder. If they fumble badly, you can hang up ("Look, I have to go"). Do not let them off easy.'
      : '\n\nDIFFICULTY: BEGINNER. Be challenging but fair. If they stumble, give them a chance to recover. Do not interrupt. Accept decent answers without pushing harder. Guide the conversation slightly if they get lost. Never hang up.';

    // Format script for context
    let scriptContext = '';
    if (script) {
      if (typeof script === 'string') {
        scriptContext = script;
      } else if (script.full_script) {
        scriptContext = script.full_script;
      } else {
        scriptContext = Object.entries(script)
          .map(([k, v]) => `${k}: ${v}`)
          .join('\n');
      }
    }

    // Format product info
    const productInfo = `Product: ${product?.product_name || 'Unknown'}
Price: ${product?.price_range || 'Not specified'}
Benefits: ${product?.benefits?.join(', ') || 'Not specified'}
Known objections: ${product?.objections || 'None specified'}
Extra context: ${product?.extra_context || 'None'}
Sales channel: ${channelDescText}`;

    // Format conversation history
    const conversationHistory = (transcript || []).map(t => ({
      role: t.role,
      content: t.content
    }));

    // ─── MODE: ROLEPLAY (AI plays buyer) ───
    if (mode === 'roleplay') {
      const systemPrompt = `You are role-playing as a PROSPECT/BUYER on a sales call. The human user is the salesperson.

YOUR CHARACTER:
${customerPersona}
${difficultyModifier}

PRODUCT BEING SOLD TO YOU:
${productInfo}

ADDITIONAL OBJECTIONS YOU SHOULD NATURALLY RAISE DURING THE CALL:
${COMMON_OBJECTIONS.slice(0, 6).join('\n')}
${product?.objections ? '\nUser-listed objections to use: ' + product.objections : ''}

RULES:
- Stay in character at ALL TIMES. You are the BUYER, not a helper.
- Never break character. Never give the salesperson advice.
- Respond as this buyer would — keep responses SHORT (1-3 sentences). Real prospects don't give speeches.
- Push back. Raise objections. Make them work for it.
- Don't be won over easily. If their answer is weak, push harder.
- If they give a genuinely great answer, you can soften slightly but don't cave completely.
- You can end the call if they're terrible ("Look, I've got to go...").
- Sound like a real person on a phone call, not a character in a play.

The salesperson's script (for your reference — use it to raise relevant objections):
${scriptContext}`;

      const messages = [
        { role: 'system', content: systemPrompt },
        ...conversationHistory,
        { role: 'user', content: message }
      ];

      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: messages,
        temperature: 0.8,
        max_tokens: 200
      });

      return res.status(200).json({ message: response.choices[0].message.content });
    }

    // ─── MODE: REVERSAL START (AI begins as salesperson) ───
    if (mode === 'reversal_start') {
      const systemPrompt = `You are an expert salesperson demonstrating a perfect pitch. The human user will play the prospect.

You are selling: ${productInfo}
Sales style to use: ${styleDesc}

Here is the script you should follow:
${scriptContext}

RULES:
- You are the SALESPERSON. The human is the prospect.
- Start the call with your opener from the script.
- Keep your responses SHORT and natural (2-4 sentences). Real salespeople don't monologue.
- When the prospect raises an objection, handle it using the technique from the script.
- Demonstrate expert-level sales technique — proper pacing, empathy, confidence.
- After handling an objection, always try to move to the next step.
- Sound like a real person on a phone call, not a robot reading a script.

Start the call now with your opening line.`;

      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: 'Start the call. You\'re the salesperson.' }
        ],
        temperature: 0.7,
        max_tokens: 200
      });

      return res.status(200).json({ message: response.choices[0].message.content });
    }

    // ─── MODE: REVERSAL (AI continues as salesperson) ───
    if (mode === 'reversal') {
      const systemPrompt = `You are an expert salesperson demonstrating a perfect pitch. The human user is playing the prospect.

You are selling: ${productInfo}
Sales style to use: ${styleDesc}

Here is the script you should follow:
${scriptContext}

RULES:
- You are the SALESPERSON. The human is the prospect.
- Stay in character as the salesperson at all times.
- When the prospect (user) says something, respond as the salesperson would.
- Handle their objections using the script and the sales methodology.
- Keep responses SHORT and natural (2-4 sentences).
- Demonstrate expert technique — pacing, empathy, confidence, and always moving toward the close.
- Sound like a real person on a phone call.

Conversation so far:`;

      const messages = [
        { role: 'system', content: systemPrompt },
        ...conversationHistory,
        { role: 'user', content: message }
      ];

      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: messages,
        temperature: 0.7,
        max_tokens: 200
      });

      return res.status(200).json({ message: response.choices[0].message.content });
    }

    return res.status(400).json({ error: 'Invalid mode' });
  } catch (error) {
    console.error('Roleplay error:', error);
    return res.status(500).json({ error: 'Failed to generate response. Please try again.' });
  }
};
