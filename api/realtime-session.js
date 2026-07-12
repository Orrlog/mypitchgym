// MyPitchGym - Realtime GA API WebRTC Connection Endpoint
// Receives browser SDP offer, builds multipart FormData with session config,
// sends to OpenAI /v1/realtime/calls, returns SDP answer to browser.
// API key stays server-side. Browser never sees it.

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { sdp, session: sessionConfig } = req.body;

    // Validate SDP
    if (!sdp || !sdp.trim()) {
      return res.status(400).json({ error: "Missing SDP offer in request body" });
    }

    // Verify API key exists
    if (!process.env.OPENAI_API_KEY) {
      console.error("OPENAI_API_KEY environment variable is not set");
      return res.status(500).json({ error: "Server missing OpenAI API key configuration" });
    }

    // Build the full session configuration
    const session = sessionConfig || {
      type: "realtime",
      model: "gpt-realtime-2.1",
      output_modalities: ["audio"],
      instructions: "",
      audio: {
        input: {
          transcription: {
            model: "gpt-4o-mini-transcribe",
            language: "en"
          },
          turn_detection: {
            type: "semantic_vad",
            eagerness: "auto",
            create_response: true,
            interrupt_response: true
          }
        },
        output: {
          voice: "marin"
        }
      }
    };

    // Build multipart FormData for OpenAI
    const formData = new FormData();
    formData.append("sdp", sdp);
    formData.append("session", JSON.stringify(session));

    // POST to OpenAI Realtime GA API
    const openaiResponse = await fetch("https://api.openai.com/v1/realtime/calls", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + process.env.OPENAI_API_KEY
      },
      body: formData
    });

    if (!openaiResponse.ok) {
      const errText = await openaiResponse.text();
      console.error("OpenAI Realtime error:", openaiResponse.status, errText);

      return res.status(openaiResponse.status).json({
        error: "OpenAI Realtime connection failed (" + openaiResponse.status + "): " + errText.substring(0, 500),
        details: {
          status: openaiResponse.status,
          endpoint: "POST https://api.openai.com/v1/realtime/calls",
          model: session.model,
          errorBody: errText.substring(0, 1000)
        }
      });
    }

    // Return the raw SDP answer to the browser
    const answerSdp = await openaiResponse.text();
    return res.status(200).json({ sdp: answerSdp });

  } catch (error) {
    console.error("Realtime session endpoint error:", error.message);
    return res.status(500).json({
      error: "Server error: " + error.message,
      details: { stage: "endpoint exception", message: error.message }
    });
  }
};
