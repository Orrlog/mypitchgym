const { OpenAI } = require("openai");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const customerPersonas = {
  skeptic: "You are deeply skeptical. You question every claim. You say Prove it. You are NOT easily won over.",
  price_shopper: "You care primarily about price. You mention competitors and lower prices.",
  hostile: "You do not want to be on this call. You are annoyed. You give short cold answers.",
  impatient: "You are busy and impatient. You want the bottom line in 30 seconds.",
  noncommittal: "You agree with everything but will not commit. You say Let me think about it.",
  detail: "You want to understand everything. You ask technical detailed questions."
};

const channels = {
  phone: "This is a phone call. The prospect answered their phone.",
  in_person: "The salesperson walked into the prospect business unannounced.",
  door: "The salesperson knocked on the prospect door at their home."
};

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { audio, transcript, product, script, customer_type, sales_channel, difficulty, mode, product_url_content, retry_context } = req.body;

    // If audio is provided, transcribe it first
    let userMessage = req.body.text || "";
    
    if (audio && !userMessage) {
      // audio is base64 encoded webm/ogg
      const audioBuffer = Buffer.from(audio, "base64");
      
      // Create a temporary file-like object for Whisper
      const audioFile = new File([audioBuffer], "audio.webm", { type: "audio/webm" });
      
      const transcription = await openai.audio.transcriptions.create({
        file: audioFile,
        model: "whisper-1"
      });
      
      userMessage = transcription.text;
      console.log("Transcribed:", userMessage);
    }

    if (!userMessage || !userMessage.trim()) {
      return res.status(200).json({ error: "No speech detected", transcript_text: "" });
    }

    // Build the conversation
    const persona = customerPersonas[customer_type] || customerPersonas.skeptic;
    const channel = channels[sales_channel] || channels.phone;
    const isPro = difficulty === "pro";

    const productInfo = "Product: " + (product && product.product_name ? product.product_name : "Unknown") + 
      "\nPrice: " + (product && product.price_range ? product.price_range : "Not specified") +
      "\nBenefits: " + (product && product.benefits ? product.benefits.join(", ") : "Not specified") +
      "\nObjections: " + (product && product.objections ? product.objections : "None");

    const urlContent = product_url_content ? "\nPRODUCT PAGE CONTENT:\n" + product_url_content.substring(0, 3000) : "";

    let systemPrompt = "";
    
    if (mode === "reversal") {
      systemPrompt = "You are an expert salesperson. The human plays the prospect.\n\nYou are selling: " + productInfo + urlContent + "\n" + channel + 
        "\n\nScript:\n" + (script || "No script.") + 
        "\n\nRULES:\n- You are the SALESPERSON.\n- Keep responses SHORT (2-4 sentences).\n- Handle objections using proven techniques.\n- Always move toward the close.";
    } else {
      systemPrompt = "You are role-playing as a PROSPECT/BUYER on a sales call. The human is the salesperson.\n\nYOUR CHARACTER:\n" + persona + "\n\n" + channel + "\n\n";
      if (isPro) {
        systemPrompt += "DIFFICULTY: PRO. Be extra challenging. Interrupt if they ramble.\n\n";
      } else {
        systemPrompt += "DIFFICULTY: BEGINNER. Be challenging but fair.\n\n";
      }
      if (retry_context) {
        systemPrompt += "RETRY CONTEXT: Previously struggled with: " + retry_context + "\n\n";
      }
      systemPrompt += "PRODUCT BEING SOLD TO YOU:\n" + productInfo + urlContent + 
        "\n\nScript:\n" + (script || "No script.") + 
        "\n\nRULES:\n- Stay in character as the BUYER at ALL TIMES.\n- Keep responses SHORT (1-3 sentences).\n- Push back. Raise objections.\n- Do not be won over easily.\n- Sound like a real person on a phone call.\n- Let the salesperson speak first after you answer.\n- When the call starts, answer with Hello? or Yeah?";
    }

    // Build messages from transcript
    const messages = [{ role: "system", content: systemPrompt }];
    if (transcript && transcript.length > 0) {
      for (const t of transcript) {
        messages.push({ role: t.role, content: t.content });
      }
    }
    messages.push({ role: "user", content: userMessage });

    // Get AI response
    const chatResponse = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: messages,
      temperature: 0.8,
      max_tokens: 200
    });

    const aiText = chatResponse.choices[0].message.content;

    // Convert to speech using OpenAI TTS (natural voice)
    const ttsResponse = await openai.audio.speech.create({
      model: "tts-1",
      voice: "alloy",
      input: aiText,
      response_format: "mp3"
    });

    // Get the audio as base64
    const audioArrayBuffer = await ttsResponse.arrayBuffer();
    const audioBase64 = Buffer.from(audioArrayBuffer).toString("base64");

    return res.status(200).json({
      user_text: userMessage,
      ai_text: aiText,
      ai_audio: audioBase64
    });

  } catch (error) {
    console.error("Voice turn error:", error.message);
    return res.status(500).json({ error: "Voice processing failed: " + error.message });
  }
};
