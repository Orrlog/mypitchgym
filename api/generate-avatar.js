module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const apiResponse = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + process.env.OPENAI_API_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-image-1",
        prompt: "Professional head-and-shoulders portrait photograph of an adult man approximately 42 years old approachable but slightly reserved expression business-casual dark collared shirt no tie natural facial proportions realistic skin texture with slight imperfections subtle neutral expression direct eye contact neutral dark gray background soft professional lighting centered composition photorealistic photograph not a painting not an illustration no text no watermark",
        n: 1,
        size: "1024x1024"
      })
    });

    if (!apiResponse.ok) {
      const errText = await apiResponse.text();
      return res.status(apiResponse.status).json({ error: "Image gen error (" + apiResponse.status + "): " + errText.substring(0, 500) });
    }

    const data = await apiResponse.json();
    // gpt-image-1 returns base64 in data[0].b64_json
    if (data.data[0].b64_json) {
      return res.status(200).json({ image: data.data[0].b64_json });
    }
    if (data.data[0].url) {
      return res.status(200).json({ url: data.data[0].url });
    }
    return res.status(500).json({ error: "No image in response", raw: JSON.stringify(data).substring(0, 500) });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};