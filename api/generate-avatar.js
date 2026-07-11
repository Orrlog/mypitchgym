module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { OpenAI } = require("openai");
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    // Try with raw fetch to avoid SDK parameter issues
    const apiResponse = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + process.env.OPENAI_API_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "dall-e-2",
        prompt: "Professional head-and-shoulders portrait photograph of an adult man approximately 42 years old approachable but slightly reserved expression business-casual dark collared shirt no tie natural facial proportions realistic skin texture subtle neutral expression direct eye contact neutral dark gray background soft professional lighting centered composition photorealistic not a painting not an illustration no text no watermark",
        n: 1,
        size: "1024x1024"
      })
    });

    if (!apiResponse.ok) {
      const errText = await apiResponse.text();
      return res.status(apiResponse.status).json({ error: "DALL-E error (" + apiResponse.status + "): " + errText.substring(0, 500) });
    }

    const data = await apiResponse.json();
    return res.status(200).json({ url: data.data[0].url });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};