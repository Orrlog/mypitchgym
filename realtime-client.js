// MyPitchGym - Realtime WebRTC Client (GA API)
// Persistent WebRTC connection to OpenAI Realtime API.
// One connection per roleplay session. Audio streams both directions.
// Server-side VAD handles turn detection and interruption.

const RealtimeClient = {
  pc: null,
  dc: null,
  audioEl: null,
  audioContext: null,
  analyser: null,
  source: null,
  localStream: null,
  callActive: false,
  transcript: [],

  // Timing
  timing: {
    userTurnEnd: null,
    firstAudioTime: null,
    interruptionStart: null,
    interruptionEnd: null
  },

  // Callbacks - set by caller
  onAIStartSpeaking: null,
  onAIStopSpeaking: null,
  onUserText: null,
  onAIText: null,
  onTranscriptUpdate: null,
  onError: null,
  onConnected: null,
  onStatusChange: null,

  // Track state to avoid duplicate events
  _aiSpeaking: false,
  _userSpeaking: false,
  _currentResponseText: "",

  async connect(config) {
    this.transcript = [];
    this.localStream = config.localStream;
    this.callActive = true;
    this._aiSpeaking = false;
    this._userSpeaking = false;
    this._currentResponseText = "";

    // Check browser support
    if (!window.RTCPeerConnection) {
      if (this.onError) this.onError("Your browser does not support WebRTC. Please use Chrome, Edge, or Firefox.");
      return;
    }

    try {
      this._setStatus("Connecting");

      // Create WebRTC peer connection
      this.pc = new RTCPeerConnection();

      // Set up audio element for AI audio output
      this.audioEl = document.createElement("audio");
      this.audioEl.autoplay = true;
      this.audioEl.playsInline = true;
      document.body.appendChild(this.audioEl);

      // Handle incoming audio track from OpenAI
      this.pc.ontrack = (e) => {
        this.audioEl.srcObject = e.streams[0];
        this.setupAudioAnalyser(this.audioEl);
      };

      // Add local microphone track
      const audioTracks = this.localStream.getAudioTracks();
      if (audioTracks.length > 0) {
        this.pc.addTrack(audioTracks[0], this.localStream);
      }

      // Create data channel for events
      this.dc = this.pc.createDataChannel("oai-events");
      this.setupDataChannel();

      // Peer connection state monitoring
      this.pc.onconnectionstatechange = () => {
        const state = this.pc ? this.pc.connectionState : "closed";
        console.log("[Realtime] Peer connection state:", state);

        switch (state) {
          case "connecting":
            this._setStatus("Connecting");
            break;
          case "connected":
            this._setStatus("Connected");
            break;
          case "disconnected":
            if (this.callActive) {
              this._setStatus("Connection lost");
              if (this.onError) this.onError("Connection lost. Try ending and restarting the call.");
            }
            break;
          case "failed":
            this._setStatus("Connection failed");
            if (this.onError) this.onError("WebRTC connection failed.");
            break;
          case "closed":
            this._setStatus("Session ended");
            break;
        }
      };

      // Create SDP offer
      const offer = await this.pc.createOffer();
      await this.pc.setLocalDescription(offer);

      // Wait for ICE gathering
      await this.waitForIceGathering();

      // Send SDP offer to our server, which proxies to OpenAI /v1/realtime/calls
      this._setStatus("Connecting to AI");

      const response = await fetch("/api/realtime-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sdp: this.pc.localDescription.sdp,
          session: config.sessionConfig
        })
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Server connection failed");
      }

      const { sdp: answerSdp } = await response.json();

      if (!answerSdp || !answerSdp.trim()) {
        throw new Error("Server returned empty SDP answer");
      }

      await this.pc.setRemoteDescription({ type: "answer", sdp: answerSdp });

      // Connection is being established
      // onConnected will fire when data channel opens

    } catch (err) {
      console.error("[Realtime] Connect error:", err.message);
      if (this.onError) this.onError(err.message);
      this.disconnect();
    }
  },

  setupDataChannel() {
    this.dc.onopen = () => {
      console.log("[Realtime] Data channel opened");
      if (this.onConnected) this.onConnected();
    };

    this.dc.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.handleEvent(data);
      } catch (e) {
        // Malformed message - do not crash
        console.warn("[Realtime] Malformed data channel message:", e.message);
      }
    };

    this.dc.onerror = (err) => {
      console.error("[Realtime] Data channel error:", err);
      if (this.onError) this.onError("Data channel error");
    };

    this.dc.onclose = () => {
      console.log("[Realtime] Data channel closed");
      if (this.callActive) {
        if (this.onError) this.onError("Connection closed unexpectedly");
      }
    };
  },

  handleEvent(data) {
    if (!data || !data.type) return;

    // Dev logging
    console.log("[Realtime] Event:", data.type);

    switch (data.type) {
      // === User speech detection (semantic VAD) ===
      case "input_audio_buffer.speech_started":
        // User started speaking
        this._userSpeaking = true;
        this.timing.interruptionStart = Date.now();

        // If AI was speaking, this is an interruption
        if (this._aiSpeaking) {
          console.log("[Realtime] User interrupted AI");
          this._aiSpeaking = false;
          if (this.onAIStopSpeaking) this.onAIStopSpeaking();
        }
        this._setStatus("User speaking");
        break;

      case "input_audio_buffer.speech_stopped":
        // User stopped speaking - mark turn end for timing
        this._userSpeaking = false;
        this.timing.userTurnEnd = Date.now();
        this._currentResponseText = "";
        this._setStatus("Processing");
        break;

      case "input_audio_buffer.committed":
        // User audio committed for processing
        break;

      case "conversation.item.input_audio_transcription.completed":
        // User speech transcription completed
        if (data.transcript) {
          const text = data.transcript;
          const last = this.transcript[this.transcript.length - 1];
          if (!last || last.role !== "user" || last.content !== text) {
            this.transcript.push({ role: "user", content: text });
            if (this.onUserText) this.onUserText(text);
            if (this.onTranscriptUpdate) this.onTranscriptUpdate(this.transcript);
          }
        }
        break;

      // Catch text output events (when text modality is enabled)
      case "response.text.delta":
        if (data.delta) {
          this._currentResponseText += data.delta;
        }
        break;

      case "response.text.done":
        if (data.text) {
          const last = this.transcript[this.transcript.length - 1];
          if (!last || last.role !== "assistant" || last.content !== data.text) {
            this.transcript.push({ role: "assistant", content: data.text });
            if (this.onAIText) this.onAIText(data.text);
            if (this.onTranscriptUpdate) this.onTranscriptUpdate(this.transcript);
          }
          this._currentResponseText = "";
        }
        break;

      // === Conversation items (transcripts) ===
      case "conversation.item.created":
        if (data.item && data.item.type === "message") {
          const role = data.item.role;
          const content = data.item.content;
          if (content && content.length > 0) {
            for (const c of content) {
              const text = c.transcript || c.text || "";
              if (text) {
                if (role === "user") {
                  const last = this.transcript[this.transcript.length - 1];
                  if (!last || last.role !== "user" || last.content !== text) {
                    this.transcript.push({ role: "user", content: text });
                    if (this.onUserText) this.onUserText(text);
                  }
                } else if (role === "assistant") {
                  const last = this.transcript[this.transcript.length - 1];
                  if (!last || last.role !== "assistant" || last.content !== text) {
                    this.transcript.push({ role: "assistant", content: text });
                    if (this.onAIText) this.onAIText(text);
                  }
                }
                if (this.onTranscriptUpdate) this.onTranscriptUpdate(this.transcript);
              }
            }
          }
        }
        break;

      // === AI response events ===
      case "response.created":
        // AI response started
        this._currentResponseText = "";
        break;

      case "response.audio.delta":
        // First audio chunk - mark timing
        if (!this._aiSpeaking) {
          this._aiSpeaking = true;
          this.timing.firstAudioTime = Date.now();

          // Measure latency: user turn end -> first AI audio
          if (this.timing.userTurnEnd) {
            const latency = this.timing.firstAudioTime - this.timing.userTurnEnd;
            console.log("[Realtime] Latency (user turn end -> first AI audio): " + latency + "ms");

            // Measure interruption delay
            if (this.timing.interruptionStart) {
              const interruptDelay = this.timing.firstAudioTime - this.timing.interruptionStart;
              console.log("[Realtime] Interruption processing time: " + interruptDelay + "ms");
            }
          }

          this._setStatus("AI responding");
          if (this.onAIStartSpeaking) this.onAIStartSpeaking();
        }
        break;

      case "response.audio_transcript.delta":
        // Accumulate AI speech transcript
        if (data.delta) {
          this._currentResponseText += data.delta;
        }
        break;

      case "response.done":
        // AI finished responding - save accumulated transcript text
        this._aiSpeaking = false;
        if (this._currentResponseText && this._currentResponseText.trim()) {
          const last = this.transcript[this.transcript.length - 1];
          if (!last || last.role !== "assistant" || last.content !== this._currentResponseText.trim()) {
            this.transcript.push({ role: "assistant", content: this._currentResponseText.trim() });
            if (this.onAIText) this.onAIText(this._currentResponseText.trim());
            if (this.onTranscriptUpdate) this.onTranscriptUpdate(this.transcript);
          }
          this._currentResponseText = "";
        }
        if (this.onAIStopSpeaking) this.onAIStopSpeaking();
        this._setStatus("Listening");
        break;

      case "response.cancelled":
        // AI response was cancelled (user interrupted) - save partial transcript
        this._aiSpeaking = false;
        if (this._currentResponseText && this._currentResponseText.trim()) {
          const last = this.transcript[this.transcript.length - 1];
          if (!last || last.role !== "assistant" || last.content !== this._currentResponseText.trim()) {
            this.transcript.push({ role: "assistant", content: this._currentResponseText.trim() });
            if (this.onAIText) this.onAIText(this._currentResponseText.trim());
            if (this.onTranscriptUpdate) this.onTranscriptUpdate(this.transcript);
          }
          this._currentResponseText = "";
        }
        if (this.onAIStopSpeaking) this.onAIStopSpeaking();
        this._setStatus("Listening");

        // Log interruption timing
        if (this.timing.interruptionStart) {
          this.timing.interruptionEnd = Date.now();
          const stopDelay = this.timing.interruptionEnd - this.timing.interruptionStart;
          console.log("[Realtime] AI stopped " + stopDelay + "ms after user started speaking");
        }
        break;

      case "error":
        console.error("[Realtime] API error:", data.error);
        if (this.onError) this.onError(data.error ? data.error.message : "Realtime API error");
        break;

      case "session.updated":
        console.log("[Realtime] Session updated:", data.session ? "ok" : "unknown");
        break;

      case "conversation.created":
        console.log("[Realtime] Conversation created");
        break;

      case "conversation.item.list":
      case "conversation.retrieved":
        // Response to conversation.item.list or conversation.retrieve - contains full history
        // conversation.item.list returns { items: [...] }
        // conversation.retrieved returns { conversation: { items: [...] } }
        var items = data.items || (data.conversation && data.conversation.items) || [];
        if (items && items.length > 0) {
          console.log("[Realtime] Retrieved conversation with " + items.length + " items");
          for (const item of items) {
            if (item.type === "message" && item.content) {
              const role = item.role;
              for (const c of item.content) {
                const text = c.transcript || c.text || "";
                if (text) {
                  const last = this.transcript[this.transcript.length - 1];
                  if (!last || last.role !== role || last.content !== text) {
                    this.transcript.push({ role: role, content: text });
                  }
                }
              }
            }
          }
          if (this.onTranscriptUpdate) this.onTranscriptUpdate(this.transcript);
        }
        break;

      default:
        // Log any unhandled events so we can see what the API sends
        console.log("[Realtime] Unhandled event:", data.type, data);
        break;
    }
  },

  // === Avatar lip-sync support ===
  setupAudioAnalyser(audioEl) {
    try {
      if (!this.audioContext) {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (this.audioContext.state === "suspended") this.audioContext.resume();

      this.source = this.audioContext.createMediaElementSource(audioEl);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.7;
      this.source.connect(this.analyser);
      this.analyser.connect(this.audioContext.destination);
    } catch (e) {
      this.analyser = null;
    }
  },

  getAmplitude() {
    if (!this.analyser) return 0;
    const data = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(data);
    let sum = 0;
    const voiceBands = Math.min(data.length, 32);
    for (let i = 0; i < voiceBands; i++) sum += data[i];
    return Math.min(1, (sum / voiceBands / 255) * 1.8);
  },

  // === Helpers ===
  _setStatus(status) {
    console.log("[Realtime] Status:", status);
    if (this.onStatusChange) this.onStatusChange(status);
  },

  waitForIceGathering() {
    return new Promise((resolve) => {
      if (!this.pc) { resolve(); return; }
      if (this.pc.iceGatheringState === "complete") {
        resolve();
        return;
      }
      let attempts = 0;
      const checkState = () => {
        if (!this.pc) { resolve(); return; }
        if (this.pc.iceGatheringState === "complete" || attempts >= 30) {
          resolve();
        } else {
          attempts++;
          setTimeout(checkState, 200);
        }
      };
      checkState();
    });
  },

  // Send a text message to trigger AI response (used for initial prompt)
  sendTextMessage(text) {
    if (!this.dc || this.dc.readyState !== "open") return;
    this.dc.send(JSON.stringify({
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: text }]
      }
    }));
    this.dc.send(JSON.stringify({ type: "response.create" }));
  },

  // Force AI to take a turn
  triggerResponse() {
    if (!this.dc || this.dc.readyState !== "open") return;
    this.dc.send(JSON.stringify({ type: "response.create" }));
  },

  // Enable transcription AND text output after connection is established.
  // We cannot put these in the initial session config because they cause 504s
  // on the /v1/realtime/calls endpoint. Sending session.update after the data
  // channel opens works reliably.
  enableTranscription() {
    if (!this.dc || this.dc.readyState !== "open") return;
    try {
      // Enable user speech transcription (input side).
      // The GA API requires type: "realtime" in the session object for session.update.
      this.dc.send(JSON.stringify({
        type: "session.update",
        session: {
          type: "realtime",
          input_audio_transcription: {
            model: "whisper-1"
          }
        }
      }));
      console.log("[Realtime] Input transcription enabled via session.update");
    } catch (e) {
      console.warn("[Realtime] Failed to enable transcription:", e.message);
    }
  },

  // Request full conversation history before disconnecting.
  // Uses conversation.item.list (the GA API method) as a fallback to capture
  // any transcript items we may have missed during the live session.
  requestConversationHistory() {
    if (!this.dc || this.dc.readyState !== "open") return;
    try {
      this.dc.send(JSON.stringify({ type: "conversation.item.list" }));
      console.log("[Realtime] Requested conversation item list");
    } catch (e) {
      console.warn("[Realtime] Failed to request item list:", e.message);
    }
  },

  // === Cleanup ===
  disconnect() {
    this.callActive = false;
    this._aiSpeaking = false;
    this._userSpeaking = false;

    if (this.dc) {
      try { this.dc.close(); } catch (e) {}
      this.dc = null;
    }
    if (this.pc) {
      try { this.pc.ontrack = null; } catch (e) {}
      try { this.pc.onconnectionstatechange = null; } catch (e) {}
      try { this.pc.close(); } catch (e) {}
      this.pc = null;
    }
    if (this.audioEl) {
      try { this.audioEl.srcObject = null; } catch (e) {}
      try { this.audioEl.pause(); } catch (e) {}
      try { this.audioEl.remove(); } catch (e) {}
      this.audioEl = null;
    }
    if (this.source) {
      try { this.source.disconnect(); } catch (e) {}
      this.source = null;
    }
    if (this.analyser) {
      try { this.analyser.disconnect(); } catch (e) {}
      this.analyser = null;
    }
    if (this.audioContext) {
      try { this.audioContext.close(); } catch (e) {}
      this.audioContext = null;
    }

    this._setStatus("Session ended");
  }
};