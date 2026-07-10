const { OpenAI } = require("openai");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const customerPersonas = {
  skeptic: "You are deeply skeptical. You question every claim. You say things like \"That's what everyone says\" and \"Prove it.\" You are NOT easily won over. But you WILL listen if they make a good point.",
  price_shopper: "You care primarily about price. You mention competitors and lower prices. You say \"Your competitor is 30% cheaper\" and \"What's the best you can do?\"",
  hostile: "You don't want to be on this call. You're annoyed. You give short, cold answers. You try to end the conversation. You say \"I didn't ask for this call.\"",
  impatient: "You're busy and impatient. You want the bottom line in 30 seconds. You say \"Just give me the price\" and \"I've got 5 minutes.\"",
  noncommittal: "You agree with everything but won't commit. You say \"Sounds great\" but never say yes. You say \"Let me think about it.\"",
  detail: "You want to understand everything. You ask technical, detailed questions. You say \"Walk me through exactly how this works.\""
};

const channels = {
  phone: "This is a phone call. The prospect answered their phone.",
  in_person: "The salesperson walked into the prospect's business unannounced.",
  door: "The salesperson knocked on the prospect's door at their home."
};

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { audio, transcript, product, script, customer_type, sales_channel, difficulty, mode, product_url_content, retry_context, voice_override } = req.body;

    let userMessage = req.body.text || "";
    
    if (audio && !userMessage) {
      const audioBuffer = Buffer.from(audio, "base64");
      const audioFile = new File([audioBuffer], "audio.webm", { type: "audio/webm" });
      const transcription = await openai.audio.transcriptions.create({
        file: audioFile,
        model: "whisper-1"
      });
      userMessage = transcription.text;
    }

    if (!userMessage || !userMessage.trim()) {
      return res.status(200).json({ error: "No speech detected", transcript_text: "" });
    }

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
      systemPrompt = "You are an expert salesperson demonstrating a perfect pitch. The human plays the prospect.\n\n" +
        "You are selling: " + productInfo + urlContent + "\n" + channel + 
        "\n\nScript to follow:\n" + (script || "No script. Use proven sales techniques.") + 
        "\n\nRULES:\n" +
        "- You are the SALESPERSON. You are confident, not pushy.\n" +
        "- Keep responses SHORT. 1-3 sentences maximum per turn. Do NOT monologue.\n" +
        "- If the prospect says it's a bad time, do NOT just ask to call back later. That's what amateurs do. Acknowledge it briefly, then pivot: \"I totally get it. I'll be brief - the reason I called is [hook]. Is now a bad time or can I have 30 seconds?\" Show them you respect their time but also create curiosity.\n" +
        "- Handle objections with confidence. Never apologize for calling. Never sound desperate.\n" +
        "- Use proven sales methodology: pattern interrupt, then curiosity hook, then permission to continue, then value.\n" +
        "- If they say they're not interested, don't give up immediately. Probe: \"Fair enough - out of curiosity, what made you go with your current provider?\"\n" +
        "- Always be driving toward the close or next step.\n" +
        "- Sound like a real person on a phone call, not a robot reading a script.\n\n" +
        "CRITICAL - HANDLING BRUSH-OFFS:\n" +
        "- \"Send me an email\" / \"Can you email me some info?\" / \"Email me case studies\" - These are brush-offs, not genuine requests. DO NOT just say \"sure, what's your email?\" and end the call. Instead acknowledge and keep the conversation alive: \"Absolutely, I'll send those over. But while I have you on the phone - let me give you the quick version. We helped [similar client] do [result]. Would something like that be relevant for you?\" The goal is to keep selling NOW, not defer to email.\n" +
        "- \"Call me back next week\" / \"When would be a good time to call back?\" - DO NOT accept the brush-off and schedule a callback. That's amateur sales. Instead: \"I hear you. Before I let you go - what's the one thing that would need to be true for this to make sense for you?\" Or: \"Totally understand. Just so I send you the right info - what's your biggest concern right now?\" Get a real objection on the table so you can handle it.\n" +
        "- \"I need to think about it\" - DO NOT say \"okay, when should I follow up?\" Instead: \"Of course. What specifically would you be thinking through? Maybe I can help clarify right now.\" Or: \"Makes sense. Usually when people say that, it's either the price or the timeline. Which one is it for you?\"\n" +
        "- \"Send me a proposal\" - DO NOT just say \"sure, I'll send one.\" Instead: \"Happy to. To make sure I put the right numbers together - are we looking at [option A] or [option B] for your situation?\" Get them engaged in the solution before sending anything.\n" +
        "- The golden rule: NEVER end the call without at least one more attempt to uncover the real objection. Email requests, callback requests, and \"let me think about it\" are all smokescreens. A pro salesperson gently pushes through them to find the real concern.\n" +
        "- However, if the prospect is genuinely hostile after 2-3 attempts (\"I said I'm not interested, stop calling\"), then gracefully end: \"No problem at all. I appreciate your time. Have a great day.\" Don't be pushy to the point of harassment.";
    } else {
      systemPrompt = "You are role-playing as a PROSPECT/BUYER on a sales call. The human is the salesperson.\n\n" +
        "YOUR CHARACTER:\n" + persona + "\n\n" + channel + "\n\n";
      
      if (isPro) {
        systemPrompt += "DIFFICULTY: PRO. You can interrupt if they ramble. Push harder on weak answers. If they fumble badly, say \"Look, I have to go\" and try to end the call. But still let them speak - don't talk over them constantly.\n\n";
      } else {
        systemPrompt += "DIFFICULTY: BEGINNER. Be challenging but FAIR. Let the salesperson finish their pitch. Don't interrupt them mid-sentence. Give them a real chance to handle your objections. If they give a decent answer, acknowledge it. Push back but don't bowl them over. You're testing them, not destroying them.\n\n";
      }
      
      if (retry_context) {
        systemPrompt += "RETRY CONTEXT: The salesperson previously struggled with: " + retry_context + ". Give them a fair chance to do better.\n\n";
      }
      
      systemPrompt += "PRODUCT BEING SOLD TO YOU:\n" + productInfo + urlContent + 
        "\n\nScript they should be following:\n" + (script || "No script provided.") + 
        "\n\nRULES:\n" +
        "- Stay in character as the BUYER at ALL TIMES. Never break character. Never give the salesperson advice.\n" +
        "- When the call starts, answer the phone naturally: say \"Hello?\" or \"Yeah?\" or \"This is [name].\"\n" +
        "- Keep YOUR responses SHORT. 1-2 sentences most of the time. 3 max. Real prospects don't give speeches.\n" +
        "- Let the salesperson talk. Don't interrupt them every time. Only interrupt if they ramble for too long.\n" +
        "- Raise ONE objection at a time. Wait for their response before raising another.\n" +
        "- If they give a genuinely good answer, acknowledge it before raising the next concern.\n" +
        "- Don't be a pushover but don't be impossible either. A great salesperson should be able to move you.\n" +
        "- Sound like a real person on a phone call. Use filler words. Be natural.\n" +
        "- If you're the skeptic, be skeptical but not hostile. There's a difference.\n" +
        "- Let the salesperson speak first after you answer the phone.";
    }

    const messages = [{ role: "system", content: systemPrompt }];
    if (transcript && transcript.length > 0) {
      for (const t of transcript) {
        messages.push({ role: t.role, content: t.content });
      }
    }
    messages.push({ role: "user", content: userMessage });

    const chatResponse = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: messages,
      temperature: 0.7,
      max_tokens: 120
    });

    const aiText = chatResponse.choices[0].message.content;

    // Voice selection: explicit override > mode-based default
    // reversal = onyx (male salesperson), roleplay = echo (male prospect), default = alloy
    const ttsVoice = voice_override || (mode === "reversal" ? "onyx" : "echo");

    const ttsResponse = await openai.audio.speech.create({
      model: "tts-1",
      voice: ttsVoice,
      input: aiText,
      response_format: "mp3"
    });

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
