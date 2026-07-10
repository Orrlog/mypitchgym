// MyPitchGym - Realtime WebRTC Client
// Connects to OpenAI Realtime API via WebRTC for sub-2-second voice latency.
// Handles: peer connection, audio streaming, transcript tracking, avatar lip-sync.

const RealtimeClient = {
  pc: null,
  dc: null,
  audioEl: null,
  audioContext: null,
  analyser: null,
  source: null,
  localStream: null,
  clientSecret: null,
  callActive: false,
  transcript: [],

  // Callbacks - set by caller
  onAIStartSpeaking: null,
  onAIStopSpeaking: null,
  onUserText: null,
  onAIText: null,
  onTranscriptUpdate: null,
  onError: null,
  onConnected: null,

  async connect(sessionData, localStream) {
    this.transcript = [];
    this.localStream = localStream;
    this.clientSecret = sessionData.client_secret;
    this.callActive = true;

    try {
      // Create WebRTC peer connection
      this.pc = new RTCPeerConnection();

      // Set up audio element for AI audio output
      this.audioEl = document.createElement("audio");
      this.audioEl.autoplay = true;
      document.body.appendChild(this.audioEl);

      // Handle incoming audio track from OpenAI
      this.pc.ontrack = (e) => {
        this.audioEl.srcObject = e.streams[0];

        // Connect to audio analyser for avatar lip-sync
        this.setupAudioAnalyser(this.audioEl);
      };

      // Add local microphone track
      const audioTracks = localStream.getAudioTracks();
      if (audioTracks.length > 0) {
        this.pc.addTrack(audioTracks[0], localStream);
      }

      // Set up data channel for events (transcript, speech detection)
      this.dc = this.pc.createDataChannel("oai-events");
      this.setupDataChannel();

      // Create and set local description (offer)
      const offer = await this.pc.createOffer();
      await this.pc.setLocalDescription(offer);

      // Wait for ICE gathering to complete
      await this.waitForIceGathering();

      // Send offer to OpenAI Realtime via SDP exchange
      const sdpResponse = await fetch("https://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview", {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + this.clientSecret,
          "Content-Type": "application/sdp"
        },
        body: this.pc.localDescription.sdp
      });

      if (!sdpResponse.ok) {
        const errText = await sdpResponse.text();
        throw new Error("Realtime SDP exchange failed (" + sdpResponse.status + "): " + errText.substring(0, 300));
      }

      const answerSdp = await sdpResponse.text();
      await this.pc.setRemoteDescription({ type: "answer", sdp: answerSdp });

      // Connection established - AI will start speaking based on session instructions
      if (this.onConnected) this.onConnected();

    } catch (err) {
      if (this.onError) this.onError(err.message);
      this.disconnect();
    }
  },

  setupDataChannel() {
    this.dc.onopen = () => {
      // Data channel open - we can send/receive events
    };

    this.dc.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.handleEvent(data);
      } catch (e) {
        // Ignore malformed messages
      }
    };

    this.dc.onerror = (err) => {
      if (this.onError) this.onError("Data channel error");
    };

    this.dc.onclose = () => {
      if (this.callActive && this.onError) this.onError("Connection closed");
    };
  },

  handleEvent(data) {
    switch (data.type) {
      case "input_audio_buffer.speech_started":
        // User started speaking - can use this for interruption UI
        if (this.onAIStopSpeaking) this.onAIStopSpeaking();
        break;

      case "input_audio_buffer.speech_stopped":
        // User stopped speaking
        break;

      case "input_audio_buffer.committed":
        // User audio chunk committed for processing
        break;

      case "conversation.item.created":
        if (data.item && data.item.type === "message") {
          const role = data.item.role;
          const content = data.item.content;
          if (content && content.length > 0 && content[0].transcript) {
            const text = content[0].transcript;
            if (role === "user") {
              this.transcript.push({ role: "user", content: text });
              if (this.onUserText) this.onUserText(text);
            } else if (role === "assistant") {
              this.transcript.push({ role: "assistant", content: text });
              if (this.onAIText) this.onAIText(text);
            }
            if (this.onTranscriptUpdate) this.onTranscriptUpdate(this.transcript);
          }
        }
        break;

      case "response.audio.delta":
        // AI audio streaming in - avatar should be speaking
        if (this.onAIStartSpeaking) this.onAIStartSpeaking();
        break;

      case "response.audio_transcript.delta":
        // Partial transcript of AI speech
        break;

      case "response.done":
        // AI finished responding
        break;

      case "error":
        if (this.onError) this.onError(data.error ? data.error.message : "Realtime API error");
        break;
    }
  },

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

  waitForIceGathering() {
    return new Promise((resolve) => {
      if (this.pc.iceGatheringState === "complete") {
        resolve();
        return;
      }
      let attempts = 0;
      const checkState = () => {
        if (this.pc.iceGatheringState === "complete" || attempts >= 20) {
          resolve();
        } else {
          attempts++;
          setTimeout(checkState, 200);
        }
      };
      checkState();
    });
  },

  // Force AI to take a turn (used for role reversal start)
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

  // Manually trigger AI response
  triggerResponse() {
    if (!this.dc || this.dc.readyState !== "open") return;
    this.dc.send(JSON.stringify({ type: "response.create" }));
  },

  disconnect() {
    this.callActive = false;
    if (this.dc) {
      try { this.dc.close(); } catch (e) {}
      this.dc = null;
    }
    if (this.pc) {
      try { this.pc.close(); } catch (e) {}
      this.pc = null;
    }
    if (this.audioEl) {
      try { this.audioEl.srcObject = null; } catch (e) {}
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
  }
};