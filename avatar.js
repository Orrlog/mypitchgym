// MyPitchGym - Stylized Avatar with Lip-Sync Animation
// Pure canvas, no external dependencies, no API calls.
// The avatar reacts to audio amplitude for realistic lip-sync.

const Avatar = {
  canvas: null,
  ctx: null,
  state: {
    mode: "idle",        // idle | speaking | listening
    amplitude: 0,        // 0-1, drives mouth open amount
    smoothAmp: 0,        // smoothed amplitude for natural movement
    blinkTimer: 0,
    isBlinking: false,
    blinkProgress: 0,
    headTilt: 0,
    targetTilt: 0,
    eyeOffsetX: 0,
    eyeOffsetY: 0,
    animFrame: null,
    audioAnalyser: null,
    audioSource: null,
    audioCtx: null,
    currentAudio: null,
    colorScheme: "default",  // default | reversal
    bobOffset: 0,
    bobPhase: 0
  },

  colorSchemes: {
    default: {
      face: "#2a2a3e",
      faceShadow: "#1e1e30",
      faceHighlight: "#353550",
      accent: "#6366f1",
      accentLight: "#818cf8",
      mouth: "#1a1a2e",
      mouthActive: "#4f46e5",
      eye: "#c7d2fe",
      eyeGlow: "rgba(99, 102, 241, 0.4)",
      name: "Prospect"
    },
    reversal: {
      face: "#2a3e2a",
      faceShadow: "#1e301e",
      faceHighlight: "#355035",
      accent: "#22c55e",
      accentLight: "#4ade80",
      mouth: "#1a2e1a",
      mouthActive: "#16a34a",
      eye: "#bbf7d0",
      eyeGlow: "rgba(34, 197, 94, 0.4)",
      name: "AI Salesperson"
    }
  },

  init(canvasId) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext("2d");
    this.canvas.width = 120;
    this.canvas.height = 120;
    this.startAnimation();
  },

  setMode(mode) {
    this.state.mode = mode;
  },

  setColorScheme(scheme) {
    this.state.colorScheme = scheme;
  },

  // Connect to an Audio element to drive lip-sync from actual audio playback
  connectAudio(audioElement) {
    try {
      // Disconnect previous
      this.disconnectAudio();

      if (!audioElement) return;

      // Create audio context if needed
      if (!this.state.audioCtx) {
        this.state.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }

      // Resume if suspended
      if (this.state.audioCtx.state === "suspended") {
        this.state.audioCtx.resume();
      }

      this.state.audioSource = this.state.audioCtx.createMediaElementSource(audioElement);
      this.state.audioAnalyser = this.state.audioCtx.createAnalyser();
      this.state.audioAnalyser.fftSize = 256;
      this.state.audioAnalyser.smoothingTimeConstant = 0.7;
      this.state.audioSource.connect(this.state.audioAnalyser);
      this.state.audioAnalyser.connect(this.state.audioCtx.destination);
      this.state.currentAudio = audioElement;
    } catch(e) {
      // Audio context might already be connected, fall back to timer-based animation
      this.state.audioAnalyser = null;
    }
  },

  disconnectAudio() {
    try {
      if (this.state.audioSource) {
        this.state.audioSource.disconnect();
        this.state.audioSource = null;
      }
      if (this.state.audioAnalyser) {
        this.state.audioAnalyser.disconnect();
        this.state.audioAnalyser = null;
      }
    } catch(e) {}
    this.state.currentAudio = null;
  },

  // Read amplitude from analyser if available
  getAmplitude() {
    if (!this.state.audioAnalyser) return 0;
    const data = new Uint8Array(this.state.audioAnalyser.frequencyBinCount);
    this.state.audioAnalyser.getByteFrequencyData(data);
    let sum = 0;
    // Focus on lower frequency bands (voice range)
    const voiceBands = Math.min(data.length, 32);
    for (let i = 0; i < voiceBands; i++) sum += data[i];
    const avg = sum / voiceBands / 255;
    return Math.min(1, avg * 1.8);  // amplify a bit
  },

  startAnimation() {
    const animate = () => {
      this.draw();
      this.state.animFrame = requestAnimationFrame(animate);
    };
    animate();
  },

  stopAnimation() {
    if (this.state.animFrame) {
      cancelAnimationFrame(this.state.animFrame);
      this.state.animFrame = null;
    }
    this.disconnectAudio();
  },

  draw() {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const cs = this.colorSchemes[this.state.colorScheme] || this.colorSchemes.default;

    // Clear
    ctx.clearRect(0, 0, w, h);

    // Get amplitude
    if (this.state.mode === "speaking") {
      this.state.amplitude = this.getAmplitude();
    } else {
      this.state.amplitude = 0;
    }

    // Smooth amplitude
    this.state.smoothAmp += (this.state.amplitude - this.state.smoothAmp) * 0.3;

    // Head bob when speaking
    if (this.state.mode === "speaking") {
      this.state.bobPhase += 0.08;
      this.state.bobOffset = Math.sin(this.state.bobPhase) * 1.5 * this.state.smoothAmp;
    } else {
      this.state.bobPhase = 0;
      this.state.bobOffset *= 0.9;
    }

    // Blink logic
    this.state.blinkTimer++;
    if (!this.state.isBlinking && this.state.blinkTimer > 120 + Math.random() * 180) {
      this.state.isBlinking = true;
      this.state.blinkProgress = 0;
      this.state.blinkTimer = 0;
    }
    if (this.state.isBlinking) {
      this.state.blinkProgress += 0.15;
      if (this.state.blinkProgress >= 1) {
        this.state.isBlinking = false;
      }
    }

    // Head tilt - subtle movement
    this.state.targetTilt = Math.sin(Date.now() * 0.0008) * 0.03;
    if (this.state.mode === "listening") {
      this.state.targetTilt += 0.05;  // slight head tilt when listening
    }
    this.state.headTilt += (this.state.targetTilt - this.state.headTilt) * 0.05;

    // Eye movement - subtle tracking
    const trackT = Date.now() * 0.0005;
    this.state.eyeOffsetX = Math.sin(trackT) * 1.5;
    this.state.eyeOffsetY = Math.cos(trackT * 1.3) * 1;

    const cx = w / 2;
    const cy = h / 2 + this.state.bobOffset;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(this.state.headTilt);

    // ---- Draw face ----
    // Glow ring when active
    if (this.state.mode === "speaking" || this.state.mode === "listening") {
      const glowRadius = 52 + this.state.smoothAmp * 6;
      const glowGrad = ctx.createRadialGradient(0, 0, 40, 0, 0, glowRadius);
      glowGrad.addColorStop(0, cs.eyeGlow);
      glowGrad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = glowGrad;
      ctx.beginPath();
      ctx.arc(0, 0, glowRadius, 0, Math.PI * 2);
      ctx.fill();
    }

    // Face circle (main)
    const faceGrad = ctx.createRadialGradient(-8, -8, 10, 0, 0, 45);
    faceGrad.addColorStop(0, cs.faceHighlight);
    faceGrad.addColorStop(0.7, cs.face);
    faceGrad.addColorStop(1, cs.faceShadow);
    ctx.fillStyle = faceGrad;
    ctx.beginPath();
    ctx.arc(0, 0, 42, 0, Math.PI * 2);
    ctx.fill();

    // Face outline
    ctx.strokeStyle = cs.accent;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 42, 0, Math.PI * 2);
    ctx.stroke();

    // ---- Eyes ----
    const eyeY = -8;
    const eyeSpacing = 16;
    const eyeRadius = 5;

    for (let side = -1; side <= 1; side += 2) {
      const ex = side * eyeSpacing;
      const ey = eyeY;

      if (this.state.isBlinking) {
        // Closed eye - draw a line
        ctx.strokeStyle = cs.eye;
        ctx.lineWidth = 2;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(ex - eyeRadius, ey);
        ctx.lineTo(ex + eyeRadius, ey);
        ctx.stroke();
      } else {
        // Open eye
        ctx.fillStyle = cs.eye;
        ctx.beginPath();
        ctx.arc(ex + this.state.eyeOffsetX, ey + this.state.eyeOffsetY, eyeRadius, 0, Math.PI * 2);
        ctx.fill();

        // Pupil
        ctx.fillStyle = "#0f172a";
        ctx.beginPath();
        ctx.arc(ex + this.state.eyeOffsetX, ey + this.state.eyeOffsetY, 2.5, 0, Math.PI * 2);
        ctx.fill();

        // Eye shine
        ctx.fillStyle = "rgba(255,255,255,0.8)";
        ctx.beginPath();
        ctx.arc(ex + this.state.eyeOffsetX + 1, ey + this.state.eyeOffsetY - 1, 1, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // ---- Eyebrows ----
    const browY = eyeY - 9;
    const browWidth = 12;
    const browHeight = this.state.mode === "speaking" ? -1 : (this.state.mode === "listening" ? 1.5 : 0);

    for (let side = -1; side <= 1; side += 2) {
      const bx = side * eyeSpacing;
      ctx.strokeStyle = cs.accentLight;
      ctx.lineWidth = 2.5;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(bx - browWidth/2, browY + browHeight);
      ctx.lineTo(bx + browWidth/2, browY - browHeight);
      ctx.stroke();
    }

    // ---- Mouth ----
    const mouthY = 14;
    const mouthOpen = this.state.smoothAmp * 10;

    if (this.state.mode === "speaking" && mouthOpen > 0.5) {
      // Open mouth - oval shape that scales with amplitude
      ctx.fillStyle = cs.mouthActive;
      ctx.beginPath();
      ctx.ellipse(0, mouthY, 8, 3 + mouthOpen, 0, 0, Math.PI * 2);
      ctx.fill();

      // Inner mouth (darker)
      ctx.fillStyle = cs.mouth;
      ctx.beginPath();
      ctx.ellipse(0, mouthY, 6, 2 + mouthOpen * 0.7, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (this.state.mode === "listening") {
      // Slight smile when listening
      ctx.strokeStyle = cs.accentLight;
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.arc(0, mouthY - 2, 7, 0.2 * Math.PI, 0.8 * Math.PI);
      ctx.stroke();
    } else {
      // Neutral mouth - slight line
      ctx.strokeStyle = cs.accentLight;
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(-6, mouthY);
      ctx.lineTo(6, mouthY);
      ctx.stroke();
    }

    // ---- Status indicator dot ----
    let dotColor, dotPulse;
    if (this.state.mode === "speaking") {
      dotColor = cs.accent;
      dotPulse = 0.6 + Math.sin(Date.now() * 0.01) * 0.4;
    } else if (this.state.mode === "listening") {
      dotColor = "#22c55e";
      dotPulse = 0.5 + Math.sin(Date.now() * 0.006) * 0.5;
    } else {
      dotColor = "#64748b";
      dotPulse = 0.3;
    }

    ctx.fillStyle = dotColor;
    ctx.globalAlpha = dotPulse;
    ctx.beginPath();
    ctx.arc(34, -34, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.restore();
  }
};