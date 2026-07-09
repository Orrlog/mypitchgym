// MyPitchGym - Landing Page Demo Call (Realtime API)

const Demo = {
  state: {
    callActive: false,
    transcript: [],
    timeRemaining: 120,
    timerInterval: null,
    peerConnection: null,
    dataChannel: null,
    remoteAudio: null,
    localStream: null
  },

  demoProduct: {
    product_name: 'Solar panel installations for homeowners',
    price_range: '15k-25k',
    benefits: ['Cuts electric bill 60-80%', '25-year warranty', '0% financing', 'Increases home value'],
    objections: 'Too expensive, I need to think about it, not sure it works in my area',
    customer_type: 'skeptic',
    difficulty: 'beginner',
    sales_channel: 'phone'
  },

  init() {
    document.getElementById('demoBtn').addEventListener('click', () => this.openModal());
    document.getElementById('demoCloseBtn').addEventListener('click', () => this.closeModal());
    document.getElementById('demoStartBtn').addEventListener('click', () => this.toggleCall());
    document.getElementById('demoModal').addEventListener('click', (e) => {
      if (e.target.id === 'demoModal') this.closeModal();
    });
    setTimeout(() => {
      const w = document.getElementById('demoWidget');
      if (w) w.classList.add('visible');
    }, 3000);
  },

  openModal() { document.getElementById('demoModal').classList.add('visible'); },

  closeModal() {
    if (this.state.callActive) this.endCall(false);
    document.getElementById('demoModal').classList.remove('visible');
  },

  toggleCall() {
    if (this.state.callActive) {
      this.endCall(false);
    } else {
      this.startCall();
    }
  },

  setStatus(msg) {
    const el = document.getElementById('demoStatus');
    if (el) { el.textContent = msg; el.style.display = msg ? 'block' : 'none'; }
  },

  async startCall() {
    this.state.transcript = [];
    this.state.callActive = false;

    // Reset UI
    document.getElementById('demoChat').innerHTML = '';
    document.getElementById('demoChat').style.display = '';
    document.getElementById('demoStartBtn').textContent = 'End Call';
    document.getElementById('demoStartBtn').classList.add('listening');
    document.getElementById('demoStartBtn').style.display = '';
    document.querySelector('.demo-timer-bar').style.display = '';
    document.getElementById('demoTimerText').style.display = '';
    document.querySelector('.demo-header').style.display = '';
    document.getElementById('demoUpsell').classList.add('hidden');

    this.addChatMessage('system', 'Connecting call...');
    this.setStatus('Connecting...');
    this.startTimer();

    try {
      const sessionResponse = await fetch('/api/realtime-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product: this.demoProduct,
          script: null,
          customer_type: 'skeptic',
          sales_channel: 'phone',
          difficulty: 'beginner',
          mode: 'roleplay'
        })
      });

      if (!sessionResponse.ok) throw new Error('Failed to create session');
      const sessionData = await sessionResponse.json();
      await this.connectRealtime(sessionData.client_secret);

    } catch (err) {
      this.addChatMessage('system', 'Connection failed: ' + err.message);
      this.setStatus('Failed');
    }
  },

  async connectRealtime(clientSecret) {
    const pc = new RTCPeerConnection();

    this.state.remoteAudio = document.createElement('audio');
    this.state.remoteAudio.autoplay = true;
    document.body.appendChild(this.state.remoteAudio);

    pc.ontrack = (e) => {
      this.state.remoteAudio.srcObject = e.streams[0];
    };

    try {
      this.state.localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      this.addChatMessage('system', 'Microphone access denied. Allow mic access in Chrome and try again.');
      this.setStatus('Mic blocked');
      return;
    }

    pc.addTrack(this.state.localStream.getTracks()[0]);

    this.state.dataChannel = pc.createDataChannel('oai-events');
    this.state.peerConnection = pc;

    this.state.dataChannel.addEventListener('message', (e) => {
      const event = JSON.parse(e.data);
      this.handleRealtimeEvent(event);
    });

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await this.waitForIceComplete(pc);

    const sdpResponse = await fetch('https://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/sdp',
        'Authorization': 'Bearer ' + clientSecret.value
      },
      body: pc.localDescription.sdp
    });

    if (!sdpResponse.ok) {
      const errText = await sdpResponse.text();
      throw new Error('Realtime connection failed: ' + errText);
    }

    const answerSdp = await sdpResponse.text();
    await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });

    this.state.callActive = true;
    this.setStatus('Live - just talk naturally');
  },

  waitForIceComplete(pc) {
    return new Promise((resolve) => {
      if (pc.iceGatheringState === 'complete') { resolve(); return; }
      const checkState = () => {
        if (pc.iceGatheringState === 'complete') {
          pc.removeEventListener('icegatheringstatechange', checkState);
          resolve();
        }
      };
      pc.addEventListener('icegatheringstatechange', checkState);
      setTimeout(resolve, 3000);
    });
  },

  sendDataChannelEvent(event) {
    if (this.state.dataChannel && this.state.dataChannel.readyState === 'open') {
      this.state.dataChannel.send(JSON.stringify(event));
    }
  },

  handleRealtimeEvent(event) {
    if (event.type === 'conversation.item.created') {
      if (event.item && event.item.content) {
        const textContent = event.item.content.find(c => c.type === 'text');
        if (textContent && textContent.text) {
          const role = event.item.role === 'assistant' ? 'ai' : 'user';
          if (role === 'ai' || (role === 'user' && this.state.callActive)) {
            this.addChatMessage(role, textContent.text);
            this.state.transcript.push({ role: event.item.role, content: textContent.text });
          }
        }
      }
    }

    if (event.type === 'response.audio_transcript.done') {
      if (event.transcript) {
        this.addChatMessage('ai', event.transcript);
        this.state.transcript.push({ role: 'assistant', content: event.transcript });
      }
    }

    if (event.type === 'conversation.item.input_audio_transcription.completed') {
      if (event.transcript) {
        this.addChatMessage('user', event.transcript);
        this.state.transcript.push({ role: 'user', content: event.transcript });
      }
    }

    if (event.type === 'input_audio_buffer.speech_started') {
      this.setStatus('You\'re speaking...');
      this.sendDataChannelEvent({ type: 'response.cancel' });
    }

    if (event.type === 'input_audio_buffer.speech_stopped') {
      this.setStatus('Listening...');
    }

    if (event.type === 'response.audio_started') {
      this.setStatus('AI speaking...');
    }

    if (event.type === 'response.audio_stopped') {
      this.setStatus('Your turn - just talk');
    }
  },

  startTimer() {
    this.state.timeRemaining = 120;
    this.updateTimerDisplay();
    this.state.timerInterval = setInterval(() => {
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
    const el = document.getElementById('demoTimerText');
    if (el) el.textContent = mins + ':' + (secs < 10 ? '0' : '') + secs;
    const fill = document.getElementById('demoTimerFill');
    if (fill) {
      const pct = (this.state.timeRemaining / 120) * 100;
      fill.style.width = pct + '%';
      if (this.state.timeRemaining <= 30) { el.style.color = '#ef4444'; fill.style.background = '#ef4444'; }
    }
  },

  endCall(timedOut) {
    this.state.callActive = false;

    if (this.state.peerConnection) { this.state.peerConnection.close(); this.state.peerConnection = null; }
    if (this.state.dataChannel) { this.state.dataChannel.close(); this.state.dataChannel = null; }
    if (this.state.localStream) { this.state.localStream.getTracks().forEach(t => t.stop()); this.state.localStream = null; }
    if (this.state.remoteAudio) {
      this.state.remoteAudio.srcObject = null;
      if (this.state.remoteAudio.parentNode) this.state.remoteAudio.parentNode.removeChild(this.state.remoteAudio);
      this.state.remoteAudio = null;
    }

    this.stopTimer();

    document.getElementById('demoStartBtn').style.display = 'none';
    document.getElementById('demoChat').style.display = 'none';
    document.querySelector('.demo-timer-bar').style.display = 'none';
    document.getElementById('demoTimerText').style.display = 'none';
    document.querySelector('.demo-header').style.display = 'none';
    this.setStatus('');

    document.getElementById('demoUpsell').classList.remove('hidden');
  },

  addChatMessage(role, text) {
    const chat = document.getElementById('demoChat');
    if (!chat) return;
    const bubble = document.createElement('div');
    bubble.className = 'demo-bubble ' + role;
    bubble.textContent = text;
    chat.appendChild(bubble);
    chat.scrollTop = chat.scrollHeight;
  }
};

document.addEventListener('DOMContentLoaded', () => Demo.init());
