// MyPitchGym - Landing Page Demo Call (2 minutes, no signup)

const Demo = {
  state: {
    callActive: false,
    callStarted: false,
    transcript: [],
    isListening: false,
    isSpeaking: false,
    isProcessing: false,
    canCapture: false,
    recognition: null,
    voiceEnabled: true,
    selectedVoice: null,
    timerInterval: null,
    timeRemaining: 120
  },

  demoProduct: {
    product_name: 'Solar panel installations for homeowners',
    price_range: '15k-25k',
    benefits: ['Cuts electric bill 60-80%', '25-year warranty', '0% financing', 'Increases home value'],
    objections: 'Too expensive, I need to think about it, not sure it works in my area',
    sales_style: 'consultative',
    customer_type: 'skeptic',
    difficulty: 'beginner',
    sales_channel: 'phone'
  },

  init() {
    if (window.speechSynthesis) {
      const load = () => {
        const v = window.speechSynthesis.getVoices();
        this.state.selectedVoice = v.find(v => v.name.includes('Google US English')) || v.find(v => v.name.includes('Samantha')) || v.find(v => v.lang.startsWith('en')) || v[0] || null;
      };
      load();
      window.speechSynthesis.onvoiceschanged = load;
    }
    document.getElementById('demoBtn').addEventListener('click', () => this.openModal());
    document.getElementById('demoCloseBtn').addEventListener('click', () => this.closeModal());
    document.getElementById('demoStartBtn').addEventListener('click', () => this.toggleCall());
    document.getElementById('demoModal').addEventListener('click', (e) => {
      if (e.target.id === 'demoModal') this.closeModal();
    });
    setTimeout(() => { document.getElementById('demoWidget').classList.add('visible'); }, 3000);
  },

  openModal() { document.getElementById('demoModal').classList.add('visible'); },

  closeModal() {
    if (this.state.callActive) { this.endCall(false); }
    document.getElementById('demoModal').classList.remove('visible');
  },

  toggleCall() {
    if (this.state.callActive && this.state.transcript.length > 0) {
      this.endCall(false);
    } else {
      this.startCall();
    }
  },

  speak(text) {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    if (this.state.selectedVoice) u.voice = this.state.selectedVoice;
    u.rate = 1.05;
    u.pitch = 0.95;
    u.onstart = () => { this.state.isSpeaking = true; };
    u.onend = () => {
      this.state.isSpeaking = false;
      this.state.canCapture = true;
    };
    window.speechSynthesis.speak(u);
  },

  initSpeechRecognition() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return false;
    this.state.recognition = new SR();
    this.state.recognition.continuous = true;
    this.state.recognition.interimResults = true;
    this.state.recognition.lang = 'en-US';

    let silenceTimer = null;
    let finalText = '';

    this.state.recognition.onresult = (event) => {
      if (this.state.isSpeaking || this.state.isProcessing || !this.state.canCapture) return;
      let interim = '';
      finalText = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript;
        if (event.results[i].isFinal) { finalText += t; } else { interim += t; }
      }
      if (finalText) {
        clearTimeout(silenceTimer);
        silenceTimer = setTimeout(() => {
          if (finalText.trim() && this.state.canCapture && !this.state.isProcessing) {
            this.state.canCapture = false;
            this.state.isProcessing = true;
            this.handleUserSpeech(finalText.trim());
          }
        }, 800);
      }
    };

    this.state.recognition.onerror = (event) => {
      if (event.error === 'no-speech') return;
    };

    this.state.recognition.onend = () => {
      if (this.state.callActive && this.state.timeRemaining > 0) {
        setTimeout(() => {
          if (this.state.callActive && this.state.timeRemaining > 0) {
            try { this.state.recognition.start(); } catch(e) {}
          }
        }, 200);
      }
    };

    return true;
  },

  startListening() {
    if (!this.state.recognition && !this.initSpeechRecognition()) {
      this.addChatMessage('system', 'Voice needs Chrome. This demo works best in Chrome browser.');
      return;
    }
    this.state.callActive = true;
    this.state.canCapture = true;
    this.state.isProcessing = false;
    try {
      this.state.recognition.start();
      this.state.isListening = true;
    } catch(e) {
      if (e.message && e.message.includes('already started')) { this.state.isListening = true; }
    }
    document.getElementById('demoStartBtn').textContent = 'End Call';
    document.getElementById('demoStartBtn').classList.add('listening');
  },

  stopListening() {
    this.state.isListening = false;
    this.state.callActive = false;
    this.state.canCapture = false;
    if (this.state.recognition) { try { this.state.recognition.stop(); } catch(e) {} }
  },

  startCall() {
    this.state.callStarted = true;
    this.state.transcript = [];
    this.state.callActive = false;
    this.state.canCapture = false;
    this.state.isProcessing = false;
    document.getElementById('demoChat').innerHTML = '';
    this.addChatMessage('system', 'Cold call - the prospect just answered. Start pitching solar panels whenever ready. Just talk naturally.');
    this.startTimer();
    setTimeout(() => this.startListening(), 500);
  },

  startTimer() {
    this.state.timeRemaining = 120;
    this.updateTimerDisplay();
    this.state.timerInterval = setInterval(() => {
      this.state.timeRemaining--;
      this.updateTimerDisplay();
      if (this.state.timeRemaining <= 0) { this.endCall(true); }
    }, 1000);
  },

  stopTimer() {
    if (this.state.timerInterval) { clearInterval(this.state.timerInterval); this.state.timerInterval = null; }
  },

  updateTimerDisplay() {
    const mins = Math.floor(this.state.timeRemaining / 60);
    const secs = this.state.timeRemaining % 60;
    document.getElementById('demoTimerText').textContent = mins + ':' + (secs < 10 ? '0' : '') + secs;
    const pct = (this.state.timeRemaining / 120) * 100;
    document.getElementById('demoTimerFill').style.width = pct + '%';
    if (this.state.timeRemaining <= 30) {
      document.getElementById('demoTimerText').style.color = '#ef4444';
      document.getElementById('demoTimerFill').style.background = '#ef4444';
    }
  },

  async handleUserSpeech(text) {
    if (!text || !text.trim()) return;
    this.addChatMessage('user', text);
    this.state.transcript.push({ role: 'user', content: text });
    this.addChatMessage('ai', '...');
    try {
      const response = await fetch('/api/roleplay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'roleplay',
          message: text,
          transcript: this.state.transcript,
          product: this.demoProduct,
          script: null,
          customer_type: 'skeptic',
          sales_style: 'consultative',
          sales_channel: 'phone'
        })
      });
      if (!response.ok) throw new Error('Failed');
      const result = await response.json();
      const chat = document.getElementById('demoChat');
      const last = chat.lastElementChild;
      if (last && last.textContent === '...') last.remove();
      this.addChatMessage('ai', result.message);
      this.speak(result.message);
      this.state.transcript.push({ role: 'assistant', content: result.message });
    } catch (err) {
      const chat = document.getElementById('demoChat');
      const last = chat.lastElementChild;
      if (last && last.textContent === '...') last.remove();
      this.addChatMessage('system', 'Connection issue. Try speaking again.');
      this.state.isProcessing = false;
      this.state.canCapture = true;
    }
  },

  endCall(timedOut) {
    this.stopListening();
    this.stopTimer();
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    if (timedOut) { this.addChatMessage('system', '2 minutes is up! That was a quick sample.'); }
    document.getElementById('demoStartBtn').style.display = 'none';
    document.getElementById('demoChat').style.display = 'none';
    document.querySelector('.demo-timer-bar').style.display = 'none';
    document.getElementById('demoTimerText').style.display = 'none';
    document.querySelector('.demo-header').style.display = 'none';
    document.getElementById('demoUpsell').classList.remove('hidden');
  },

  addChatMessage(role, text) {
    const chat = document.getElementById('demoChat');
    const bubble = document.createElement('div');
    bubble.className = 'demo-bubble ' + role;
    bubble.textContent = text;
    chat.appendChild(bubble);
    chat.scrollTop = chat.scrollHeight;
  }
};

document.addEventListener('DOMContentLoaded', () => Demo.init());