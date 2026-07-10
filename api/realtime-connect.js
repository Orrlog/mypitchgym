// Proxy WebRTC SDP exchange to OpenAI Realtime API
// Instead of the sessions endpoint (which 404s), we relay the browser's
// SDP offer directly to OpenAI's Realtime endpoint and return the answer.
// Instructions are sent via the data channel after the connection is established.

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { sdp } = req.body;

    if (!sdp) {
      return res.status(400).json({ error: 'Missing SDP offer' });
    }

    // Forward the SDP offer to OpenAI Realtime API
    // The server adds the API key so the browser never sees it
    const sdpResponse = await fetch('https://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + process.env.OPENAI_API_KEY,
        'Content-Type': 'application/sdp'
      },
      body: sdp
    });

    if (!sdpResponse.ok) {
      const errText = await sdpResponse.text();
      console.error('Realtime SDP exchange error:', sdpResponse.status, errText);
      return res.status(sdpResponse.status).json({
        error: 'Realtime connection failed (' + sdpResponse.status + '): ' + errText.substring(0, 500)
      });
    }

    // Return the SDP answer to the browser
    const answerSdp = await sdpResponse.text();
    return res.status(200).json({ sdp: answerSdp });

  } catch (error) {
    console.error('Realtime connect error:', error.message);
    return res.status(500).json({ error: 'Failed to connect: ' + error.message });
  }
};