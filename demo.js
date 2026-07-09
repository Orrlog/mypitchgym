// MyPitchGym — Landing Page Demo Call
// 2-minute voice demo with pre-loaded scenario, then upsell to trial

const Demo = {
  state: {
    isActive: false,
    transcript: [],
    isListening: false,
    recognition: null,
    voiceEnabled: true,
    selectedVoice: null,
    timerInterval: null,
    timeRemaining: 120, // 2 minutes in seconds
    callStarted: false
  },

  // Pre-loaded scenario for the demo
  demoProduct: {
    product_name: 'Solar panel installations for homeowners',
    price_range: '$15,000-$25,000',
    benefits: ['Cuts electric bill 60-80%', '25-year warranty', '0% financing available', 'Increases home value'],
    objections: 'Too expensive, I need to think about it, not sure it works in my area',
    sales_style: 'consultative',
    customer_type: 'skeptic',
    difficulty: 'beginner'
  },

  init() {
    // Load voices
    if (window.speechSynthesis) {
      const loadVoices = () => {
        const voices = window.speechSynthesis.getVoices();
        this.state.selectedVoice = voices.find(v => v.name.includes('Google US English')) ||
                                    voices.find(v => v.name.includes('Samantha')) ||
                                    voices.find(v => v.lang.startsWith('en')) ||
                                    voices[0] || null;
      };
      loadVoices();
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }

    // Wire up buttons
    document.getElementById('demoBtn').addEventListener('click', () => this.openModal());
    document.getElementById('demoCloseBtn').addEventListener('click', () => this.closeModal());
    document.getElementById('demoStartBtn').addEventListener('click', () => this.startCall());

    // Close on overlay click
    document.getElementById('demoModal').addEventListener('click', (e) => {
      if (e.target.id === 'demoModal') this.closeModal();
    });

    // Show the demo button with a slight delay so it feels like it "arrives"
    setTimeout(() => {
      document.getElementById('demoWidget').classList.add('visible');
    }, 3000);
  },

  openModal() {
    document.getElementById('demoModal').classList.add('visible');
  },

  closeModal() {
    // Stop everything if call is active
    if (this.state.callStarted) {
      this.endCall(false);
    }
    document.getElementById('demoModal').classList.remove('visible');
  },

  speak(text) {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    if (this.state.selectedVoice) utterance.voice = this.state.selectedVoice;
    utterance.rate = 1.05;
    utterance.pitch = 0.95;
    utterance.onend = () => {
      // Auto-restart listening for natural conversation
      if (this.state.callStarted && this.state.timeRemaining > 0) {
        this.startListening();
      }
    };
    window.speechSynthesis.speak(utterance);
  },

  initSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return false;
    this.state.recognition = new SpeechRecognition();
    this.state.recognition.continuous = true;
    this.state.recognition.interimResults = true;
    this.state.recognition.lang = 'en-US';

    let finalTranscript = '';
    let silenceTimer = null;

    this.state.recognition.onresult = (event) => {
      let interim = '';
      finalTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript;
        } else {
          interim += transcript;
        }
      }
      if (finalTranscript) {
        clearTimeout(silenceTimer);
        silenceTimer = setTimeout(() => {
          if (this.state.isListening) {
            this.pauseListening();
            this.handleUserSpeech(finalTranscript.trim());
          }
        }, 800);
      }
    };

    this.state.recognition.onerror = (event) => {
      if (event.error === 'no-speech') return;
      console.error('Demo speech recognition error:', event.error);
    };

    this.state.recognition.onend = () => {
      if (this.state.isListening) {
        try { this.state.recognition.start(); } catch(e) {}
      }
    };

    return true;
  },

  startListening() {
    if (!this.state.recognition && !this.initSpeechRecognition()) {
      this.addChatMessage('system', 'Voice needs Chrome browser. This demo works best in Chrome.');
      return;
    }
    try {
      if (window.speechSynthesis) window.speechSynthesis.cancel();
      this.state.recognition.start();
      this.state.isListening = true;
      document.getElementById('demoStartBtn').textContent = '🔴 Listening... (tap to stop)';
      document.getElementById('demoStartBtn').classList.add('listening');
    } catch(e) {
      console.error('Demo recognition start error:', e);
    }
  },

  stopListening() {
    if (this.state.recognition) {
      this.state.isListening = false;
      try { this.state.recognition.stop(); } catch(e) {}
      document.getElementById('demoStartBtn').textContent = '🎤 Start Speaking';
      document.getElementById('demoStartBtn').classList.remove('listening');
    }
  },

  startCall() {
    // If already listening, stop (toggle behavior)
    if (this.state.isListening) {
      this.stopListening();
      return;
    }

    // First click starts the call
    if (!this.state.callStarted) {
      this.state.callStarted = true;
      this.state.transcript = [];
      document.getElementById('demoChat').innerHTML = '';
      this.addChatMessage('system', 'The call has started. Pitch me those solar panels!');

      // Start the 2-minute timer
      this.startTimer();

      // AI prospect opens first
      this.addChatMessage('ai', '...');
      setTimeout(() => this.getAIOpening(), 500);
    }

    this.startListening();
  },

  startTimer() {
    this.state.timeRemaining = 120;
    this.updateTimerDisplay();
    this.state.timerInterval = setInterval(() => {
      this.state.timeRemaining--;
      this.updateTimerDisplay();
      if (this.state.timeRemaining <= 0) {
        this.endCall(true); // timed out
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
    const display = mins + ':' + (secs < 10 ? '0' : '') + secs;
    document.getElementById('demoTimerText').textContent = display;

    // Update progress bar
    const pct = (this.state.timeRemaining / 120) * 100;
    const fill = document.getElementById('demoTimerFill');
    fill.style.width = pct + '%';

    // Turn red in last 30 seconds
    if (this.state.timeRemaining <= 30) {
      document.getElementById('demoTimerText').style.color = '#ef4444';
      fill.style.background = '#ef4444';
    }
  },

  async getAIOpening() {
    try {
      const response = await fetch('/api/roleplay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'roleplay',
          message: "Hi, you've reached me about solar panels. What's this about?",
          transcript: [{ role: 'user', content: "Hi, you've reached me about solar panels. What's this about?" }],
          product: this.demoProduct,
          script: null,
          customer_type: 'skeptic',
          sales_style: 'consultative',
          sales_channel: 'phone'
        })
      });

      if (!response.ok) throw new Error('Failed');
      const result = await response.json();

      // Remove placeholder
      const chat = document.getElementById('demoChat');
      const last = chat.lastElementChild;
      if (last && last.textContent === '...') last.remove();

      this.addChatMessage('ai', result.message);
      this.speak(result.message);
      this.state.transcript.push({ role: 'assistant', content: result.message });
    } catch (err) {
      console.error('Demo AI opening error:', err);
      this.addChatMessage('system', 'Connection issue. Please try again.');
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

      // Remove placeholder
      const chat = document.getElementById('demoChat');
      const last = chat.lastElementChild;
      if (last && last.textContent === '...') last.remove();

      this.addChatMessage('ai', result.message);
      this.speak(result.message);
      this.state.transcript.push({ role: 'assistant', content: result.message });
    } catch (err) {
      console.error('Demo roleplay error:', err);
      const chat = document.getElementById('demoChat');
      const last = chat.lastElementChild;
      if (last && last.textContent === '...') last.remove();
      this.addChatMessage('system', 'Connection issue. Try speaking again.');
    }
  },

  endCall(timedOut) {
    this.stopListening();
    this.stopTimer();
    if (window.speechSynthesis) window.speechSynthesis.cancel();

    if (timedOut) {
      this.addChatMessage('system', '⏰ 2 minutes is up! That was a quick sample call.');
    }

    // Show the upsell screen
    setTimeout(() => {
      document.getElementById('demoStartBtn').style.display = 'none';
      document.getElementById('demoChat').style.display = 'none';
      document.querySelector('.demo-timer-bar').style.display = 'none';
      document.getElementById('demoTimerText').style.display = 'none';
      document.querySelector('.demo-header').style.display = 'none';
      document.getElementById('demoUpsell').classList.remove('hidden');
    }, 1500);
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