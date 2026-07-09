// Create ephemeral session for OpenAI Realtime API (WebRTC)
module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { product, script, customer_type, sales_channel, difficulty, mode, product_url_content, retry_context } = req.body;

    const customerPersonas = {
      'skeptic': 'You are deeply skeptical. You question every claim. You say Prove it. You are NOT easily won over.',
      'price_shopper': 'You care primarily about price. You say Your competitor is 30% cheaper.',
      'hostile': 'You do not want to be on this call. You are annoyed. You give short cold answers.',
      'impatient': 'You are busy and impatient. You want the bottom line in 30 seconds.',
      'noncommittal': 'You agree with everything but will not commit. You say Let me think about it.',
      'detail': 'You want to understand everything. You ask technical detailed questions.'
    };

    const channels = {
      'phone': 'This is a phone call. The prospect answered their phone.',
      'in_person': 'The salesperson walked into the prospect business unannounced.',
      'door': 'The salesperson knocked on the prospect door at their home. The prospect is surprised and defensive.'
    };

    const persona = customerPersonas[customer_type] || customerPersonas['skeptic'];
    const channel = channels[sales_channel] || channels['phone'];
    const isPro = difficulty === 'pro';

    const productInfo = 'Product: ' + (product && product.product_name ? product.product_name : 'Unknown') + '\nPrice: ' + (product && product.price_range ? product.price_range : 'Not specified') + '\nBenefits: ' + (product && product.benefits ? product.benefits.join(', ') : 'Not specified') + '\nObjections: ' + (product && product.objections ? product.objections : 'None');

    const urlContent = product_url_content ? '\nPRODUCT PAGE CONTENT:\n' + product_url_content.substring(0, 3000) + '\n' : '';

    let instructions = '';

    if (mode === 'reversal') {
      instructions = 'You are an expert salesperson demonstrating a perfect pitch. The human will play the prospect.\n\nYou are selling: ' + productInfo + urlContent + '\n' + channel + '\n\nScript:\n' + (script || 'No script provided.') + '\n\nRULES:\n- You are the SALESPERSON. Start the call with your opener.\n- Keep responses SHORT (2-4 sentences).\n- Handle objections using proven techniques.\n- Always move toward the close.';
    } else {
      instructions = 'You are role-playing as a PROSPECT/BUYER on a sales call. The human user is the salesperson.\n\nYOUR CHARACTER:\n' + persona + '\n\n' + channel + '\n\n';
      if (isPro) { instructions += 'DIFFICULTY: PRO. Be extra challenging. Interrupt if they ramble. Push harder on weak answers.\n\n'; } else { instructions += 'DIFFICULTY: BEGINNER. Be challenging but fair. Give them a chance to recover.\n\n'; }
      if (retry_context) { instructions += 'RETRY CONTEXT: The salesperson previously struggled with: ' + retry_context + '. Give them a fair chance.\n\n'; }
      instructions += 'PRODUCT BEING SOLD TO YOU:\n' + productInfo + urlContent + '\n\nScript:\n' + (script || 'No script provided.') + '\n\nRULES:\n- Stay in character as the BUYER at ALL TIMES. Never break character.\n- When the call connects, answer the phone naturally: say Hello? or Yeah?\n- Keep responses SHORT (1-3 sentences).\n- Push back. Raise objections. Make them work for it.\n- Do not be won over easily.\n- Sound like a real person on a phone call.\n- Let the salesperson speak first after you answer.';
    }

    const sessionResponse = await fetch('https://api.openai.com/v1/realtime/sessions', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + process.env.OPENAI_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-realtime-preview',
        voice: 'alloy',
        instructions: instructions,
        turn_detection: { type: 'server_vad', threshold: 0.5, prefix_padding_ms: 300, silence_duration_ms: 500 }
      })
    });

    if (!sessionResponse.ok) {
      const errText = await sessionResponse.text();
      console.error('Realtime session API error:', sessionResponse.status, errText);
      return res.status(500).json({ error: 'OpenAI session creation failed (' + sessionResponse.status + '): ' + errText.substring(0, 200) });
    }

    const session = await sessionResponse.json();
    return res.status(200).json({ client_secret: session.client_secret, session_id: session.id });

  } catch (error) {
    console.error('Realtime session error:', error);
    return res.status(500).json({ error: 'Failed to create voice session: ' + error.message });
  }
};
