// MyPitchGym - Landing Page Demo Call

const Demo = {
  state: {
    callActive: false,
    transcript: [],
    timeRemaining: 120,
    timerInterval: null,
    mediaRecorder: null,
    audioChunks: [],
    localStream: null,
    isProcessing: false,
    aiAudio: null
  },

  demoProduct: {
    product_name: "Solar panel installations for homeowners",
    price_range: "15k-25k",
    benefits: ["Cuts electric bill 60-80%", "25-year warranty", "0% financing", "Increases home value"],
    objections: "Too expensive, I need to think about it, not sure it works in my area",
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

    // Reset UI
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
    this.startTimer();

    // Get microphone
    try {
      this.state.localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      this.addChatMessage("system", "Microphone access denied. Allow mic access in Chrome and try again.");
      this.setStatus("Mic blocked");
      this.endCall(false);
      return;
    }

    // Prospect greets first
    this.setStatus("Calling...");
    setTimeout(() => {
      if (!this.state.callActive) return;
      this.prospectGreets();
    }, 800);
  },

  async prospectGreets() {
    // Send an initial empty message to get the AI to say hello
    this.state.isProcessing = true;
    this.setStatus("Ringing...");
    this.addChatMessage("ai", "...");

    try {
      const response = await fetch("/api/voice-turn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: "Hello, is this the homeowner?",
          transcript: [],
          product: this.demoProduct,
          script: null,
          customer_type: "skeptic",
          sales_channel: "phone",
          difficulty: "beginner",
          mode: "roleplay"
        })
      });

      if (!response.ok) throw new Error("Failed to connect");
      const result = await response.json();

      // Remove placeholder
      const chat = document.getElementById("demoChat");
      const last = chat.lastElementChild;
      if (last && last.textContent === "...") last.remove();

      this.addChatMessage("ai", result.ai_text);
      this.state.transcript.push({ role: "user", content: "Hello, is this the homeowner?" });
      this.state.transcript.push({ role: "assistant", content: result.ai_text });

      // Play the AI audio
      this.playAudio(result.ai_audio);
      this.state.isProcessing = false;
    } catch (err) {
      const chat = document.getElementById("demoChat");
      const last = chat.lastElementChild;
      if (last && last.textContent === "...") last.remove();
      this.addChatMessage("system", "Connection failed: " + err.message);
      this.setStatus("Failed");
      this.state.isProcessing = false;
    }
  },

  playAudio(base64Audio) {
    if (!base64Audio) { this.startRecording(); return; }
    this.setStatus("AI speaking...");
    
    // Stop any existing audio
    if (this.state.aiAudio) {
      this.state.aiAudio.pause();
      this.state.aiAudio = null;
    }

    const audio = new Audio("data:audio/mp3;base64," + base64Audio);
    this.state.aiAudio = audio;
    
    audio.onended = () => {
      this.state.aiAudio = null;
      this.setStatus("Your turn - just talk");
      this.startRecording();
    };
    
    audio.onerror = () => {
      this.state.aiAudio = null;
      this.setStatus("Your turn - just talk");
      this.startRecording();
    };

    audio.play();
  },

  startRecording() {
    if (!this.state.callActive || this.state.isProcessing) return;
    if (!this.state.localStream) return;

    this.state.audioChunks = [];
    
    const mediaRecorder = new MediaRecorder(this.state.localStream);
    this.state.mediaRecorder = mediaRecorder;

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.state.audioChunks.push(e.data);
    };

    mediaRecorder.onstop = () => {
      if (!this.state.callActive) return;
      if (this.state.audioChunks.length === 0) return;
      
      // Convert to base64 and send
      const blob = new Blob(this.state.audioChunks, { type: "audio/webm" });
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result.split(",")[1];
        this.sendAudioToServer(base64);
      };
      reader.readAsDataURL(blob);
    };

    mediaRecorder.start();

    // Record for 3 seconds, then stop and send
    // If user keeps talking, the silence detection isn't possible without analysis,
    // so we use a fixed recording window with auto-send
    this.setStatus("Listening...");
    this.state.recordTimeout = setTimeout(() => {
      if (this.state.mediaRecorder && this.state.mediaRecorder.state === "recording") {
        this.state.mediaRecorder.stop();
      }
    }, 4000);
  },

  async sendAudioToServer(base64Audio) {
    if (!this.state.callActive) return;
    this.state.isProcessing = true;
    this.setStatus("Processing...");

    try {
      const response = await fetch("/api/voice-turn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          audio: base64Audio,
          transcript: this.state.transcript,
          product: this.demoProduct,
          script: null,
          customer_type: "skeptic",
          sales_channel: "phone",
          difficulty: "beginner",
          mode: "roleplay"
        })
      });

      if (!response.ok) throw new Error("Server error");
      const result = await response.json();

      if (result.user_text && result.user_text.trim()) {
        this.addChatMessage("user", result.user_text);
        this.state.transcript.push({ role: "user", content: result.user_text });
      }

      if (result.ai_text) {
        this.addChatMessage("ai", result.ai_text);
        this.state.transcript.push({ role: "assistant", content: result.ai_text });
        this.playAudio(result.ai_audio);
      }

      this.state.isProcessing = false;
    } catch (err) {
      this.addChatMessage("system", "Connection issue. Retrying...");
      this.setStatus("Retry...");
      this.state.isProcessing = false;
      // Auto-retry recording
      setTimeout(() => { if (this.state.callActive) this.startRecording(); }, 1000);
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
    if (this.state.recordTimeout) { clearTimeout(this.state.recordTimeout); this.state.recordTimeout = null; }
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
    // Kill EVERYTHING
    this.state.callActive = false;
    this.state.isProcessing = false;
    this.stopTimer();

    if (this.state.mediaRecorder && this.state.mediaRecorder.state === "recording") {
      try { this.state.mediaRecorder.stop(); } catch(e) {}
    }
    if (this.state.localStream) {
      this.state.localStream.getTracks().forEach(t => t.stop());
      this.state.localStream = null;
    }
    if (this.state.aiAudio) {
      this.state.aiAudio.pause();
      this.state.aiAudio = null;
    }

    // Hide call UI
    document.getElementById("demoStartBtn").style.display = "none";
    document.getElementById("demoChat").style.display = "none";
    document.querySelector(".demo-timer-bar").style.display = "none";
    document.getElementById("demoTimerText").style.display = "none";
    document.querySelector(".demo-header").style.display = "none";
    this.setStatus("");

    // Show upsell
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
