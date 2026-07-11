// MyPitchGym - Avatar Controller
// Controls img-based avatar with speaking/listening indicator rings.
// No canvas drawing - uses CSS animations on ring elements.
// Works with both demo and app avatar elements.

const Avatar = {
  // Element IDs for different contexts
  ringEl: null,
  labelEl: null,
  currentMode: "idle",
  isReversal: false,
  audioEl: null,
  audioCtx: null,
  audioSource: null,
  audioAnalyser: null,

  // Initialize for a specific context
  // context: "demo" or "app"
  init(context) {
    if (context === "demo" || typeof context === "string" && context.startsWith("demo")) {
      this.ringEl = document.getElementById("demoAvatarRing");
      this.labelEl = document.getElementById("demoAvatarLabel");
    } else {
      this.ringEl = document.getElementById("appAvatarRing");
      this.labelEl = document.getElementById("appAvatarLabel");
    }
  },

  // Legacy compat: init(canvasId) - maps canvas ID to context
  initById(elementId) {
    if (elementId === "demoAvatar" || elementId === "demoWidgetAvatar") {
      this.ringEl = document.getElementById("demoAvatarRing");
      this.labelEl = document.getElementById("demoAvatarLabel");
    } else if (elementId === "appAvatar") {
      this.ringEl = document.getElementById("appAvatarRing");
      this.labelEl = document.getElementById("appAvatarLabel");
    }
  },

  setMode(mode) {
    this.currentMode = mode;

    // Clear all state classes
    if (this.ringEl) {
      this.ringEl.classList.remove("speaking", "listening", "reversal-speaking", "idle");
    }
    if (this.labelEl) {
      this.labelEl.classList.remove("speaking", "listening");
    }

    switch (mode) {
      case "speaking":
        if (this.ringEl) {
          this.ringEl.classList.add(this.isReversal ? "reversal-speaking" : "speaking");
        }
        if (this.labelEl) this.labelEl.classList.add("speaking");
        break;

      case "listening":
        if (this.ringEl) this.ringEl.classList.add("listening");
        if (this.labelEl) this.labelEl.classList.add("listening");
        break;

      case "idle":
      default:
        // No ring - just the plain avatar
        break;
    }
  },

  setColorScheme(scheme) {
    // Track reversal mode for ring color
    this.isReversal = (scheme === "reversal");

    // Update avatar image for reversal mode
    if (scheme === "reversal") {
      this.updateAvatarImage("/assets/prospects/male-default.png", "AI salesperson");
    } else {
      this.updateAvatarImage("/assets/prospects/male-default.png", "Male sales prospect");
    }
  },

  updateAvatarImage(url, altText) {
    // Update the demo modal avatar
    const demoImg = document.getElementById("demoAvatarImg");
    if (demoImg) {
      demoImg.src = url;
      demoImg.alt = altText;
    }
    // Update the app avatar
    const appImg = document.getElementById("appAvatarImg");
    if (appImg) {
      appImg.src = url;
      appImg.alt = altText;
    }
  },

  // Connect audio element for potential amplitude-based effects
  // (currently just for compatibility - the ring pulse is CSS-based)
  connectAudio(audioElement) {
    this.disconnectAudio();
    if (!audioElement) return;
    this.audioEl = audioElement;
  },

  disconnectAudio() {
    this.audioEl = null;
  },

  // Legacy compat - no longer needed but kept for interface compat
  stopAnimation() {
    this.disconnectAudio();
  }
};