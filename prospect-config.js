// MyPitchGym - Prospect Presentation Configuration
// Centralized config for voice + avatar pairing.
// Makes it easy to add future prospect options without scattering code.

const ProspectConfig = {
  // Default prospect presentation - adult male, business-casual
  default: {
    id: "male-default",
    displayName: "Prospect",
    voice: "cedar",
    avatarUrl: "/assets/prospects/male-default.png",
    altText: "Male sales prospect"
  },

  // Role reversal uses a different presentation (AI plays salesperson)
  reversal: {
    id: "reversal-salesperson",
    displayName: "AI Salesperson",
    voice: "verse",
    avatarUrl: "/assets/prospects/male-default.png",
    altText: "AI salesperson"
  },

  // Voice-style instructions appended to the roleplay instructions
  voiceStyleGuide: "Speak as a natural adult male prospect.\n" +
    "Use a conversational American speaking style unless the selected roleplay calls for something different.\n" +
    "Keep most replies brief, usually one to three sentences.\n" +
    "Do not sound like a narrator, radio host, customer-service recording, motivational speaker, or theatrical actor.\n" +
    "Use natural pauses, occasional hesitation, and realistic changes in tone.\n" +
    "Match the selected prospect personality. A skeptical buyer should sound guarded. A rushed buyer should sound impatient and brief. A friendly buyer should sound open but not overly enthusiastic.\n" +
    "Do not exaggerate emotion or speak in a cartoonish manner.\n" +
    "Do not mention that you are using a male voice.",

  // Get the presentation config for a given mode
  getPresentation(mode) {
    if (mode === "reversal") return this.reversal;
    return this.default;
  }
};