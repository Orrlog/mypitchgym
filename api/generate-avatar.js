// One-time avatar generation endpoint
module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { OpenAI } = require("openai");
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    // Try DALL-E 2 (more widely available)
    const response = await openai.images.generate({
      model: "dall-e-2",
      prompt: "Professional head-and-shoulders portrait photograph of an adult man, approximately 42 years old, approachable but slightly reserved expression, business-casual clothing (dark collared shirt, no tie), natural facial proportions, realistic skin texture, subtle neutral expression, direct eye contact, neutral dark gray background, soft professional lighting, centered composition, photorealistic, not a painting or illustration, no text or watermark",
      n: 1,
      size: "1024x1024",
      response_format: "b64_json"
    });

    return res.status(200).json({
      image: response.data[0].b64_json
    });
  } catch (error) {
    console.error("Avatar generation error:", error.message);
    return res.status(500).json({ error: error.message });
  }
};