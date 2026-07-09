// MyPitchGym - Landing Page Demo Call (2 minutes, no signup)

const Demo = {
  state: {
    callActive: false,
    transcript: [],
    isListening: false,
    isSpeaking: false,
    isProcessing: false,
    canCapture: false,
    recognition: null,
    voiceEnabled: true,
    selectedVoice: null,
    timerInterval: null,
    timeRemaining: 120,
    finalText: '',
    silenceTimer: null,
    restartTimer: null
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

    const sendBtn = document.getElementById('demoSendText');
    const textInput = document.getElementById('demoTextInput');
    if (sendBtn) sendBtn.addEventListener('click', () => this.sendText());
    if (textInput) textInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.sendText();
    });

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

  sendText() {
    const input = document.getElementById('demoTextInput');
    if (!input) return;
    const text = input.value.trim();
    if (text && this.state.callActive && !this.state.isProcessing && !this.state.isSpeaking) {
      input.value = '';
      this.state.canCapture = false;
      this.state.isProcessing = true;
      this.pauseRecognition();
      this.handleUserSpeech(text);
    }
  },

  debug(msg) {
    const el = document.getElementById('demoDebug');
    if (el) {
      el.textContent = msg;
      el.classList.remove('hidden');
    }
  },

  speak(text) {
    if (!window.speechSynthesis) {
      this.state.isSpeaking = false;
      this.state.canCapture = true;
      this.startRecognition();
      return;
    }
    // Don't stop recognition - just set canCapture false so we ignore speech while AI talks
    this.state.canCapture = false;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    if (this.state.selectedVoice) u.voice = this.state.selectedVoice;
    u.rate = 1.05;
    u.pitch = 0.95;
    u.onstart = () => { this.state.isSpeaking = true; };
    u.onend = () => {
      this.state.isSpeaking = false;
      this.state.canCapture = true;
      this.debug('Your turn - speak or type below');
    };
    u.onerror = () => {
      this.state.isSpeaking = false;
      this.state.canCapture = true;
      this.startRecognition();
    };
    window.speechSynthesis.speak(u);
  },

  initSpeechRecognition() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      this.debug('Voice not available - type below to talk');
      return false;
    }
    this.state.recognition = new SR();
    this.state.recognition.continuous = true;
    this.state.recognition.interimResults = true;
    this.state.recognition.lang = 'en-US';

    this.state.recognition.onresult = (event) => {
      if (this.state.isSpeaking || this.state.isProcessing || !this.state.canCapture) return;
      let interim = '';
      this.state.finalText = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript;
        if (event.results[i].isFinal) { this.state.finalText += t; } else { interim += t; }
      }
      if (interim) this.debug('Hearing: "' + interim.substring(0, 40) + '"');
      if (this.state.finalText) {
        clearTimeout(this.state.silenceTimer);
        this.state.silenceTimer = setTimeout(() => {
          if (this.state.finalText.trim() && this.state.canCapture && !this.state.isProcessing) {
            this.state.canCapture = false;
            this.state.isProcessing = true;
            this.handleUserSpeech(this.state.finalText.trim());
          }
        }, 800);
      }
    };

    this.state.recognition.onerror = (event) => {
      if (event.error === 'no-speech') return;
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        this.debug('Mic blocked - type below to talk');
      } else {
        this.debug('Mic error: ' + event.error + ' - type below');
      }
    };

    this.state.recognition.onend = () => {
      this.state.isListening = false;
      // Auto-restart recognition if call is still active - keeps mic hot entire call
      if (this.state.callActive && !this.state.isSpeaking && !this.state.isProcessing) {
        clearTimeout(this.state.restartTimer);
        this.state.restartTimer = setTimeout(() => {
          if (this.state.callActive && !this.state.isSpeaking && !this.state.isProcessing) {
            this.startRecognition();
          }
        }, 200);
      }
    };

    return true;
  },

  startRecognition() {
    if (!this.state.recognition || !this.state.callActive) return;
    if (this.state.isListening) return;
    try {
      this.state.recognition.start();
      this.state.isListening = true;
    } catch(e) {
      if (e.message && e.message.includes('already started')) {
        this.state.isListening = true;
      }
    }
  },

  pauseRecognition() {
    if (this.state.recognition && this.state.isListening) {
      try { this.state.recognition.stop(); } catch(e) {}
      this.state.isListening = false;
    }
  },

  startCall() {
    // Reset all state
    this.state.transcript = [];
    this.state.callActive = true;
    this.state.canCapture = false;
    this.state.isProcessing = false;
    this.state.isSpeaking = false;
    this.state.finalText = '';

    // Show text input (always visible as fallback)
    const textArea = document.getElementById('demoTextInputArea');
    if (textArea) textArea.classList.remove('hidden');

    // Reset UI
    document.getElementById('demoChat').innerHTML = '';
    document.getElementById('demoChat').style.display = '';
    document.getElementById('demoStartBtn').textContent = 'End Call';
    document.getElementById('demoStartBtn').classList.add('listening');
    document.getElementById('demoStartBtn').style.display = '';

    const timerBar = document.querySelector('.demo-timer-bar');
    if (timerBar) timerBar.style.display = '';
    const timerText = document.getElementById('demoTimerText');
    if (timerText) timerText.style.display = '';
    const header = document.querySelector('.demo-header');
    if (header) header.style.display = '';
    document.getElementById('demoUpsell').classList.add('hidden');

    this.addChatMessage('system', 'Calling... connecting you now.');
    this.startTimer();

    // START MIC IMMEDIATELY - Chrome requires user gesture for mic permission
    // canCapture is false so we won't process speech while the prospect greets
    if (this.initSpeechRecognition()) {
      this.startRecognition();
      this.debug('Listening (prospect is answering...)');
    } else {
      this.debug('No voice - type below to talk');
    }

    // Prospect answers after 1 second
    setTimeout(() => {
      if (!this.state.callActive) return;
      this.prospectAnswers();
    }, 1000);
  },

  prospectAnswers() {
    const greeting = "Hello?";
    this.addChatMessage('ai', greeting);
    this.state.transcript.push({ role: 'assistant', content: greeting });
    this.speak(greeting);

    // After greeting, enable user to talk (mic is already running)
    setTimeout(() => {
      if (!this.state.callActive) return;
      this.state.canCapture = true;
      this.debug('Your turn - speak or type below');
    }, 1800);
  },

  startTimer() {
    this.state.timeRemaining = 120;
    this.updateTimerDisplay();
    this.state.timerInterval = setInterval(() => {
      this.state.timeRemaining--;
      this.updateTimerDisplay();
      if (this.state.timeRemaining <= 0) {
        this.endCall(true);
      }
    }, 1000);
  },

  stopTimer() {
    if (this.state.timerInterval) {
      clearInterval(this.state.timerInterval);
      this.state.timerInterval = null;
    }
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
      if (this.state.timeRemaining <= 30) {
        el.style.color = '#ef4444';
        fill.style.background = '#ef4444';
      }
    }
  },

  async handleUserSpeech(text) {
    if (!text || !text.trim()) {
      this.state.isProcessing = false;
      this.state.canCapture = true;
      this.startRecognition();
      return;
    }
    this.addChatMessage('user', text);
    this.state.transcript.push({ role: 'user', content: text });
    this.addChatMessage('ai', '...');
    this.debug('AI is thinking...');

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
      this.state.transcript.push({ role: 'assistant', content: result.message });
      this.state.isProcessing = false;
      this.speak(result.message);
    } catch (err) {
      const chat = document.getElementById('demoChat');
      const last = chat.lastElementChild;
      if (last && last.textContent === '...') last.remove();
      this.addChatMessage('system', 'Connection issue. Try again.');
      this.state.isProcessing = false;
      this.state.canCapture = true;
      this.startRecognition();
    }
  },

  endCall(timedOut) {
    this.state.callActive = false;
    this.state.canCapture = false;
    this.state.isProcessing = false;
    this.state.isSpeaking = false;

    if (this.state.recognition) {
      try { this.state.recognition.stop(); } catch(e) {}
    }
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    clearTimeout(this.state.silenceTimer);
    clearTimeout(this.state.restartTimer);
    this.stopTimer();

    document.getElementById('demoStartBtn').style.display = 'none';
    document.getElementById('demoChat').style.display = 'none';
    const timerBar = document.querySelector('.demo-timer-bar');
    if (timerBar) timerBar.style.display = 'none';
    const timerText = document.getElementById('demoTimerText');
    if (timerText) timerText.style.display = 'none';
    const header = document.querySelector('.demo-header');
    if (header) header.style.display = 'none';
    const textArea = document.getElementById('demoTextInputArea');
    if (textArea) textArea.classList.add('hidden');
    const debug = document.getElementById('demoDebug');
    if (debug) debug.classList.add('hidden');

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
