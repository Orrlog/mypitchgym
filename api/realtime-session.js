// Create ephemeral session for OpenAI Realtime API (GA version)
// Returns a client_secret that the browser uses to establish a WebRTC connection
// directly with OpenAI. The API key never touches the browser.

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { instructions, voice } = req.body;

    // Use the OpenAI SDK to create a realtime session (GA API)
    const { OpenAI } = require('openai');
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const session = await openai.beta.realtime.sessions.create({
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
    });

    return res.status(200).json({
      client_secret: session.client_secret,
      session_id: session.id
    });

  } catch (error) {
    console.error('Realtime session error:', error.message);
    return res.status(500).json({
      error: 'Failed to create voice session: ' + (error.status || '') + ' ' + error.message
    });
  }
};