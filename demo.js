// MyPitchGym - Landing Page Demo Call
// Uses OpenAI Realtime GA API via persistent WebRTC connection.
// One connection, continuous audio streaming, server-side VAD.

const Demo = {
  state: {
    callActive: false,
    transcript: [],
    timeRemaining: 120,
    timerInterval: null,
    localStream: null
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
    // Initialize avatar controller for demo context
    if (typeof Avatar !== "undefined") {
      Avatar.init("demo");
      Avatar.setMode("idle");
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
    if (this.state.callActive) this.endCall();
    document.getElementById("demoModal").classList.remove("visible");
  },

  toggleCall() {
    if (this.state.callActive) { this.endCall(); return; }
    this.startCall();
  },

  setStatus(msg) {
    const el = document.getElementById("demoStatus");
    if (el) { el.textContent = msg; el.style.display = msg ? "block" : "none"; }
  },

  async startCall() {
    // Disable start button during active session
    const startBtn = document.getElementById("demoStartBtn");
    startBtn.disabled = true;
    startBtn.textContent = "Connecting...";

    this.state.transcript = [];
    this.state.callActive = true;

    document.getElementById("demoChat").innerHTML = "";
    document.getElementById("demoChat").style.display = "";
    document.querySelector(".demo-timer-bar").style.display = "";
    document.getElementById("demoTimerText").style.display = "";
    document.querySelector(".demo-header").style.display = "";
    document.getElementById("demoUpsell").classList.add("hidden");

    this.addChatMessage("system", "Connecting call...");
    this.setStatus("Requesting microphone...");
    this.setAvatarMode("idle", "Connecting");
    this.startTimer();

    // Request microphone with echo cancellation for clean audio
    try {
      this.state.localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
    } catch (err) {
      this.addChatMessage("system", "Microphone access denied. Allow mic access in Chrome and try again.");
      this.setStatus("Mic blocked");
      startBtn.disabled = false;
      startBtn.textContent = "Start Call";
      this.state.callActive = false;
      this.stopTimer();
      return;
    }

    this.setStatus("Connecting to AI...");

    // Build session config using existing roleplay variables
    const sessionConfig = PromptBuilder.buildSessionConfig({
      product: this.demoProduct,
      script: null,
      customer_type: "skeptic",
      sales_channel: "phone",
      difficulty: "beginner",
      mode: "roleplay",
      voice: "cedar"
    });

    // Set up Realtime client callbacks
    RealtimeClient.onAIStartSpeaking = () => {
      this.setStatus("");
      this.setAvatarMode("speaking", "Speaking");
      this.connectAvatarToAudio();
    };
    RealtimeClient.onAIStopSpeaking = () => {
      if (this.state.callActive) {
        this.setAvatarMode("listening", "Listening");
      }
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
      startBtn.disabled = false;
      startBtn.textContent = "End Call";
      startBtn.classList.add("listening");

      // Trigger the prospect to answer the phone
      setTimeout(() => {
        if (this.state.callActive) {
          RealtimeClient.sendTextMessage("Hello, is this the homeowner?");
        }
      }, 500);
    };
    RealtimeClient.onStatusChange = (status) => {
      // Map internal statuses to user-facing labels
      const labels = {
        "Connecting": "Connecting to AI...",
        "Connected": "Connected",
        "User speaking": "",
        "AI responding": "",
        "Listening": "Your turn - just talk",
        "Processing": "Processing...",
        "Connection lost": "Connection lost",
        "Session ended": "Call ended"
      };
      if (labels[status] !== undefined) {
        this.setStatus(labels[status]);
      }
    };

    // Connect via persistent WebRTC
    await RealtimeClient.connect({
      localStream: this.state.localStream,
      sessionConfig: sessionConfig
    });
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
      if (this.state.timeRemaining <= 0) this.endCall();
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

  endCall() {
    this.state.callActive = false;
    this.stopTimer();

    // Full cleanup: close WebRTC, stop mic, remove audio element
    RealtimeClient.disconnect();

    if (this.state.localStream) {
      this.state.localStream.getTracks().forEach(t => t.stop());
      this.state.localStream = null;
    }

    this.setAvatarMode("idle", "");
    if (typeof Avatar !== "undefined") Avatar.disconnectAudio();

    const startBtn = document.getElementById("demoStartBtn");
    startBtn.disabled = false;
    startBtn.textContent = "Start Call";
    startBtn.classList.remove("listening");
    startBtn.style.display = "none";

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