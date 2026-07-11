module.exports = async (req, res) => {
  try {
    const apiResponse = await fetch("https://api.openai.com/v1/models", {
      headers: { "Authorization": "Bearer " + process.env.OPENAI_API_KEY }
    });
    const data = await apiResponse.json();
    // Filter for image-related models
    const imageModels = data.data.filter(m => 
      m.id.includes("dall") || m.id.includes("image") || m.id.includes("gpt-image")
    );
    const realtimeModels = data.data.filter(m => 
      m.id.includes("realtime") || m.id.includes("audio")
    );
    return res.status(200).json({ 
      imageModels: imageModels.map(m => m.id),
      realtimeModels: realtimeModels.map(m => m.id),
      allModelCount: data.data.length
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};