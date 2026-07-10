// MyPitchGym - Realtime WebRTC Client (GA API)
// Connects browser directly to OpenAI Realtime API using an ephemeral client_secret.
// Flow: server creates session -> browser gets client_secret -> browser establishes
// WebRTC connection directly with OpenAI using that secret.

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

  // Callbacks - set by caller
  onAIStartSpeaking: null,
  onAIStopSpeaking: null,
  onUserText: null,
  onAIText: null,
  onTranscriptUpdate: null,
  onError: null,
  onConnected: null,

  async connect(config) {
    this.transcript = [];
    this.localStream = config.localStream;
    this.callActive = true;

    try {
      // Step 1: Get ephemeral session from our server
      const sessionResponse = await fetch('/api/realtime-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instructions: config.instructions,
          voice: config.voice || 'shimmer'
        })
      });

      if (!sessionResponse.ok) {
        const err = await sessionResponse.json();
        throw new Error(err.error || 'Session creation failed');
      }

      const sessionData = await sessionResponse.json();
      const clientSecret = sessionData.client_secret;

      if (!clientSecret) {
        throw new Error('No client_secret returned from session');
      }

      // Step 2: Create WebRTC peer connection
      this.pc = new RTCPeerConnection();

      // Set up audio element for AI audio output
      this.audioEl = document.createElement('audio');
      this.audioEl.autoplay = true;
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

      // Set up data channel for events
      this.dc = this.pc.createDataChannel('oai-events');
      this.setupDataChannel();

      // Step 3: Create SDP offer
      const offer = await this.pc.createOffer();
      await this.pc.setLocalDescription(offer);

      // Wait for ICE gathering
      await this.waitForIceGathering();

      // Step 4: Send offer to OpenAI using the client_secret
      // The GA API uses the ephemeral token as the Bearer token
      const sdpResponse = await fetch(
        'https://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview',
        {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + clientSecret,
            'Content-Type': 'application/sdp'
          },
          body: this.pc.localDescription.sdp
        }
      );

      if (!sdpResponse.ok) {
        const errText = await sdpResponse.text();
        throw new Error('Realtime connection failed (' + sdpResponse.status + '): ' + errText.substring(0, 300));
      }

      const answerSdp = await sdpResponse.text();
      await this.pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });

      // Connection established
      if (this.onConnected) this.onConnected();

    } catch (err) {
      if (this.onError) this.onError(err.message);
      this.disconnect();
    }
  },

  setupDataChannel() {
    this.dc.onopen = () => {};

    this.dc.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.handleEvent(data);
      } catch (e) {}
    };

    this.dc.onerror = (err) => {
      if (this.onError) this.onError('Data channel error');
    };

    this.dc.onclose = () => {
      if (this.callActive && this.onError) this.onError('Connection closed');
    };
  },

  handleEvent(data) {
    switch (data.type) {
      case 'input_audio_buffer.speech_started':
        if (this.onAIStopSpeaking) this.onAIStopSpeaking();
        break;

      case 'input_audio_buffer.speech_stopped':
        break;

      case 'input_audio_buffer.committed':
        break;

      case 'conversation.item.created':
        if (data.item && data.item.type === 'message') {
          const role = data.item.role;
          const content = data.item.content;
          if (content && content.length > 0 && content[0].transcript) {
            const text = content[0].transcript;
            if (role === 'user') {
              this.transcript.push({ role: 'user', content: text });
              if (this.onUserText) this.onUserText(text);
            } else if (role === 'assistant') {
              this.transcript.push({ role: 'assistant', content: text });
              if (this.onAIText) this.onAIText(text);
            }
            if (this.onTranscriptUpdate) this.onTranscriptUpdate(this.transcript);
          }
        }
        break;

      case 'response.audio.delta':
        if (this.onAIStartSpeaking) this.onAIStartSpeaking();
        break;

      case 'response.audio_transcript.delta':
        break;

      case 'response.done':
        break;

      case 'error':
        if (this.onError) this.onError(data.error ? data.error.message : 'Realtime API error');
        break;
    }
  },

  setupAudioAnalyser(audioEl) {
    try {
      if (!this.audioContext) {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (this.audioContext.state === 'suspended') this.audioContext.resume();

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
      if (this.pc.iceGatheringState === 'complete') {
        resolve();
        return;
      }
      let attempts = 0;
      const checkState = () => {
        if (this.pc.iceGatheringState === 'complete' || attempts >= 20) {
          resolve();
        } else {
          attempts++;
          setTimeout(checkState, 200);
        }
      };
      checkState();
    });
  },

  sendTextMessage(text) {
    if (!this.dc || this.dc.readyState !== 'open') return;
    this.dc.send(JSON.stringify({
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text: text }]
      }
    }));
    this.dc.send(JSON.stringify({ type: 'response.create' }));
  },

  triggerResponse() {
    if (!this.dc || this.dc.readyState !== 'open') return;
    this.dc.send(JSON.stringify({ type: 'response.create' }));
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