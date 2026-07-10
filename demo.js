// MyPitchGym - Landing Page Demo Call
// Uses OpenAI Realtime API (WebRTC) for sub-2-second voice latency.
// The AI responds almost instantly - like a real conversation.

const Demo = {
  state: {
    callActive: false,
    transcript: [],
    timeRemaining: 120,
    timerInterval: null,
    localStream: null,
    isProcessing: false,
    aiSpeaking: false
  },

  // A product most people understand: home security systems
  demoProduct: {
    product_name: "Smart home security system with 24/7 professional monitoring",
    price_range: "$49/mo monitoring + $199 setup",
    benefits: ["24/7 professional monitoring", "Mobile app alerts anywhere", "No long-term contract", "Smart doorbell camera included"],
    objections: "Too expensive, I already have cameras, I need to think about it",
    customer_type: "skeptic",
    difficulty: "beginner",
    sales_channel: "phone"
  },

  init() {
    document.getElementById("demoBtn").addEventListener("click", () => this.openModal());
    document.getElementById("demoCloseBtn").addEventListener("click", () => this.closeModal());
    document.getElementById("demoStartBtn").addEventListener("click", () => this.toggleCall());
    document.getElementById("demoModal").addEventListener("click", (e) => {
      if (e.target.id === "demoModal") this.closeModal();
    });
    setTimeout(() => {
      const w = document.getElementById("demoWidget");
      if (w) w.classList.add("visible");
    }, 3000);
    if (typeof Avatar !== "undefined") {
      Avatar.init("demoAvatar");
    }
    if (typeof Avatar !== "undefined") {
      this.widgetAvatar = Object.create(Avatar);
      this.widgetAvatar.init("demoWidgetAvatar");
      this.widgetAvatar.setMode("idle");
      this.widgetAvatar.setColorScheme("default");
    }
  },

  setAvatarMode(mode, label) {
    if (typeof Avatar !== "undefined") {
      Avatar.setMode(mode);
    }
    const el = document.getElementById("demoAvatarLabel");
    if (el) el.textContent = label || "";
  },

  openModal() { document.getElementById("demoModal").classList.add("visible"); },
  closeModal() {
    if (this.state.callActive) this.endCall(false);
    document.getElementById("demoModal").classList.remove("visible");
  },
  toggleCall() {
    if (this.state.callActive) { this.endCall(false); return; }
    this.startCall();
  },

  setStatus(msg) {
    const el = document.getElementById("demoStatus");
    if (el) { el.textContent = msg; el.style.display = msg ? "block" : "none"; }
  },

  async startCall() {
    this.state.transcript = [];
    this.state.callActive = true;
    this.state.isProcessing = false;

    document.getElementById("demoChat").innerHTML = "";
    document.getElementById("demoChat").style.display = "";
    document.getElementById("demoStartBtn").textContent = "End Call";
    document.getElementById("demoStartBtn").classList.add("listening");
    document.getElementById("demoStartBtn").style.display = "";
    document.querySelector(".demo-timer-bar").style.display = "";
    document.getElementById("demoTimerText").style.display = "";
    document.querySelector(".demo-header").style.display = "";
    document.getElementById("demoUpsell").classList.add("hidden");

    this.addChatMessage("system", "Connecting call...");
    this.setStatus("Requesting microphone...");
    this.setAvatarMode("idle", "Connecting");
    this.startTimer();

    try {
      this.state.localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      this.addChatMessage("system", "Microphone access denied. Allow mic access in Chrome and try again.");
      this.setStatus("Mic blocked");
      this.endCall(false);
      return;
    }

    this.setStatus("Connecting to AI...");

    // Create Realtime session
    try {
      const sessionResponse = await fetch("/api/realtime-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product: this.demoProduct,
          script: null,
          customer_type: "skeptic",
          sales_channel: "phone",
          difficulty: "beginner",
          mode: "roleplay",
          voice_override: "echo"
        })
      });

      if (!sessionResponse.ok) {
        const err = await sessionResponse.json();
        throw new Error(err.error || "Session creation failed");
      }

      const sessionData = await sessionResponse.json();

      // Set up Realtime client callbacks
      RealtimeClient.onAIStartSpeaking = () => {
        this.state.aiSpeaking = true;
        this.setStatus("");
        this.setAvatarMode("speaking", "Speaking");
        this.connectAvatarToAudio();
      };
      RealtimeClient.onAIStopSpeaking = () => {
        this.state.aiSpeaking = false;
      };
      RealtimeClient.onUserText = (text) => {
        if (text && text.trim()) {
          this.addChatMessage("user", text);
        }
      };
      RealtimeClient.onAIText = (text) => {
        if (text && text.trim()) {
          this.addChatMessage("ai", text);
        }
      };
      RealtimeClient.onTranscriptUpdate = (transcript) => {
        this.state.transcript = transcript;
      };
      RealtimeClient.onError = (msg) => {
        this.addChatMessage("system", "Connection issue: " + msg);
        this.setStatus("Connection issue");
      };
      RealtimeClient.onConnected = () => {
        this.setStatus("");
        this.setAvatarMode("listening", "Listening");
        // For roleplay, the AI prospect should greet first
        // The session instructions tell the AI to answer the phone - it will respond automatically
        // For role reversal, trigger the AI to start pitching
      };

      // Connect via WebRTC
      await RealtimeClient.connect(sessionData, this.state.localStream);

      // After connection, trigger the AI to start (prospect answers phone)
      setTimeout(() => {
        if (this.state.callActive && RealtimeClient.dc && RealtimeClient.dc.readyState === "open") {
          RealtimeClient.sendTextMessage("Hello, is this the homeowner?");
        }
      }, 1000);

    } catch (err) {
      this.addChatMessage("system", "Failed to connect: " + err.message);
      this.setStatus("Failed");
      this.endCall(false);
    }
  },

  connectAvatarToAudio() {
    if (typeof Avatar !== "undefined" && RealtimeClient.audioEl) {
      try {
        Avatar.disconnectAudio();
        Avatar.connectAudio(RealtimeClient.audioEl);
      } catch (e) {}
    }
  },

  startTimer() {
    this.state.timeRemaining = 120;
    this.updateTimerDisplay();
    this.state.timerInterval = setInterval(() => {
      if (!this.state.callActive) { this.stopTimer(); return; }
      this.state.timeRemaining--;
      this.updateTimerDisplay();
      if (this.state.timeRemaining <= 0) this.endCall(true);
    }, 1000);
  },

  stopTimer() {
    if (this.state.timerInterval) { clearInterval(this.state.timerInterval); this.state.timerInterval = null; }
  },

  updateTimerDisplay() {
    const mins = Math.floor(this.state.timeRemaining / 60);
    const secs = this.state.timeRemaining % 60;
    const el = document.getElementById("demoTimerText");
    if (el) el.textContent = mins + ":" + (secs < 10 ? "0" : "") + secs;
    const fill = document.getElementById("demoTimerFill");
    if (fill) {
      const pct = (this.state.timeRemaining / 120) * 100;
      fill.style.width = pct + "%";
      if (this.state.timeRemaining <= 30) { el.style.color = "#ef4444"; fill.style.background = "#ef4444"; }
    }
  },

  endCall(timedOut) {
    this.state.callActive = false;
    this.state.isProcessing = false;
    this.stopTimer();

    RealtimeClient.disconnect();

    if (this.state.localStream) {
      this.state.localStream.getTracks().forEach(t => t.stop());
      this.state.localStream = null;
    }

    this.setAvatarMode("idle", "");
    if (typeof Avatar !== "undefined") Avatar.disconnectAudio();
    document.getElementById("demoStartBtn").style.display = "none";
    document.getElementById("demoChat").style.display = "none";
    document.querySelector(".demo-timer-bar").style.display = "none";
    document.getElementById("demoTimerText").style.display = "none";
    document.querySelector(".demo-header").style.display = "none";
    this.setStatus("");

    document.getElementById("demoUpsell").classList.remove("hidden");
  },

  addChatMessage(role, text) {
    const chat = document.getElementById("demoChat");
    if (!chat) return;
    const bubble = document.createElement("div");
    bubble.className = "demo-bubble " + role;
    bubble.textContent = text;
    chat.appendChild(bubble);
    chat.scrollTop = chat.scrollHeight;
  }
};

document.addEventListener("DOMContentLoaded", () => Demo.init());