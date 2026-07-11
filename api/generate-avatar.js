// One-time avatar generation endpoint using DALL-E 3
// Generates a photorealistic male prospect portrait

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { OpenAI } = require("openai");
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const response = await openai.images.generate({
      model: "dall-e-3",
      prompt: "Professional head-and-shoulders portrait photograph of an adult man, approximately 42 years old, approachable but slightly reserved expression, business-casual clothing (dark collared shirt, no tie), natural facial proportions, realistic skin texture with slight imperfections, subtle neutral expression, direct eye contact, neutral dark gray background, soft professional lighting from front-left, centered composition, shot on 85mm lens, shallow depth of field, photorealistic, not a painting or illustration, no text or watermark",
      n: 1,
      size: "1024x1024",
      quality: "hd"
    });

    return res.status(200).json({
      url: response.data[0].url,
      revised_prompt: response.data[0].revised_prompt
    });
  } catch (error) {
    console.error("Avatar generation error:", error.message);
    return res.status(500).json({ error: error.message });
  }
};