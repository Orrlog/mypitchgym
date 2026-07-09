// MyPitchGym - Frontend Application Logic (Realtime API voice)

const App = {
  state: {
    step: 1,
    product: null,
    script: null,
    transcript: [],
    isSubscribed: false,
    callMode: 'roleplay',
    callActive: false,
    callTimer: null,
    callStartTime: 0,
    peerConnection: null,
    dataChannel: null,
    audioContext: null,
    remoteAudio: null,
    localStream: null,
    realtimeSession: null,
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
    if (urlParams.get('session_id')) {
      this.state.isSubscribed = true;
      localStorage.setItem('mpg_subscribed', 'true');
      window.history.replaceState({}, '', '/app');
    }
    if (urlParams.get('canceled') === 'true') {
      window.history.replaceState({}, '', '/app');
    }
    if (localStorage.getItem('mpg_subscribed') === 'true') {
      this.state.isSubscribed = true;
    }
    if (!this.state.isSubscribed) {
      this.showPaywall();
    }
  },

  showPaywall() { document.getElementById('paywall').classList.add('visible'); },
  hidePaywall() { document.getElementById('paywall').classList.remove('visible'); },

  setupFormHandlers() {
    document.getElementById('addBenefitBtn').addEventListener('click', () => {
      const c = document.getElementById('benefitsContainer');
      const r = document.createElement('div');
      r.className = 'benefit-row';
      r.innerHTML = '<input type="text" class="benefit-input" placeholder="e.g. 25-year warranty"> <button class="btn-remove">x</button>';
      c.appendChild(r);
      this.updateRemoveButtons();
    });
    document.getElementById('benefitsContainer').addEventListener('click', (e) => {
      if (e.target.classList.contains('btn-remove')) { e.target.parentElement.remove(); this.updateRemoveButtons(); }
    });
    const cp = document.getElementById('btnClosePaywall');
    if (cp) { cp.addEventListener('click', () => this.hidePaywall()); }
  },

  updateRemoveButtons() {
    const rows = document.querySelectorAll('#benefitsContainer .benefit-row');
    rows.forEach((row) => {
      const btn = row.querySelector('.btn-remove');
      if (rows.length > 1) { btn.classList.remove('hidden'); } else { btn.classList.add('hidden'); }
    });
  },

  setupScriptHandlers() {
    document.getElementById('btnPracticeAgain').addEventListener('click', () => this.startCall('roleplay'));
    document.getElementById('btnNewSetup').addEventListener('click', () => {
      this.goToStep(1);
      this.state.script = null;
      this.state.transcript = [];
    });
    document.getElementById('btnRoleReverseAfter').addEventListener('click', () => this.startCall('reversal'));
    document.getElementById('btnSubscribe').addEventListener('click', () => this.handleSubscription());
  },

  setupCallHandlers() {
    document.getElementById('btnStartCall').addEventListener('click', () => this.startCall('roleplay'));
    document.getElementById('btnEndCall').addEventListener('click', () => this.endCall());
  },

  async collectFormData() {
    const productName = document.getElementById('productName').value.trim();
    if (!productName) { this.showError('Please tell us what you sell.'); return null; }
    const benefits = Array.from(document.querySelectorAll('.benefit-input')).map(i => i.value.trim()).filter(Boolean);
    const product = {
      product_name: productName,
      price_range: document.getElementById('priceRange').value.trim(),
      benefits: benefits,
      objections: document.getElementById('objections').value.trim(),
      extra_context: document.getElementById('extraContext').value.trim(),
      customer_type: document.getElementById('customerType').value,
      difficulty: document.getElementById('difficulty').value,
      sales_channel: document.getElementById('salesChannel').value
    };
    this.state.product = product;
    this.state.script = document.getElementById('userScript').value.trim() || null;
    return product;
  },

  async fetchUrlContent(url) {
    if (!url) return null;
    try {
      this.updateCallStatus('Reading your product page...');
      const response = await fetch('/api/fetch-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url })
      });
      if (!response.ok) return null;
      const result = await response.json();
      return result.content || null;
    } catch (err) {
      return null;
    }
  },

  async startCall(mode) {
    this.state.callMode = mode;
    this.state.transcript = [];
    this.state.callActive = false;

    if (mode === 'roleplay' && this.state.step === 1) {
      const product = await this.collectFormData();
      if (!product) return;
      const url = document.getElementById('productUrl').value.trim();
      if (url) {
        product.product_url = url;
        const content = await this.fetchUrlContent(url);
        if (content) product.product_url_content = content;
      }
    }

    const banner = document.getElementById('roleReverseBanner');
    if (mode === 'reversal') {
      banner.classList.remove('hidden');
    } else {
      banner.classList.add('hidden');
    }

    this.goToStep(2);
    document.getElementById('callChat').innerHTML = '';
    this.addChatMessage('system', mode === 'reversal' ? 'AI is preparing to pitch to you...' : 'Connecting your call...');
    this.updateCallStatus('Connecting...');

    try {
      // Get ephemeral session token from server
      const sessionResponse = await fetch('/api/realtime-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product: this.state.product,
          script: this.state.script,
          customer_type: this.state.product.customer_type,
          sales_channel: this.state.product.sales_channel,
          difficulty: this.state.product.difficulty,
          mode: mode,
          product_url_content: this.state.product.product_url_content
        })
      });

      if (!sessionResponse.ok) {
        const err = await sessionResponse.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to create session');
      }

      const sessionData = await sessionResponse.json();
      this.state.realtimeSession = sessionData;

      // Connect via WebRTC
      await this.connectRealtime(sessionData.client_secret, mode);

    } catch (err) {
      console.error('Call start error:', err);
      this.addChatMessage('system', 'Failed to connect: ' + err.message);
      this.updateCallStatus('Connection failed');
    }
  },

  async connectRealtime(clientSecret, mode) {
    // Create peer connection
    const pc = new RTCPeerConnection();

    // Set up remote audio
    this.state.remoteAudio = document.createElement('audio');
    this.state.remoteAudio.autoplay = true;
    document.body.appendChild(this.state.remoteAudio);

    pc.ontrack = (e) => {
      this.state.remoteAudio.srcObject = e.streams[0];
    };

    // Get local mic
    try {
      this.state.localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      this.addChatMessage('system', 'Microphone access denied. Allow mic access and try again.');
      this.updateCallStatus('Mic blocked');
      return;
    }

    // Add local track
    pc.addTrack(this.state.localStream.getTracks()[0]);

    // Data channel for text events
    this.state.dataChannel = pc.createDataChannel('oai-events');
    this.state.peerConnection = pc;

    this.state.dataChannel.addEventListener('message', (e) => {
      const event = JSON.parse(e.data);
      this.handleRealtimeEvent(event);
    });

    // Create offer
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    // Wait for ICE gathering
    await this.waitForIceComplete(pc);

    // Send offer to OpenAI Realtime API via SDP exchange
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
      throw new Error('Realtime SDP exchange failed: ' + errText);
    }

    const answerSdp = await sdpResponse.text();
    await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });

    this.state.callActive = true;
    this.state.callStartTime = Date.now();
    this.startCallTimer();
    this.updateCallStatus(mode === 'reversal' ? 'AI is pitching to you...' : 'Live - just talk naturally');

    if (mode === 'reversal') {
      // Tell the AI to start pitching
      this.sendDataChannelEvent({
        type: 'response.create',
        response: {
          modalities: ['text', 'audio'],
          instructions: 'Start the call now with your opening line.'
        }
      });
    }
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
      // Timeout after 3 seconds
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
      this.updateCallStatus('You\'re speaking...');
      // Interrupt the AI if it's talking
      this.sendDataChannelEvent({ type: 'response.cancel' });
    }

    if (event.type === 'input_audio_buffer.speech_stopped') {
      this.updateCallStatus('Listening...');
    }

    if (event.type === 'response.audio_started') {
      this.updateCallStatus('AI speaking...');
    }

    if (event.type === 'response.audio_stopped') {
      this.updateCallStatus('Your turn - just talk');
    }
  },

  startCallTimer() {
    this.state.callTimer = setInterval(() => {
      const elapsed = Math.floor((Date.now() - this.state.callStartTime) / 1000);
      const mins = Math.floor(elapsed / 60);
      const secs = elapsed % 60;
      this.updateCallStatus(`${mins}:${secs < 10 ? '0' : ''}${secs} - Live`);
    }, 1000);
  },

  async endCall() {
    this.state.callActive = false;

    if (this.state.callTimer) {
      clearInterval(this.state.callTimer);
      this.state.callTimer = null;
    }

    // Close WebRTC connection
    if (this.state.peerConnection) {
      this.state.peerConnection.close();
      this.state.peerConnection = null;
    }
    if (this.state.dataChannel) {
      this.state.dataChannel.close();
      this.state.dataChannel = null;
    }
    if (this.state.localStream) {
      this.state.localStream.getTracks().forEach(t => t.stop());
      this.state.localStream = null;
    }
    if (this.state.remoteAudio) {
      this.state.remoteAudio.srcObject = null;
      if (this.state.remoteAudio.parentNode) {
        this.state.remoteAudio.parentNode.removeChild(this.state.remoteAudio);
      }
      this.state.remoteAudio = null;
    }

    this.updateCallStatus('Call ended');

    if (this.state.transcript.length < 2) {
      this.addChatMessage('system', 'Call ended. Not enough conversation for coaching.');
      setTimeout(() => this.goToStep(1), 1500);
      return;
    }

    this.updateCallStatus('Analyzing your call...');
    await this.getCoaching();
  },

  async getCoaching() {
    try {
      const response = await fetch('/api/coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript: this.state.transcript,
          script: this.state.script,
          product: this.state.product
        })
      });
      if (!response.ok) { const err = await response.json().catch(() => ({})); throw new Error(err.error || 'Failed'); }
      const result = await response.json();
      this.state.coachingData = result;
      this.displayCoaching(result);
      this.goToStep(3);
    } catch (err) {
      console.error('Coaching error:', err);
      this.addChatMessage('system', 'Could not generate feedback. Please try another call.');
      setTimeout(() => this.goToStep(1), 1500);
    }
  },

  displayCoaching(coaching) {
    const score = coaching.score || 0;
    const scoreEl = document.getElementById('coachingScore');
    scoreEl.innerHTML = '';
    const circle = document.createElement('div');
    circle.className = 'score-circle ' + (score >= 7 ? 'strong' : score >= 4 ? 'mid' : 'weak');
    circle.textContent = score + '/10';
    scoreEl.appendChild(circle);
    const text = document.createElement('div');
    text.innerHTML = '<div style="color:#f1f5f9;font-weight:600;font-size:1rem;">Overall Score</div><div style="color:#94a3b8;font-size:0.85rem;">' + (coaching.summary || "Here's your breakdown:") + '</div>';
    scoreEl.appendChild(text);

    const listEl = document.getElementById('coachingList');
    listEl.innerHTML = '';
    if (coaching.nailed && coaching.nailed.length) {
      coaching.nailed.forEach((item, i) => listEl.appendChild(this.createCoachingItem('NAILED', item, 'nailed', i)));
    }
    if (coaching.missed && coaching.missed.length) {
      coaching.missed.forEach((item, i) => listEl.appendChild(this.createCoachingItem('MISSED', item, 'missed', i)));
    }
    if (coaching.tips && coaching.tips.length) {
      coaching.tips.forEach((item, i) => listEl.appendChild(this.createCoachingItem('TIP', item, 'tip', i)));
    }
    if (coaching.objection_handling) {
      listEl.appendChild(this.createCoachingItem('OBJ', 'Objection Handling: ' + coaching.objection_handling, 'obj', 0));
    }
  },

  createCoachingItem(icon, text, type, index) {
    const div = document.createElement('div');
    div.className = 'coaching-item';
    div.innerHTML = '<div class="icon">' + icon + '</div><div class="text">' + text + '</div>';
    // Add retry button for missed items
    if (type === 'missed' && this.state.transcript.length > 0) {
      const retryBtn = document.createElement('button');
      retryBtn.className = 'retry-btn';
      retryBtn.textContent = 'Retry from here';
      retryBtn.addEventListener('click', () => this.retryFromPoint(index));
      div.appendChild(retryBtn);
    }
    return div;
  },

  async retryFromPoint(missedIndex) {
    // Find the point in the transcript where this failure happened
    // Replay conversation up to that point, then let user try again
    const allMissed = this.state.coachingData?.missed || [];
    const failurePoint = allMissed[missedIndex];
    if (!failurePoint) return;

    // Start a new call with context about what to retry
    this.state.transcript = [];
    this.goToStep(2);
    document.getElementById('callChat').innerHTML = '';
    this.addChatMessage('system', 'Retrying from your failure point: ' + failurePoint);
    this.updateCallStatus('Reconnecting for retry...');

    try {
      const sessionResponse = await fetch('/api/realtime-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product: this.state.product,
          script: this.state.script,
          customer_type: this.state.product.customer_type,
          sales_channel: this.state.product.sales_channel,
          difficulty: this.state.product.difficulty,
          mode: 'roleplay',
          product_url_content: this.state.product.product_url_content,
          retry_context: failurePoint
        })
      });

      if (!sessionResponse.ok) throw new Error('Failed to create retry session');
      const sessionData = await sessionResponse.json();
      await this.connectRealtime(sessionData.client_secret, 'roleplay');
      this.addChatMessage('system', 'The call is starting fresh. Try a different approach this time.');
    } catch (err) {
      this.addChatMessage('system', 'Could not start retry: ' + err.message);
    }
  },

  addChatMessage(role, text) {
    const chat = document.getElementById('callChat');
    const bubble = document.createElement('div');
    bubble.className = 'call-bubble ' + role;
    bubble.textContent = text;
    chat.appendChild(bubble);
    chat.scrollTop = chat.scrollHeight;
  },

  updateCallStatus(text) {
    const el = document.getElementById('callStatusLabel');
    if (el) el.textContent = text;
  },

  goToStep(step) {
    this.state.step = step;
    document.getElementById('step1').classList.toggle('hidden', step !== 1);
    document.getElementById('step2').classList.toggle('hidden', step !== 2);
    document.getElementById('step2').classList.toggle('visible', step === 2);
    document.getElementById('step3').classList.toggle('hidden', step !== 3);
    document.getElementById('step3').classList.toggle('visible', step === 3);
    document.querySelectorAll('.step-dot').forEach((dot, i) => {
      dot.classList.remove('active', 'done');
      if (i + 1 < step) { dot.classList.add('done'); } else if (i + 1 === step) { dot.classList.add('active'); }
    });
    window.scrollTo(0, 0);
  },

  showError(message) {
    const el = document.getElementById('generateError');
    el.textContent = message;
    el.classList.remove('hidden');
    setTimeout(() => el.classList.add('hidden'), 5000);
  },

  async handleSubscription() {
    const btn = document.getElementById('btnSubscribe');
    btn.disabled = true;
    btn.textContent = 'Redirecting to checkout...';
    try {
      const response = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      if (!response.ok) { const err = await response.json().catch(() => ({})); throw new Error(err.error || 'Failed'); }
      const result = await response.json();
      if (result.url) { window.location.href = result.url; } else { throw new Error('No checkout URL'); }
    } catch (err) {
      console.error('Checkout error:', err);
      btn.disabled = false;
      btn.textContent = 'Start 7-Day Free Trial';
      this.showError('Could not connect to checkout. Please try again.');
    }
  }
};

document.addEventListener('DOMContentLoaded', () => App.init());
