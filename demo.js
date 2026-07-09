// MyPitchGym - Landing Page Demo Call
// Uses silence detection (VAD) so the user can talk naturally -
// the AI responds when the user stops talking, not on a fixed timer.

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
    aiAudio: null,
    audioContext: null,
    analyser: null,
    vadInterval: null,
    silenceStart: null,
    isRecording: false,
    minSpeechMs: 800,
    silenceThreshold: 1500,
    noiseFloor: 8,
    hasSpeech: false
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
    this.startTimer();

    try {
      this.state.localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      this.addChatMessage("system", "Microphone access denied. Allow mic access in Chrome and try again.");
      this.setStatus("Mic blocked");
      this.endCall(false);
      return;
    }

    // Set up audio analyser for VAD
    this.setupVAD();

    this.setStatus("Calling...");
    setTimeout(() => {
      if (!this.state.callActive) return;
      this.prospectGreets();
    }, 800);
  },

  setupVAD() {
    try {
      this.state.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const source = this.state.audioContext.createMediaStreamSource(this.state.localStream);
      this.state.analyser = this.state.audioContext.createAnalyser();
      this.state.analyser.fftSize = 512;
      this.state.analyser.smoothingTimeConstant = 0.6;
      source.connect(this.state.analyser);
    } catch(e) {
      // VAD won't work, will fall back to timed recording
    }
  },

  // Check if there's speech above the noise floor
  detectSpeech() {
    if (!this.state.analyser) return false;
    const data = new Uint8Array(this.state.analyser.frequencyBinCount);
    this.state.analyser.getByteFrequencyData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) sum += data[i];
    const avg = sum / data.length;
    return avg > this.state.noiseFloor;
  },

  async prospectGreets() {
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

      const chat = document.getElementById("demoChat");
      const last = chat.lastElementChild;
      if (last && last.textContent === "...") last.remove();

      this.addChatMessage("ai", result.ai_text);
      this.state.transcript.push({ role: "user", content: "Hello, is this the homeowner?" });
      this.state.transcript.push({ role: "assistant", content: result.ai_text });

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
    this.state.hasSpeech = false;
    this.state.silenceStart = null;

    const mediaRecorder = new MediaRecorder(this.state.localStream);
    this.state.mediaRecorder = mediaRecorder;
    this.state.isRecording = true;

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.state.audioChunks.push(e.data);
    };

    mediaRecorder.onstop = () => {
      if (!this.state.callActive) return;
      if (this.state.audioChunks.length === 0) return;

      // If no speech was detected, just restart recording instead of sending silence
      if (!this.state.hasSpeech) {
        if (this.state.callActive && !this.state.isProcessing) {
          setTimeout(() => this.startRecording(), 200);
        }
        return;
      }

      const blob = new Blob(this.state.audioChunks, { type: "audio/webm" });
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result.split(",")[1];
        this.sendAudioToServer(base64);
      };
      reader.readAsDataURL(blob);
    };

    mediaRecorder.start();
    this.setStatus("Listening...");

    // VAD loop: check every 100ms if user is speaking or has gone silent
    this.state.vadInterval = setInterval(() => {
      if (!this.state.isRecording || !this.state.callActive) {
        clearInterval(this.state.vadInterval);
        return;
      }

      const isSpeaking = this.detectSpeech();

      if (isSpeaking) {
        this.state.hasSpeech = true;
        this.state.silenceStart = null;
      } else {
        // Silence detected
        if (this.state.hasSpeech) {
          // User was speaking, now silent - start counting silence
          if (!this.state.silenceStart) {
            this.state.silenceStart = Date.now();
          } else {
            const silenceMs = Date.now() - this.state.silenceStart;
            // If silence has lasted long enough after speech, stop and send
            if (silenceMs >= this.state.silenceThreshold) {
              clearInterval(this.state.vadInterval);
              this.state.isRecording = false;
              if (this.state.mediaRecorder && this.state.mediaRecorder.state === "recording") {
                this.state.mediaRecorder.stop();
              }
            }
          }
        }
      }
    }, 100);

    // Safety timeout: if user talks for a very long time (30s), cut them off
    this.state.recordTimeout = setTimeout(() => {
      if (this.state.isRecording && this.state.callActive) {
        clearInterval(this.state.vadInterval);
        this.state.isRecording = false;
        if (this.state.mediaRecorder && this.state.mediaRecorder.state === "recording") {
          this.state.mediaRecorder.stop();
        }
      }
    }, 30000);
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
    if (this.state.vadInterval) { clearInterval(this.state.vadInterval); this.state.vadInterval = null; }
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
    this.state.isRecording = false;
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
    if (this.state.audioContext) {
      try { this.state.audioContext.close(); } catch(e) {}
      this.state.audioContext = null;
      this.state.analyser = null;
    }

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