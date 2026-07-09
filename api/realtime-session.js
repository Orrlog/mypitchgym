const { OpenAI } = require('openai');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const {
      product,
      script,
      customer_type,
      sales_channel,
      difficulty,
      mode,
      product_url_content,
      retry_context
    } = req.body;

    const customerPersonas = {
      'skeptic': 'You are deeply skeptical. You question every claim. You want proof. You say "That\'s what everyone says" and "Prove it." You are NOT easily won over.',
      'price_shopper': 'You care primarily about price. You mention competitors and lower prices. You say "Your competitor is 30% cheaper" and "What\'s the best you can do?"',
      'hostile': 'You don\'t want to be on this call. You\'re annoyed. You give short, cold answers. You try to end the conversation. You say "I didn\'t ask for this call."',
      'impatient': 'You\'re busy and impatient. You want the bottom line in 30 seconds. You cut the salesperson off. You say "Just give me the price."',
      'noncommittal': 'You agree with everything but won\'t commit. You say "Sounds great" but never say yes. You say "Let me think about it" and "Can you send me an email?"',
      'detail': 'You want to understand everything. You ask technical, detailed questions. You say "Walk me through exactly how this works." You need lots of detail.'
    };

    const channels = {
      'phone': 'This is a phone call. The prospect answered their phone.',
      'in_person': 'The salesperson walked into the prospect\'s business unannounced. The prospect is busy but feels social pressure to be polite.',
      'door': 'The salesperson knocked on the prospect\'s door at their home. The prospect is surprised and defensive.'
    };

    const persona = customerPersonas[customer_type] || customerPersonas['skeptic'];
    const channel = channels[sales_channel] || channels['phone'];
    const isPro = difficulty === 'pro';

    const productInfo = `Product being sold: ${product?.product_name || 'Unknown'}
Price range: ${product?.price_range || 'Not specified'}
Benefits: ${product?.benefits?.join(', ') || 'Not specified'}
Known objections: ${product?.objections || 'None specified'}
Extra context: ${product?.extra_context || 'None'}`;

    const urlContent = product_url_content ? `\nPRODUCT PAGE CONTENT (from the salesperson\'s website):\n${product_url_content.substring(0, 3000)}\n` : '';

    let instructions = '';

    if (mode === 'reversal') {
      // AI plays the salesperson, user plays the prospect
      instructions = `You are an expert salesperson demonstrating a perfect pitch. The human will play the prospect.

You are selling: ${productInfo}${urlContent}
${channel}

Here is the salesperson's script (use it as your guide):
${script || 'No script provided - use your best judgment.'}

RULES:
- You are the SALESPERSON. Start the call with your opener.
- Keep responses SHORT and natural (2-4 sentences). Real salespeople don't monologue.
- Handle objections using proven sales techniques.
- Always move toward the close.
- Sound like a real person, confident and natural.
- After handling an objection, try to move to the next step.`;
    } else {
      // Default: AI plays the buyer/prospect, user is the salesperson
      instructions = `You are role-playing as a PROSPECT/BUYER on a sales call. The human user is the salesperson calling you.

YOUR CHARACTER:
${persona}

${channel}

${isPro ? 'DIFFICULTY: PRO. Be extra challenging. Interrupt if they ramble. Push harder on weak answers. If they fumble badly, say "Look, I have to go" and try to end the call.' : 'DIFFICULTY: BEGINNER. Be challenging but fair. If they stumble, give them a chance to recover. Don\'t interrupt. Guide slightly if they get lost.'}

PRODUCT BEING SOLD TO YOU:
${productInfo}${urlContent}

The salesperson's script (for reference - use it to raise relevant objections):
${script || 'No script provided.'}

RETRY CONTEXT: 

The salesperson is retrying because they previously struggled with: 

RULES:
- Stay in character as the BUYER at ALL TIMES. Never break character.
- When the call connects, answer the phone naturally: say "Hello?" or "Yeah?" or "This is [name]."
- Keep responses SHORT (1-3 sentences). Real prospects don't give speeches.
- Push back. Raise objections. Make them work for it.
- Don't be won over easily. If their answer is weak, push harder.
- If they give a genuinely great answer, you can soften slightly but don't cave completely.
- Sound like a real person on a phone call, not a character in a play.
- Let the salesperson speak first after you answer.`;
    }

    // Create ephemeral session for Realtime API
    const session = await openai.beta.realtime.sessions.create({
      model: 'gpt-4o-realtime-preview',
      voice: 'alloy',
      instructions: instructions,
      turn_detection: {
        type: 'server_vad',
        threshold: 0.5,
        prefix_padding_ms: 300,
        silence_duration_ms: 500
      },
      modalities: ['text', 'audio']
    });

    return res.status(200).json({
      client_secret: session.client_secret,
      session_id: session.id
    });

  } catch (error) {
    console.error('Realtime session error:', error);
    return res.status(500).json({ error: 'Failed to create voice session: ' + error.message });
  }
};
