// MyPitchGym - Frontend Application Logic

const App = {
  state: {
    step: 1,
    product: null,
    script: null,
    originalScript: null,
    improvedScript: null,
    isSubscribed: false,
    callMode: 'roleplay',
    transcript: [],
    isListening: false,
    isSpeaking: false,
    isProcessing: false,
    canCapture: false,
    callActive: false,
    recognition: null,
    voiceEnabled: true,
    selectedVoice: null
  },

  init() {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      document.getElementById('voiceError').textContent = 'Voice recognition needs Chrome browser. You can still type your responses.';
      document.getElementById('voiceError').classList.remove('hidden');
    }
    this.setupFormHandlers();
    this.setupCallHandlers();
    this.setupScriptHandlers();
    this.setupVoiceHandlers();
    this.loadVoices();
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

  loadVoices() {
    const voices = window.speechSynthesis ? window.speechSynthesis.getVoices() : [];
    this.state.selectedVoice = voices.find(v => v.name.includes('Google US English')) || voices.find(v => v.name.includes('Samantha')) || voices.find(v => v.lang.startsWith('en')) || voices[0] || null;
    if (window.speechSynthesis) {
      window.speechSynthesis.onvoiceschanged = () => {
        const all = window.speechSynthesis.getVoices();
        this.state.selectedVoice = all.find(v => v.name.includes('Google US English')) || all.find(v => v.name.includes('Samantha')) || all.find(v => v.lang.startsWith('en')) || all[0] || null;
      };
    }
  },

  speak(text) {
    if (!this.state.voiceEnabled || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    if (this.state.selectedVoice) u.voice = this.state.selectedVoice;
    u.rate = 1.05;
    u.pitch = 0.95;
    u.onstart = () => { this.state.isSpeaking = true; this.updateCallStatus('AI is speaking...'); };
    u.onend = () => {
      this.state.isSpeaking = false;
      this.state.canCapture = true;
      this.updateCallStatus('Your turn - just talk');
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
      // Ignore while AI is talking or processing
      if (this.state.isSpeaking || this.state.isProcessing || !this.state.canCapture) return;

      let interim = '';
      finalText = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript;
        if (event.results[i].isFinal) { finalText += t; } else { interim += t; }
      }
      if (interim) { this.updateCallStatus('Hearing: "' + interim.substring(0,50) + '..."'); }
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
      if (event.error === 'not-allowed') {
        document.getElementById('voiceError').textContent = 'Microphone access denied. Allow mic access in your browser settings.';
        document.getElementById('voiceError').classList.remove('hidden');
      }
    };

    this.state.recognition.onend = () => {
      // Auto-restart if call is still active - keeps mic hot entire call
      if (this.state.callActive) {
        setTimeout(() => {
          if (this.state.callActive) {
            try { this.state.recognition.start(); } catch(e) {}
          }
        }, 200);
      }
    };

    return true;
  },

  startListening() {
    if (!this.state.recognition && !this.initSpeechRecognition()) {
      document.getElementById('textInput').disabled = false;
      document.getElementById('btnSendText').disabled = false;
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
    document.getElementById('btnStartSpeaking').textContent = 'End Call';
    document.getElementById('btnStartSpeaking').classList.add('btn-danger');
    this.updateCallStatus('Listening - talk whenever you are ready');
  },

  stopListening() {
    this.state.isListening = false;
    this.state.callActive = false;
    this.state.canCapture = false;
    if (this.state.recognition) { try { this.state.recognition.stop(); } catch(e) {} }
    document.getElementById('btnStartSpeaking').textContent = 'Start the Call';
    document.getElementById('btnStartSpeaking').classList.remove('btn-danger');
  },

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
    document.querySelectorAll('.script-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.script-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const mode = tab.dataset.mode;
        const ua = document.getElementById('scriptUploadArea');
        if (mode === 'upload') { ua.classList.add('visible'); } else { ua.classList.remove('visible'); }
      });
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
    document.getElementById('btnGenerateScript').addEventListener('click', () => this.generateScript());
    document.getElementById('btnImproveScript').addEventListener('click', () => this.improveScript());
    document.getElementById('btnStartCall').addEventListener('click', () => this.startCall('roleplay'));
    document.getElementById('btnRoleReverse').addEventListener('click', () => this.startCall('reversal'));
    document.getElementById('btnRoleReverseAfter').addEventListener('click', () => this.startCall('reversal'));
    document.getElementById('btnBackSetup').addEventListener('click', () => this.goToStep(1));
    document.getElementById('btnPracticeAgain').addEventListener('click', () => this.startCall('roleplay'));
    document.getElementById('btnNewSetup').addEventListener('click', () => { this.goToStep(1); this.state.script = null; this.state.transcript = []; });
    document.getElementById('btnSubscribe').addEventListener('click', () => this.handleSubscription());
  },

  async generateScript() {
    const productName = document.getElementById('productName').value.trim();
    if (!productName) { this.showError('generateError', 'Please tell us what you sell.'); return; }
    const benefits = Array.from(document.querySelectorAll('.benefit-input')).map(i => i.value.trim()).filter(Boolean);
    const data = {
      product_name: productName,
      price_range: document.getElementById('priceRange').value.trim(),
      benefits: benefits,
      objections: document.getElementById('objections').value.trim(),
      extra_context: document.getElementById('extraContext').value.trim(),
      sales_style: document.getElementById('salesStyle').value,
      customer_type: document.getElementById('customerType').value,
      difficulty: document.getElementById('difficulty').value,
      sales_channel: document.getElementById('salesChannel').value
    };
    const ua = document.getElementById('scriptUploadArea');
    if (ua.classList.contains('visible')) {
      data.user_script = document.getElementById('userScript').value.trim();
      if (!data.user_script) { this.showError('generateError', 'Please paste your script or switch to "Generate New".'); return; }
    }
    this.state.product = data;
    const btn = document.getElementById('btnGenerateScript');
    btn.disabled = true;
    btn.innerHTML = 'Generating...';
    try {
      const response = await fetch('/api/generate-script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (!response.ok) { const err = await response.json().catch(() => ({})); throw new Error(err.error || 'Failed to generate script'); }
      const result = await response.json();
      this.state.script = result.script;
      this.state.originalScript = data.user_script || null;
      this.displayScript(result.script);
      this.goToStep(2);
    } catch (err) {
      console.error('Script generation error:', err);
      this.showError('generateError', err.message || 'Something went wrong. Please try again.');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Generate My Script';
    }
  },

  displayScript(script) {
    const container = document.getElementById('scriptContent');
    container.innerHTML = '';
    if (typeof script === 'string') {
      const div = document.createElement('div');
      div.className = 'script-section';
      div.innerHTML = '<h4>Your Script</h4><p>' + this.escapeHtml(script) + '</p>';
      container.appendChild(div);
      return;
    }
    if (script.full_script && !script.opener) {
      const div = document.createElement('div');
      div.className = 'script-section';
      div.innerHTML = '<h4>Your Script</h4><p>' + this.escapeHtml(script.full_script) + '</p>';
      container.appendChild(div);
      return;
    }
    const sections = [
      { key: 'opener', label: 'Opener' },
      { key: 'discovery', label: 'Discovery Questions' },
      { key: 'benefits', label: 'Benefit Talking Points' },
      { key: 'objection_handling', label: 'Objection Handling' },
      { key: 'close', label: 'Close' }
    ];
    sections.forEach(section => {
      if (script[section.key]) {
        const div = document.createElement('div');
        div.className = 'script-section';
        div.innerHTML = '<h4>' + section.label + '</h4><p>' + this.escapeHtml(script[section.key]) + '</p>';
        container.appendChild(div);
      }
    });
  },

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  },

  async improveScript() {
    const btn = document.getElementById('btnImproveScript');
    btn.disabled = true;
    btn.innerHTML = 'Improving...';
    try {
      const response = await fetch('/api/improve-script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ script: this.state.script, original_script: this.state.originalScript, product: this.state.product })
      });
      if (!response.ok) { const err = await response.json().catch(() => ({})); throw new Error(err.error || 'Failed to improve script'); }
      const result = await response.json();
      document.getElementById('originalScript').textContent = this.state.originalScript || this.scriptToText(this.state.script);
      document.getElementById('improvedScript').textContent = result.improved_script;
      document.getElementById('comparisonView').classList.add('visible');
      if (result.improved_script_parsed) { this.state.script = result.improved_script_parsed; this.displayScript(result.improved_script_parsed); }
      else { this.state.script = result.improved_script; this.displayScript(result.improved_script); }
      this.state.improvedScript = result.improved_script;
    } catch (err) {
      console.error('Improve script error:', err);
      this.showError('generateError', err.message || 'Could not improve the script. Please try again.');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Improve This Script';
    }
  },

  scriptToText(script) {
    if (typeof script === 'string') return script;
    return Object.entries(script).map(([k, v]) => k + ': ' + v).join('\n\n');
  },

  setupCallHandlers() {
    document.getElementById('btnStartSpeaking').addEventListener('click', () => {
      if (this.state.callActive && this.state.transcript.length > 0) {
        this.endCall();
      } else {
        this.startListening();
      }
    });
    document.getElementById('btnEndCall').addEventListener('click', () => this.endCall());
    document.getElementById('btnSendText').addEventListener('click', () => {
      const input = document.getElementById('textInput');
      const text = input.value.trim();
      if (text) { input.value = ''; this.handleUserSpeech(text); }
    });
    document.getElementById('textInput').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') { document.getElementById('btnSendText').click(); }
    });
    document.getElementById('voiceToggle').addEventListener('click', () => {
      this.state.voiceEnabled = !this.state.voiceEnabled;
      const toggle = document.getElementById('voiceToggle');
      const status = document.getElementById('voiceStatus');
      if (this.state.voiceEnabled) { toggle.classList.add('active'); status.textContent = 'ON'; status.style.color = '#22c55e'; }
      else { toggle.classList.remove('active'); status.textContent = 'OFF'; status.style.color = '#64748b'; }
      if (!this.state.voiceEnabled && window.speechSynthesis) { window.speechSynthesis.cancel(); }
    });
  },

  setupVoiceHandlers() {
    if (window.speechSynthesis) { window.speechSynthesis.getVoices(); }
  },

  startCall(mode) {
    this.state.callMode = mode;
    this.state.transcript = [];
    this.state.callActive = false;
    this.state.canCapture = false;
    this.state.isProcessing = false;
    document.getElementById('callChat').innerHTML = '';

    const banner = document.getElementById('roleReverseBanner');
    if (mode === 'reversal') {
      banner.classList.remove('hidden');
      this.addChatMessage('system', 'Role Reversal: The AI will pitch to YOU. Play the prospect.');
    } else {
      banner.classList.add('hidden');
      this.addChatMessage('system', 'Cold call - the prospect just answered. Start pitching whenever ready. Just talk naturally. Tap End Call when done.');
    }

    this.goToStep(3);

    if (mode === 'reversal') {
      setTimeout(() => this.startRoleReversal(), 500);
    } else {
      // Auto-start listening - user is the salesperson, they pitch first
      setTimeout(() => this.startListening(), 500);
    }
  },

  async startRoleReversal() {
    this.addChatMessage('ai', '...');
    this.addChatMessage('system', 'AI is preparing to pitch...');
    try {
      const response = await fetch('/api/roleplay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'reversal_start',
          product: this.state.product,
          script: this.state.script,
          customer_type: this.state.product.customer_type,
          sales_style: this.state.product.sales_style,
          sales_channel: this.state.product.sales_channel
        })
      });
      if (!response.ok) { const err = await response.json().catch(() => ({})); throw new Error(err.error || 'Failed'); }
      const result = await response.json();
      document.getElementById('callChat').innerHTML = '';
      this.addChatMessage('system', 'The AI is now the salesperson. Respond as the prospect.');
      this.addChatMessage('ai', result.message);
      this.speak(result.message);
      this.state.transcript.push({ role: 'assistant', content: result.message });
    } catch (err) {
      console.error('Role reversal error:', err);
      document.getElementById('callChat').innerHTML = '';
      this.addChatMessage('system', 'Could not start. Please try again.');
    }
  },

  async handleUserSpeech(text) {
    if (!text || !text.trim()) return;
    this.addChatMessage('user', text);
    this.state.transcript.push({ role: 'user', content: text });
    this.addChatMessage('ai', '...');
    this.updateCallStatus('AI is thinking...');
    try {
      const response = await fetch('/api/roleplay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: this.state.callMode,
          message: text,
          transcript: this.state.transcript,
          product: this.state.product,
          script: this.state.script,
          customer_type: this.state.product.customer_type,
          sales_style: this.state.product.sales_style,
          sales_channel: this.state.product.sales_channel
        })
      });
      if (!response.ok) { const err = await response.json().catch(() => ({})); throw new Error(err.error || 'Failed'); }
      const result = await response.json();
      this.removeLastPlaceholder();
      this.addChatMessage('ai', result.message);
      this.speak(result.message);
      this.state.transcript.push({ role: 'assistant', content: result.message });
    } catch (err) {
      console.error('Roleplay error:', err);
      this.removeLastPlaceholder();
      this.addChatMessage('system', 'Connection issue. Try speaking again.');
      this.state.isProcessing = false;
      this.state.canCapture = true;
    }
  },

  removeLastPlaceholder() {
    const chat = document.getElementById('callChat');
    const last = chat.lastElementChild;
    if (last && last.textContent === '...') { last.remove(); }
  },

  async endCall() {
    this.stopListening();
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    if (this.state.transcript.length < 2) {
      this.addChatMessage('system', 'Call ended. Not enough conversation for coaching.');
      setTimeout(() => this.goToStep(1), 1500);
      return;
    }
    this.updateCallStatus('Analyzing your call...');
    try {
      const response = await fetch('/api/coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript: this.state.transcript,
          script: this.state.script,
          sales_style: this.state.product.sales_style,
          product: this.state.product
        })
      });
      if (!response.ok) { const err = await response.json().catch(() => ({})); throw new Error(err.error || 'Failed'); }
      const result = await response.json();
      this.displayCoaching(result);
      this.goToStep(4);
    } catch (err) {
      console.error('Coaching error:', err);
      this.addChatMessage('system', 'Could not generate feedback. Please try another call.');
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
    if (coaching.nailed && coaching.nailed.length) { coaching.nailed.forEach(item => listEl.appendChild(this.createCoachingItem('✅', item))); }
    if (coaching.missed && coaching.missed.length) { coaching.missed.forEach(item => listEl.appendChild(this.createCoachingItem('⚠️', item))); }
    if (coaching.tips && coaching.tips.length) { coaching.tips.forEach(item => listEl.appendChild(this.createCoachingItem('💡', item))); }
    if (coaching.objection_handling) { listEl.appendChild(this.createCoachingItem('🎯', 'Objection Handling: ' + coaching.objection_handling)); }
  },

  createCoachingItem(icon, text) {
    const div = document.createElement('div');
    div.className = 'coaching-item';
    div.innerHTML = '<div class="icon">' + icon + '</div><div class="text">' + text + '</div>';
    return div;
  },

  addChatMessage(role, text) {
    const chat = document.getElementById('callChat');
    const bubble = document.createElement('div');
    bubble.className = 'call-bubble ' + role;
    bubble.textContent = text;
    chat.appendChild(bubble);
    chat.scrollTop = chat.scrollHeight;
  },

  updateCallStatus(text) { document.getElementById('callStatusLabel').textContent = text; },

  goToStep(step) {
    this.state.step = step;
    document.getElementById('step1').classList.toggle('hidden', step !== 1);
    document.getElementById('step2').classList.toggle('hidden', step !== 2);
    document.getElementById('step2').classList.toggle('visible', step === 2);
    document.getElementById('step3').classList.toggle('hidden', step !== 3);
    document.getElementById('step3').classList.toggle('visible', step === 3);
    document.getElementById('step4').classList.toggle('hidden', step !== 4);
    document.getElementById('step4').classList.toggle('visible', step === 4);
    document.querySelectorAll('.step-dot').forEach((dot, i) => {
      dot.classList.remove('active', 'done');
      if (i + 1 < step) { dot.classList.add('done'); } else if (i + 1 === step) { dot.classList.add('active'); }
    });
    window.scrollTo(0, 0);
  },

  showError(elementId, message) {
    const el = document.getElementById(elementId);
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
      this.showError('generateError', 'Could not connect to checkout. Please try again.');
    }
  }
};

document.addEventListener('DOMContentLoaded', () => App.init());