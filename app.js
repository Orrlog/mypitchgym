// MyPitchGym - App Logic
// Uses OpenAI Realtime GA API via persistent WebRTC connection.
// One connection per session, continuous audio streaming, server-side VAD.
// Post-session coaching/scoring uses the transcript captured from Realtime events.

const App = {
  state: {
    step: 1,
    product: null,
    script: null,
    transcript: [],
    isSubscribed: false,
    callMode: "roleplay",
    callActive: false,
    localStream: null,
    coachingData: null
  },

  init() {
    this.setupFormHandlers();
    this.setupCallHandlers();
    this.setupScriptHandlers();
    this.loadSubscriptionStatus();
    // Initialize avatar controller for app context
    if (typeof Avatar !== "undefined") {
      Avatar.init("app");
      Avatar.setMode("idle");
    }
  },

  setAvatarMode(mode, label) {
    if (typeof Avatar !== "undefined") {
      Avatar.setMode(mode);
    }
    const el = document.getElementById("appAvatarLabel");
    if (el) el.textContent = label || "";
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

    // Collect form data on first roleplay
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

    // Set avatar color scheme based on mode
    const banner = document.getElementById("roleReverseBanner");
    if (mode === "reversal") {
      banner.classList.remove("hidden");
      if (typeof Avatar !== "undefined") Avatar.setColorScheme("reversal");
    } else {
      banner.classList.add("hidden");
      if (typeof Avatar !== "undefined") Avatar.setColorScheme("default");
    }
    this.setAvatarMode("idle", "Connecting");

    this.goToStep(2);
    document.getElementById("callChat").innerHTML = "";
    this.addChatMessage("system", mode === "reversal" ? "AI is preparing to pitch to you..." : "Connecting your call...");

    // Disable start button, enable end button
    document.getElementById("btnStartCall").disabled = true;
    document.getElementById("btnEndCall").disabled = false;

    this.updateCallStatus("Requesting microphone...");

    // Request microphone with echo cancellation
    try {
      this.state.localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
    } catch (err) {
      this.addChatMessage("system", "Microphone access denied. Allow mic access and try again.");
      this.updateCallStatus("Mic blocked");
      document.getElementById("btnStartCall").disabled = false;
      document.getElementById("btnEndCall").disabled = true;
      return;
    }

    this.updateCallStatus("Connecting to AI...");

    // Build session config with existing roleplay variables
    const sessionConfig = PromptBuilder.buildSessionConfig({
      product: this.state.product,
      script: this.state.script,
      customer_type: this.state.product.customer_type,
      sales_channel: this.state.product.sales_channel,
      difficulty: this.state.product.difficulty,
      mode: mode,
      product_url_content: this.state.product.product_url_content
    });

    // Set up Realtime client callbacks
    RealtimeClient.onAIStartSpeaking = () => {
      this.updateCallStatus("");
      this.setAvatarMode("speaking", this.state.callMode === "reversal" ? "AI Pitching" : "Speaking");
      this.connectAvatarToAudio();
    };
    RealtimeClient.onAIStopSpeaking = () => {
      if (this.state.callActive) {
        this.setAvatarMode("listening", this.state.callMode === "reversal" ? "Your Turn" : "Listening");
        this.updateCallStatus("Your turn - just talk");
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
      this.updateCallStatus("Connection issue");
    };
    RealtimeClient.onConnected = () => {
      this.state.callActive = true;
      this.updateCallStatus("Connected - just talk naturally");
      this.setAvatarMode("listening", this.state.callMode === "reversal" ? "AI Pitches" : "Listening");

      // Trigger AI to start
      setTimeout(() => {
        if (RealtimeClient.dc && RealtimeClient.dc.readyState === "open") {
          if (mode === "reversal") {
            RealtimeClient.sendTextMessage("Start the call. You are the salesperson. Begin with your opener.");
          } else {
            RealtimeClient.sendTextMessage("Hello, is this the homeowner?");
          }
        }
      }, 800);
    };
    RealtimeClient.onStatusChange = (status) => {
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
        this.updateCallStatus(labels[status]);
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

  endCall() {
    this.state.callActive = false;

    // Full cleanup
    RealtimeClient.disconnect();

    if (this.state.localStream) {
      this.state.localStream.getTracks().forEach(t => t.stop());
      this.state.localStream = null;
    }

    this.setAvatarMode("idle", "");
    if (typeof Avatar !== "undefined") Avatar.disconnectAudio();
    this.updateCallStatus("Call ended");

    // Re-enable buttons
    document.getElementById("btnStartCall").disabled = false;
    document.getElementById("btnEndCall").disabled = true;

    if (this.state.transcript.length < 2) {
      this.addChatMessage("system", "Call ended. Not enough conversation.");
      setTimeout(() => this.goToStep(1), 1500);
      return;
    }

    // Role reversal: show transcript review
    if (this.state.callMode === "reversal") {
      this.showReversalTranscript();
      return;
    }

    // Roleplay: get coaching using transcript from Realtime events
    this.updateCallStatus("Analyzing your call...");
    this.getCoaching();
  },

  showReversalTranscript() {
    const transcriptEl = document.getElementById("coachingScore");
    const listEl = document.getElementById("coachingList");
    const titleEl = document.querySelector("#step3 .script-title");

    if (titleEl) titleEl.innerHTML = "AI Salesperson <span>Transcript Review</span>";

    if (transcriptEl) {
      transcriptEl.innerHTML = "<div style=\"color:#94a3b8;font-size:0.9rem;\">Here is what the AI salesperson said during the role reversal. Review the techniques used to handle your objections.</div>";
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

    const actions = document.querySelector("#step3 .script-actions");
    if (actions) {
      actions.innerHTML = '<button id="btnPracticeAgain" class="btn-primary">Practice Myself</button>' +
        '<button id="btnNewSetup" class="btn-secondary">New Product Setup</button>' +
        '<button id="btnRoleReverseAfter" class="btn-secondary">Run It Again</button>';
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
    this.startCall("roleplay");
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