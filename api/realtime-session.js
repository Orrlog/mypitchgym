// Create ephemeral session for OpenAI Realtime API (GA)
// Raw fetch - no SDK, no beta headers that cause 404s.

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { instructions, voice } = req.body;

    // Raw fetch to the GA Realtime sessions endpoint
    // No SDK, no OpenAI-Beta header
    const sessionResponse = await fetch('https://api.openai.com/v1/realtime/sessions', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + process.env.OPENAI_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o-realtime-preview',
        voice: voice || 'shimmer',
        instructions: instructions || '',
        turn_detection: {
          type: 'server_vad',
          threshold: 0.5,
          prefix_padding_ms: 300,
          silence_duration_ms: 500
        },
        input_audio_transcription: {
          model: 'whisper-1'
        }
      })
    });

    if (!sessionResponse.ok) {
      const errText = await sessionResponse.text();
      console.error('Realtime session error:', sessionResponse.status, errText);

      // If sessions endpoint fails, try the direct model URL as fallback
      if (sessionResponse.status === 404) {
        return res.status(500).json({
          error: 'Sessions endpoint not available. Your OpenAI key may not have Realtime API access, or the model name needs updating. Got: ' + errText.substring(0, 200)
        });
      }

      return res.status(sessionResponse.status).json({
        error: 'Session creation failed (' + sessionResponse.status + '): ' + errText.substring(0, 500)
      });
    }

    const session = await sessionResponse.json();
    return res.status(200).json({
      client_secret: session.client_secret,
      session_id: session.id
    });

  } catch (error) {
    console.error('Realtime session error:', error.message);
    return res.status(500).json({ error: 'Failed: ' + error.message });
  }
};