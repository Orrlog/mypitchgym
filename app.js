// MyPitchGym - App Logic (Whisper + GPT + OpenAI TTS)

const App = {
  state: {
    step: 1,
    product: null,
    script: null,
    transcript: [],
    isSubscribed: false,
    callMode: "roleplay",
    callActive: false,
    isProcessing: false,
    localStream: null,
    mediaRecorder: null,
    audioChunks: [],
    aiAudio: null,
    recordTimeout: null,
    audioContext: null,
    analyser: null,
    vadInterval: null,
    silenceStart: null,
    isRecording: false,
    hasSpeech: false,
    noiseFloor: 8,
    silenceThreshold: 2000,
    coachingData: null
  },

  init() {
    this.setupFormHandlers();
    this.setupCallHandlers();
    this.setupScriptHandlers();
    this.loadSubscriptionStatus();
  },

  loadSubscriptionStatus() {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get("session_id")) {
      this.state.isSubscribed = true;
      localStorage.setItem("mpg_subscribed", "true");
      window.history.replaceState({}, "", "/app");
    }
    if (urlParams.get("canceled") === "true") {
      window.history.replaceState({}, "", "/app");
    }
    if (localStorage.getItem("mpg_subscribed") === "true") {
      this.state.isSubscribed = true;
    }
    if (!this.state.isSubscribed) this.showPaywall();
  },

  showPaywall() { document.getElementById("paywall").classList.add("visible"); },
  hidePaywall() { document.getElementById("paywall").classList.remove("visible"); },

  setupFormHandlers() {
    document.getElementById("addBenefitBtn").addEventListener("click", () => {
      const c = document.getElementById("benefitsContainer");
      const r = document.createElement("div");
      r.className = "benefit-row";
      r.innerHTML = '<input type="text" class="benefit-input" placeholder="e.g. 25-year warranty"> <button class="btn-remove">x</button>';
      c.appendChild(r);
      this.updateRemoveButtons();
    });
    document.getElementById("benefitsContainer").addEventListener("click", (e) => {
      if (e.target.classList.contains("btn-remove")) { e.target.parentElement.remove(); this.updateRemoveButtons(); }
    });
    const cp = document.getElementById("btnClosePaywall");
    if (cp) cp.addEventListener("click", () => this.hidePaywall());
  },

  updateRemoveButtons() {
    const rows = document.querySelectorAll("#benefitsContainer .benefit-row");
    rows.forEach((row) => {
      const btn = row.querySelector(".btn-remove");
      if (rows.length > 1) btn.classList.remove("hidden"); else btn.classList.add("hidden");
    });
  },

  setupScriptHandlers() {
    document.getElementById("btnPracticeAgain").addEventListener("click", () => this.startCall("roleplay"));
    document.getElementById("btnNewSetup").addEventListener("click", () => {
      this.goToStep(1);
      this.state.script = null;
      this.state.transcript = [];
    });
    document.getElementById("btnRoleReverseAfter").addEventListener("click", () => this.startCall("reversal"));
    document.getElementById("btnSubscribe").addEventListener("click", () => this.handleSubscription());
  },

  setupCallHandlers() {
    document.getElementById("btnStartCall").addEventListener("click", () => this.startCall("roleplay"));
    document.getElementById("btnEndCall").addEventListener("click", () => this.endCall());
  },

  async collectFormData() {
    const productName = document.getElementById("productName").value.trim();
    if (!productName) { this.showError("Please tell us what you sell."); return null; }
    const benefits = Array.from(document.querySelectorAll(".benefit-input")).map(i => i.value.trim()).filter(Boolean);
    this.state.product = {
      product_name: productName,
      price_range: document.getElementById("priceRange").value.trim(),
      benefits: benefits,
      objections: document.getElementById("objections").value.trim(),
      extra_context: document.getElementById("extraContext").value.trim(),
      customer_type: document.getElementById("customerType").value,
      difficulty: document.getElementById("difficulty").value,
      sales_channel: document.getElementById("salesChannel").value
    };
    this.state.script = document.getElementById("userScript").value.trim() || null;
    return this.state.product;
  },

  async fetchUrlContent(url) {
    if (!url) return null;
    try {
      this.updateCallStatus("Reading your product page...");
      const response = await fetch("/api/fetch-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url })
      });
      if (!response.ok) return null;
      const result = await response.json();
      return result.content || null;
    } catch (err) { return null; }
  },

  async startCall(mode) {
    this.state.callMode = mode;
    this.state.transcript = [];
    this.state.callActive = false;
    this.state.isProcessing = false;

    if (mode === "roleplay" && this.state.step === 1) {
      const product = await this.collectFormData();
      if (!product) return;
      const url = document.getElementById("productUrl").value.trim();
      if (url) {
        product.product_url = url;
        const content = await this.fetchUrlContent(url);
        if (content) product.product_url_content = content;
      }
    }

    const banner = document.getElementById("roleReverseBanner");
    if (mode === "reversal") banner.classList.remove("hidden");
    else banner.classList.add("hidden");

    this.goToStep(2);
    document.getElementById("callChat").innerHTML = "";
    this.addChatMessage("system", mode === "reversal" ? "AI is preparing to pitch to you..." : "Connecting your call...");
    this.updateCallStatus("Requesting microphone...");

    try {
      this.state.localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      this.addChatMessage("system", "Microphone access denied. Allow mic access and try again.");
      this.updateCallStatus("Mic blocked");
      return;
    }

    // Set up audio analyser for silence detection
    this.setupVAD();

    this.state.callActive = true;
    this.updateCallStatus("Calling...");

    if (mode === "reversal") {
      await this.startRoleReversal();
    } else {
      setTimeout(() => { if (this.state.callActive) this.prospectGreets(); }, 800);
    }
  },

  async prospectGreets() {
    this.state.isProcessing = true;
    this.updateCallStatus("Ringing...");
    this.addChatMessage("ai", "...");

    try {
      const response = await fetch("/api/voice-turn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: "Hello, is this the homeowner?",
          transcript: [],
          product: this.state.product,
          script: this.state.script,
          customer_type: this.state.product.customer_type,
          sales_channel: this.state.product.sales_channel,
          difficulty: this.state.product.difficulty,
          mode: "roleplay"
        })
      });
      if (!response.ok) throw new Error("Failed");
      const result = await response.json();
      if (!this.state.callActive) { this.state.isProcessing = false; return; }
      this.removeLastPlaceholder();
      this.addChatMessage("ai", result.ai_text);
      this.state.transcript.push({ role: "user", content: "Hello, is this the homeowner?" });
      this.state.transcript.push({ role: "assistant", content: result.ai_text });
      this.playAudio(result.ai_audio);
      this.state.isProcessing = false;
    } catch (err) {
      this.removeLastPlaceholder();
      this.addChatMessage("system", "Connection failed: " + err.message);
      this.state.isProcessing = false;
    }
  },

  async startRoleReversal() {
    this.state.isProcessing = true;
    this.addChatMessage("ai", "...");

    try {
      const response = await fetch("/api/voice-turn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: "Start the call. You are the salesperson.",
          transcript: [],
          product: this.state.product,
          script: this.state.script,
          customer_type: this.state.product.customer_type,
          sales_channel: this.state.product.sales_channel,
          difficulty: this.state.product.difficulty,
          mode: "reversal"
        })
      });
      if (!response.ok) throw new Error("Failed");
      const result = await response.json();
      if (!this.state.callActive) { this.state.isProcessing = false; return; }
      document.getElementById("callChat").innerHTML = "";
      this.addChatMessage("system", "The AI is now the salesperson. Respond as the prospect.");
      this.addChatMessage("ai", result.ai_text);
      this.state.transcript.push({ role: "user", content: "Start the call." });
      this.state.transcript.push({ role: "assistant", content: result.ai_text });
      this.playAudio(result.ai_audio);
      this.state.isProcessing = false;
    } catch (err) {
      document.getElementById("callChat").innerHTML = "";
      this.addChatMessage("system", "Could not start. Try again.");
      this.state.isProcessing = false;
    }
  },

  setupVAD() {
    try {
      this.state.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const source = this.state.audioContext.createMediaStreamSource(this.state.localStream);
      this.state.analyser = this.state.audioContext.createAnalyser();
      this.state.analyser.fftSize = 512;
      this.state.analyser.smoothingTimeConstant = 0.6;
      source.connect(this.state.analyser);
    } catch(e) {}
  },

  detectSpeech() {
    if (!this.state.analyser) return false;
    const data = new Uint8Array(this.state.analyser.frequencyBinCount);
    this.state.analyser.getByteFrequencyData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) sum += data[i];
    const avg = sum / data.length;
    return avg > this.state.noiseFloor;
  },

  playAudio(base64Audio) {
    if (!base64Audio) { this.startRecording(); return; }
    this.updateCallStatus("AI speaking...");
    if (this.state.aiAudio) { this.state.aiAudio.pause(); this.state.aiAudio = null; }
    const audio = new Audio("data:audio/mp3;base64," + base64Audio);
    this.state.aiAudio = audio;
    audio.onended = () => { this.state.aiAudio = null; if (!this.state.callActive) return; this.updateCallStatus("Your turn - just talk"); this.startRecording(); };
    audio.onerror = () => { this.state.aiAudio = null; if (!this.state.callActive) return; this.updateCallStatus("Your turn - just talk"); this.startRecording(); };
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

    mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) this.state.audioChunks.push(e.data); };
    mediaRecorder.onstop = () => {
      if (!this.state.callActive) return;
      if (this.state.audioChunks.length === 0) return;

      // If no speech was detected, restart instead of sending silence
      if (!this.state.hasSpeech) {
        if (this.state.callActive && !this.state.isProcessing) {
          setTimeout(() => this.startRecording(), 200);
        }
        return;
      }

      const blob = new Blob(this.state.audioChunks, { type: "audio/webm" });
      const reader = new FileReader();
      reader.onloadend = () => { const base64 = reader.result.split(",")[1]; this.sendAudioToServer(base64); };
      reader.readAsDataURL(blob);
    };

    mediaRecorder.start();
    this.updateCallStatus("Listening...");

    // VAD loop: check every 100ms for speech/silence
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
        if (this.state.hasSpeech) {
          if (!this.state.silenceStart) {
            this.state.silenceStart = Date.now();
          } else {
            const silenceMs = Date.now() - this.state.silenceStart;
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

    // Safety: max 30s of talking before cutoff
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
    this.updateCallStatus("Processing...");
    try {
      const response = await fetch("/api/voice-turn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          audio: base64Audio,
          transcript: this.state.transcript,
          product: this.state.product,
          script: this.state.script,
          customer_type: this.state.product.customer_type,
          sales_channel: this.state.product.sales_channel,
          difficulty: this.state.product.difficulty,
          mode: this.state.callMode
        })
      });
      if (!response.ok) throw new Error("Server error");
      const result = await response.json();
      // Guard: if call ended while processing, drop the response
      if (!this.state.callActive) { this.state.isProcessing = false; return; }
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
      this.state.isProcessing = false;
      setTimeout(() => { if (this.state.callActive) this.startRecording(); }, 1000);
    }
  },

  endCall() {
    this.state.callActive = false;
    this.state.isProcessing = false;
    this.state.isRecording = false;
    if (this.state.recordTimeout) { clearTimeout(this.state.recordTimeout); this.state.recordTimeout = null; }
    if (this.state.vadInterval) { clearInterval(this.state.vadInterval); this.state.vadInterval = null; }
    if (this.state.mediaRecorder && this.state.mediaRecorder.state === "recording") {
      try { this.state.mediaRecorder.stop(); } catch(e) {}
    }
    if (this.state.localStream) {
      this.state.localStream.getTracks().forEach(t => t.stop());
      this.state.localStream = null;
    }
    if (this.state.aiAudio) { this.state.aiAudio.pause(); this.state.aiAudio = null; }
    if (this.state.audioContext) {
      try { this.state.audioContext.close(); } catch(e) {}
      this.state.audioContext = null;
      this.state.analyser = null;
    }
    this.updateCallStatus("Call ended");
    if (this.state.transcript.length < 2) {
      this.addChatMessage("system", "Call ended. Not enough conversation.");
      setTimeout(() => this.goToStep(1), 1500);
      return;
    }
    // Role reversal calls: show a transcript review instead of coaching
    if (this.state.callMode === "reversal") {
      this.showReversalTranscript();
      return;
    }
    this.updateCallStatus("Analyzing your call...");
    this.getCoaching();
  },

  showReversalTranscript() {
    // Build a readable transcript of the AI salesperson's pitch
    const transcriptEl = document.getElementById("coachingScore");
    const listEl = document.getElementById("coachingList");
    const titleEl = document.querySelector("#step3 .script-title");

    if (titleEl) titleEl.innerHTML = "AI Salesperson <span>Transcript Review</span>";

    if (transcriptEl) {
      transcriptEl.innerHTML = '<div style="color:#94a3b8;font-size:0.9rem;line-height:1.6;">Here''s what the AI salesperson said during the role reversal. Review the techniques used to handle your objections.</div>';
    }

    if (listEl) {
      listEl.innerHTML = "";
      const wrapper = document.createElement("div");
      wrapper.style.cssText = "background:#0f172a;border-radius:12px;padding:20px;max-height:450px;overflow-y:auto;";

      for (const msg of this.state.transcript) {
        const row = document.createElement("div");
        row.style.cssText = "margin-bottom:14px;padding-bottom:14px;border-bottom:1px solid #1e293b;";
        const label = document.createElement("div");
        label.style.cssText = "font-size:0.75rem;font-weight:700;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;";
        const text = document.createElement("div");
        text.style.cssText = "font-size:0.9rem;line-height:1.6;color:#cbd5e1;";

        if (msg.role === "assistant") {
          label.textContent = "AI Salesperson";
          label.style.color = "#6366f1";
          text.style.color = "#e2e8f0";
        } else if (msg.role === "user") {
          label.textContent = "You (Prospect)";
          label.style.color = "#22c55e";
        } else {
          label.textContent = "System";
          label.style.color = "#64748b";
        }
        text.textContent = msg.content;
        row.appendChild(label);
        row.appendChild(text);
        wrapper.appendChild(row);
      }

      listEl.appendChild(wrapper);
    }

    // Update the action buttons for reversal mode
    const actions = document.querySelector("#step3 .script-actions");
    if (actions) {
      actions.innerHTML = '<button id="btnPracticeAgain" class="btn-primary">Practice Myself</button>' +
        '<button id="btnNewSetup" class="btn-secondary">New Product Setup</button>' +
        '<button id="btnRoleReverseAfter" class="btn-secondary">Run It Again</button>';
      // Re-bind the buttons
      document.getElementById("btnPracticeAgain").addEventListener("click", () => this.startCall("roleplay"));
      document.getElementById("btnNewSetup").addEventListener("click", () => {
        this.goToStep(1);
        this.state.script = null;
        this.state.transcript = [];
      });
      document.getElementById("btnRoleReverseAfter").addEventListener("click", () => this.startCall("reversal"));
    }

    this.goToStep(3);
  },

  async getCoaching() {
    try {
      const response = await fetch("/api/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript: this.state.transcript,
          script: this.state.script,
          product: this.state.product
        })
      });
      if (!response.ok) throw new Error("Failed");
      const result = await response.json();
      this.state.coachingData = result;
      this.displayCoaching(result);
      this.goToStep(3);
    } catch (err) {
      this.addChatMessage("system", "Could not generate feedback.");
      setTimeout(() => this.goToStep(1), 1500);
    }
  },

  displayCoaching(coaching) {
    const score = coaching.score || 0;
    const scoreEl = document.getElementById("coachingScore");
    scoreEl.innerHTML = "";
    const circle = document.createElement("div");
    circle.className = "score-circle " + (score >= 7 ? "strong" : score >= 4 ? "mid" : "weak");
    circle.textContent = score + "/10";
    scoreEl.appendChild(circle);
    const text = document.createElement("div");
    text.innerHTML = '<div style="color:#f1f5f9;font-weight:600;font-size:1rem;">Overall Score</div><div style="color:#94a3b8;font-size:0.85rem;">' + (coaching.summary || "Breakdown:") + "</div>";
    scoreEl.appendChild(text);
    const listEl = document.getElementById("coachingList");
    listEl.innerHTML = "";
    if (coaching.nailed) coaching.nailed.forEach((item, i) => listEl.appendChild(this.createCoachingItem("NAILED", item, "nailed", i)));
    if (coaching.missed) coaching.missed.forEach((item, i) => listEl.appendChild(this.createCoachingItem("MISSED", item, "missed", i)));
    if (coaching.tips) coaching.tips.forEach((item, i) => listEl.appendChild(this.createCoachingItem("TIP", item, "tip", i)));
    if (coaching.objection_handling) listEl.appendChild(this.createCoachingItem("OBJ", "Objection Handling: " + coaching.objection_handling, "obj", 0));
  },

  createCoachingItem(icon, text, type, index) {
    const div = document.createElement("div");
    div.className = "coaching-item";
    div.innerHTML = '<div class="icon">' + icon + '</div><div class="text">' + text + "</div>";
    if (type === "missed" && this.state.transcript.length > 0) {
      const retryBtn = document.createElement("button");
      retryBtn.className = "retry-btn";
      retryBtn.textContent = "Retry from here";
      retryBtn.addEventListener("click", () => this.retryFromPoint(index));
      div.appendChild(retryBtn);
    }
    return div;
  },

  async retryFromPoint(missedIndex) {
    const allMissed = this.state.coachingData ? this.state.coachingData.missed : [];
    const failurePoint = allMissed[missedIndex];
    if (!failurePoint) return;
    this.state.transcript = [];
    this.goToStep(2);
    document.getElementById("callChat").innerHTML = "";
    this.addChatMessage("system", "Retrying. Focus on: " + failurePoint);
    this.updateCallStatus("Reconnecting...");
    try {
      this.state.localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      this.addChatMessage("system", "Mic access denied.");
      return;
    }
    this.setupVAD();
    this.state.callActive = true;
    setTimeout(() => { if (this.state.callActive) this.prospectGreets(); }, 500);
  },

  removeLastPlaceholder() {
    const chat = document.getElementById("callChat");
    const last = chat.lastElementChild;
    if (last && last.textContent === "...") last.remove();
  },

  addChatMessage(role, text) {
    const chat = document.getElementById("callChat");
    const bubble = document.createElement("div");
    bubble.className = "call-bubble " + role;
    bubble.textContent = text;
    chat.appendChild(bubble);
    chat.scrollTop = chat.scrollHeight;
  },

  updateCallStatus(text) {
    const el = document.getElementById("callStatusLabel");
    if (el) el.textContent = text;
  },

  goToStep(step) {
    this.state.step = step;
    document.getElementById("step1").classList.toggle("hidden", step !== 1);
    document.getElementById("step2").classList.toggle("hidden", step !== 2);
    document.getElementById("step2").classList.toggle("visible", step === 2);
    document.getElementById("step3").classList.toggle("hidden", step !== 3);
    document.getElementById("step3").classList.toggle("visible", step === 3);
    document.querySelectorAll(".step-dot").forEach((dot, i) => {
      dot.classList.remove("active", "done");
      if (i + 1 < step) dot.classList.add("done");
      else if (i + 1 === step) dot.classList.add("active");
    });
    window.scrollTo(0, 0);
  },

  showError(message) {
    const el = document.getElementById("generateError");
    el.textContent = message;
    el.classList.remove("hidden");
    setTimeout(() => el.classList.add("hidden"), 5000);
  },

  async handleSubscription() {
    const btn = document.getElementById("btnSubscribe");
    btn.disabled = true;
    btn.textContent = "Redirecting to checkout...";
    try {
      const response = await fetch("/api/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({})
      });
      if (!response.ok) throw new Error("Failed");
      const result = await response.json();
      if (result.url) window.location.href = result.url;
      else throw new Error("No URL");
    } catch (err) {
      btn.disabled = false;
      btn.textContent = "Start 7-Day Free Trial";
      this.showError("Could not connect to checkout.");
    }
  }
};

document.addEventListener("DOMContentLoaded", () => App.init());
