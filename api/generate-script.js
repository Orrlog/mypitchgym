const { OpenAI } = require('openai');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const SALES_STYLES = {
  'consultative': 'Use Consultative Selling: Ask diagnostic questions first. Understand the prospect\'s needs before presenting solutions. Build trust through expertise. Lead with curiosity, not a pitch. Prescribe only after diagnosing.',
  'direct': 'Use Direct Response Selling: Get to the point fast. State the value proposition clearly and confidently. Build a value stack. Use strong hooks. Ask for the decision directly. Don\'t waste time on small talk.',
  'neuro-engagement': 'Use Neuro-Engagement (NEPQ-style): Ask questions that bypass the prospect\'s natural resistance. Use "feeling, finding, knowing" question patterns. Help the prospect realize the problem themselves rather than telling them. Never pitch until they\'ve acknowledged the gap.',
  'challenger': 'Use Challenger Selling: Challenge the prospect\'s current worldview. Teach them something new about their own business or problem they didn\'t know. Tailor the message to their specific situation. Take control of the conversation. Be assertive, not accommodating.',
  'pain-first': 'Use Pain-First Qualification: Focus on uncovering pain points before any pitching. Qualify hard — make sure they actually have the problem and it matters enough to fix. Use upfront contracts (agree on what happens next). Be willing to disqualify. Don\'t chase unqualified prospects.',
  'rapport': 'Use Rapport & Influence: Mirror the prospect\'s language and energy. Build rapport through pacing and matching. Use embedded commands and presuppositions. Anchor positive emotions to your solution. Lead with empathy and connection before transitioning to the pitch.',
  'linear': 'Use Linear Persuasion: Keep the prospect on the line and moving forward. Build certainty step by step — first in the product, then in the company, then in you. Loop back when they resist. Never let the conversation derail. Maintain control through every objection.'
};

const CUSTOMER_TYPES = {
  'skeptic': 'You are deeply skeptical. You question every claim. You want proof, data, case studies. You\'ve heard pitches like this before and you\'re not impressed. You say things like "That\'s what everyone says" and "Prove it."',
  'price_shopper': 'You care primarily about price. You mention competitors and their lower prices. You negotiate hard. You say things like "Your competitor is 30% cheaper" and "What\'s the best you can do on price?"',
  'hostile': 'You don\'t want to be on this call. You\'re annoyed. You give short, cold answers. You try to end the conversation. You say things like "I didn\'t ask for this call" and "Can we make this quick?"',
  'impatient': 'You\'re busy and impatient. You want the bottom line in 30 seconds. You cut the salesperson off. You say things like "Just give me the price" and "I\'ve got 5 minutes, make it quick."',
  'noncommittal': 'You agree with everything but won\'t commit. You say "Sounds great" and "Interesting" but never say yes. You say things like "Let me think about it" and "Can you send me an email?"',
  'detail': 'You want to understand everything. You ask technical, detailed questions. You need to see the full picture before deciding. You say things like "Walk me through exactly how this works" and "What are the specifications?"'
};

const SALES_CHANNELS = {
  'phone': 'PHONE CALL - The prospect is receiving a cold or scheduled phone call. They did not expect to see you in person. The opener needs to quickly establish who you are and why you are calling. The prospect can hang up at any time.',
  'in_person': 'IN PERSON - The salesperson is walking into the prospect''s business or office unannounced. There is social pressure to be polite but the prospect is busy and may be serving customers. The opener needs to be respectful of their time while commanding attention.',
  'door': 'DOOR-TO-DOOR - The salesperson knocked on the prospect''s door at their home. The prospect is surprised and potentially defensive. Suspicion is high. The opener needs to quickly disarm and establish trust before being turned away.'
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
      product_name,
      price_range,
      benefits,
      objections,
      extra_context,
      sales_style,
      customer_type,
      user_script
    } = req.body;

    // If user uploaded a script, parse it into the 5-section structure
    // so the frontend displayScript() renders it properly
    if (user_script) {
      return res.status(200).json({
        script: {
          opener: user_script,
          discovery: '',
          benefits: '',
          objection_handling: '',
          close: '',
          full_script: user_script
        },
        message: 'Your uploaded script is ready for practice.'
      });
    }

    const styleInstruction = SALES_STYLES[sales_style] || SALES_STYLES['consultative'];
    const channelInstruction = SALES_CHANNELS[sales_channel] || SALES_CHANNELS['phone'];
    const customerInstruction = CUSTOMER_TYPES[customer_type] || CUSTOMER_TYPES['skeptic'];

    const benefitsText = benefits && benefits.length > 0
      ? benefits.map((b, i) => `${i + 1}. ${b}`).join('\n')
      : 'No specific benefits provided — infer realistic benefits from the product.';

    const objectionsText = objections
      ? `User-listed objections: ${objections}\n\nAlso add 3-5 additional realistic objections that a ${customer_type.replace('_', ' ')} buyer would raise for this type of product:\n${COMMON_OBJECTIONS.slice(0, 5).join('\n')}`
      : `Generate realistic objections that a ${customer_type.replace('_', ' ')} buyer would raise for this product:\n${COMMON_OBJECTIONS.join('\n')}`;

    const systemPrompt = `You are an expert sales script writer with 20+ years of experience across every sales methodology. You write scripts that sound natural, not robotic — like a real salesperson talking, not a telemarketer reading.

${styleInstruction}

Write a complete sales call script for someone selling:
PRODUCT: ${product_name}
SELLING VIA: ${channelInstruction}
PRICE RANGE: ${price_range || 'Not specified'}

BENEFITS TO HIGHLIGHT:
${benefitsText}

OBJECTIONS TO PREPARE FOR:
${objectionsText}

ADDITIONAL CONTEXT: ${extra_context || 'None'}

The buyer persona they'll be practicing against is: ${customer_type.replace('_', ' ')}.

Write the script in these 5 sections. Each section should be practical, conversational, and ready to use on a real call:

1. OPENER — How to start the call. 2-3 sentences. Natural, confident, not pushy.
2. DISCOVERY — 3-4 questions to ask the prospect to understand their needs. These should be open-ended and insightful.
3. BENEFITS — How to present the key benefits naturally in conversation. Tie each benefit to a likely need.
4. OBJECTION_HANDLING — For each objection (both user-listed and AI-generated), write a specific response. Format as "Objection: [objection] → Response: [response]"
5. CLOSE — How to ask for the decision or next step. Clear, direct, not aggressive.

IMPORTANT: Write this as spoken language, not written language. Short sentences. Conversational tone. Real words a person would actually say on a phone call.

Respond as valid JSON only:
{
  "opener": "...",
  "discovery": "...",
  "benefits": "...",
  "objection_handling": "...",
  "close": "..."
}`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: 'Generate my sales script.' }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7,
      max_tokens: 1500
    });

    const script = JSON.parse(response.choices[0].message.content);

    return res.status(200).json({ script });
  } catch (error) {
    console.error('Generate script error:', error);
    return res.status(500).json({ error: 'Failed to generate script. Please try again.' });
  }
};