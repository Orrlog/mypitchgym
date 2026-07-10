// MyPitchGym - Stylized Avatar with Lip-Sync Animation
// Pure canvas, no external dependencies, no API calls.
// The avatar reacts to audio amplitude for realistic lip-sync.

const Avatar = {
  canvas: null,
  ctx: null,
  state: {
    mode: "idle",
    amplitude: 0,
    smoothAmp: 0,
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
    colorScheme: "default",
    bobOffset: 0,
    bobPhase: 0
  },

  colorSchemes: {
    default: {
      skin: "#c8956b",
      skinShadow: "#a67c52",
      skinHighlight: "#daa87a",
      hair: "#3a2814",
      hairHighlight: "#5c3e20",
      accent: "#6366f1",
      accentLight: "#818cf8",
      mouth: "#8b3a3a",
      mouthInner: "#6b2a2a",
      lipColor: "#b06060",
      eye: "#2d2d2d",
      eyeWhite: "#f0f0f0",
      eyeGlow: "rgba(99, 102, 241, 0.3)",
      nose: "#b8835a",
      cheek: "rgba(200, 120, 100, 0.25)",
      earShadow: "#9a7048"
    },
    reversal: {
      skin: "#d4a574",
      skinShadow: "#b08858",
      skinHighlight: "#e6bb8a",
      hair: "#2a1a08",
      hairHighlight: "#4a3018",
      accent: "#22c55e",
      accentLight: "#4ade80",
      mouth: "#8b3a3a",
      mouthInner: "#6b2a2a",
      lipColor: "#b06060",
      eye: "#1a3a1a",
      eyeWhite: "#f0f0f0",
      eyeGlow: "rgba(34, 197, 94, 0.3)",
      nose: "#c4956a",
      cheek: "rgba(200, 140, 100, 0.25)",
      earShadow: "#a07048"
    }
  },

  init(canvasId) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext("2d");
    this.canvas.width = 140;
    this.canvas.height = 140;
    this.startAnimation();
  },

  setMode(mode) { this.state.mode = mode; },
  setColorScheme(scheme) { this.state.colorScheme = scheme; },

  connectAudio(audioElement) {
    try {
      this.disconnectAudio();
      if (!audioElement) return;
      if (!this.state.audioCtx) {
        this.state.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (this.state.audioCtx.state === "suspended") this.state.audioCtx.resume();
      this.state.audioSource = this.state.audioCtx.createMediaElementSource(audioElement);
      this.state.audioAnalyser = this.state.audioCtx.createAnalyser();
      this.state.audioAnalyser.fftSize = 256;
      this.state.audioAnalyser.smoothingTimeConstant = 0.7;
      this.state.audioSource.connect(this.state.audioAnalyser);
      this.state.audioAnalyser.connect(this.state.audioCtx.destination);
      this.state.currentAudio = audioElement;
    } catch(e) {
      this.state.audioAnalyser = null;
    }
  },

  disconnectAudio() {
    try {
      if (this.state.audioSource) { this.state.audioSource.disconnect(); this.state.audioSource = null; }
      if (this.state.audioAnalyser) { this.state.audioAnalyser.disconnect(); this.state.audioAnalyser = null; }
    } catch(e) {}
    this.state.currentAudio = null;
  },

  getAmplitude() {
    if (!this.state.audioAnalyser) return 0;
    const data = new Uint8Array(this.state.audioAnalyser.frequencyBinCount);
    this.state.audioAnalyser.getByteFrequencyData(data);
    let sum = 0;
    const voiceBands = Math.min(data.length, 32);
    for (let i = 0; i < voiceBands; i++) sum += data[i];
    return Math.min(1, (sum / voiceBands / 255) * 1.8);
  },

  startAnimation() {
    const animate = () => { this.draw(); this.state.animFrame = requestAnimationFrame(animate); };
    animate();
  },

  stopAnimation() {
    if (this.state.animFrame) { cancelAnimationFrame(this.state.animFrame); this.state.animFrame = null; }
    this.disconnectAudio();
  },

  draw() {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const cs = this.colorSchemes[this.state.colorScheme] || this.colorSchemes.default;

    ctx.clearRect(0, 0, w, h);

    if (this.state.mode === "speaking") {
      this.state.amplitude = this.getAmplitude();
    } else {
      this.state.amplitude = 0;
    }
    this.state.smoothAmp += (this.state.amplitude - this.state.smoothAmp) * 0.3;

    if (this.state.mode === "speaking") {
      this.state.bobPhase += 0.08;
      this.state.bobOffset = Math.sin(this.state.bobPhase) * 1.5 * this.state.smoothAmp;
    } else {
      this.state.bobPhase = 0;
      this.state.bobOffset *= 0.9;
    }

    this.state.blinkTimer++;
    if (!this.state.isBlinking && this.state.blinkTimer > 120 + Math.random() * 180) {
      this.state.isBlinking = true;
      this.state.blinkProgress = 0;
      this.state.blinkTimer = 0;
    }
    if (this.state.isBlinking) {
      this.state.blinkProgress += 0.15;
      if (this.state.blinkProgress >= 1) this.state.isBlinking = false;
    }

    this.state.targetTilt = Math.sin(Date.now() * 0.0008) * 0.025;
    if (this.state.mode === "listening") this.state.targetTilt += 0.04;
    this.state.headTilt += (this.state.targetTilt - this.state.headTilt) * 0.05;

    const trackT = Date.now() * 0.0005;
    this.state.eyeOffsetX = Math.sin(trackT) * 1.2;
    this.state.eyeOffsetY = Math.cos(trackT * 1.3) * 0.8;

    const cx = w / 2;
    const cy = h / 2 + 2 + this.state.bobOffset;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(this.state.headTilt);

    // ===== GLOW RING =====
    if (this.state.mode === "speaking" || this.state.mode === "listening") {
      const glowRadius = 58 + this.state.smoothAmp * 5;
      const glowGrad = ctx.createRadialGradient(0, 0, 42, 0, 0, glowRadius);
      glowGrad.addColorStop(0, cs.eyeGlow);
      glowGrad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = glowGrad;
      ctx.beginPath();
      ctx.arc(0, 0, glowRadius, 0, Math.PI * 2);
      ctx.fill();
    }

    // ===== NECK =====
    ctx.fillStyle = cs.skinShadow;
    ctx.beginPath();
    ctx.moveTo(-12, 38);
    ctx.lineTo(-10, 52);
    ctx.lineTo(10, 52);
    ctx.lineTo(12, 38);
    ctx.closePath();
    ctx.fill();

    // ===== EARS =====
    for (let side = -1; side <= 1; side += 2) {
      ctx.fillStyle = cs.skin;
      ctx.beginPath();
      ctx.ellipse(side * 38, 2, 7, 12, 0, 0, Math.PI * 2);
      ctx.fill();
      // Inner ear shadow
      ctx.fillStyle = cs.earShadow;
      ctx.beginPath();
      ctx.ellipse(side * 38, 3, 3.5, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      // Ear top
      ctx.fillStyle = cs.skinHighlight;
      ctx.beginPath();
      ctx.ellipse(side * 37, -4, 4, 5, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // ===== HEAD SHAPE (oval with jaw) =====
    const headGrad = ctx.createRadialGradient(-10, -12, 8, 0, 0, 46);
    headGrad.addColorStop(0, cs.skinHighlight);
    headGrad.addColorStop(0.6, cs.skin);
    headGrad.addColorStop(1, cs.skinShadow);
    ctx.fillStyle = headGrad;

    // Head: rounded top, slightly narrower jaw
    ctx.beginPath();
    ctx.moveTo(-36, -18);
    ctx.bezierCurveTo(-38, -38, -20, -46, 0, -46);
    ctx.bezierCurveTo(20, -46, 38, -38, 36, -18);
    ctx.bezierCurveTo(36, 10, 24, 36, 0, 38);
    ctx.bezierCurveTo(-24, 36, -36, 10, -36, -18);
    ctx.closePath();
    ctx.fill();

    // Subtle face outline
    ctx.strokeStyle = "rgba(0,0,0,0.12)";
    ctx.lineWidth = 1;
    ctx.stroke();

    // ===== HAIR =====
    ctx.fillStyle = cs.hair;
    ctx.beginPath();
    ctx.moveTo(-36, -18);
    ctx.bezierCurveTo(-40, -42, -22, -50, 0, -50);
    ctx.bezierCurveTo(22, -50, 40, -42, 36, -18);
    // Hair comes down on sides
    ctx.bezierCurveTo(36, -22, 34, -28, 32, -30);
    ctx.bezierCurveTo(28, -34, 18, -38, 0, -38);
    ctx.bezierCurveTo(-18, -38, -28, -34, -32, -30);
    ctx.bezierCurveTo(-34, -28, -36, -22, -36, -18);
    ctx.closePath();
    ctx.fill();

    // Hair highlights
    ctx.fillStyle = cs.hairHighlight;
    ctx.beginPath();
    ctx.ellipse(-12, -40, 8, 4, -0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(14, -41, 6, 3, 0.2, 0, Math.PI * 2);
    ctx.fill();

    // Hair line (forehead)
    ctx.fillStyle = cs.hair;
    ctx.beginPath();
    ctx.moveTo(-22, -32);
    ctx.bezierCurveTo(-18, -36, -8, -38, 0, -37);
    ctx.bezierCurveTo(8, -38, 18, -36, 22, -32);
    ctx.bezierCurveTo(20, -30, 10, -30, 0, -31);
    ctx.bezierCurveTo(-10, -30, -20, -30, -22, -32);
    ctx.closePath();
    ctx.fill();

    // ===== EYEBROWS =====
    const browY = -14;
    const browWidth = 14;
    const browAngle = this.state.mode === "speaking" ? -1.5 : (this.state.mode === "listening" ? 2 : 0);

    for (let side = -1; side <= 1; side += 2) {
      const bx = side * 15;
      ctx.strokeStyle = cs.hair;
      ctx.lineWidth = 3.5;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(bx - browWidth/2, browY + browAngle * side * -1);
      ctx.quadraticCurveTo(bx, browY - 2 + browAngle, bx + browWidth/2, browY + browAngle * side);
      ctx.stroke();
    }

    // ===== EYES =====
    const eyeY = -6;
    const eyeSpacing = 15;

    for (let side = -1; side <= 1; side += 2) {
      const ex = side * eyeSpacing;
      const ey = eyeY;

      if (this.state.isBlinking) {
        // Closed eye - curved line
        ctx.strokeStyle = cs.eye;
        ctx.lineWidth = 2;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(ex - 6, ey);
        ctx.quadraticCurveTo(ex, ey + 2, ex + 6, ey);
        ctx.stroke();
      } else {
        // Eye whites
        ctx.fillStyle = cs.eyeWhite;
        ctx.beginPath();
        ctx.ellipse(ex + this.state.eyeOffsetX, ey + this.state.eyeOffsetY, 6, 4.5, 0, 0, Math.PI * 2);
        ctx.fill();

        // Iris
        const irisX = ex + this.state.eyeOffsetX * 1.3;
        const irisY = ey + this.state.eyeOffsetY * 1.3;
        ctx.fillStyle = cs.eye;
        ctx.beginPath();
        ctx.arc(irisX, irisY, 3.5, 0, Math.PI * 2);
        ctx.fill();

        // Pupil
        ctx.fillStyle = "#000";
        ctx.beginPath();
        ctx.arc(irisX, irisY, 2, 0, Math.PI * 2);
        ctx.fill();

        // Eye shine
        ctx.fillStyle = "rgba(255,255,255,0.9)";
        ctx.beginPath();
        ctx.arc(irisX + 1, irisY - 1.5, 1.2, 0, Math.PI * 2);
        ctx.fill();

        // Upper eyelid shadow
        ctx.strokeStyle = "rgba(0,0,0,0.15)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(ex - 6, ey - 2);
        ctx.quadraticCurveTo(ex, ey - 5, ex + 6, ey - 2);
        ctx.stroke();
      }
    }

    // ===== NOSE =====
    const noseY = 4;
    ctx.strokeStyle = cs.nose;
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    // Bridge
    ctx.beginPath();
    ctx.moveTo(-1, noseY - 10);
    ctx.lineTo(-2, noseY + 2);
    ctx.stroke();
    // Nostril curve
    ctx.beginPath();
    ctx.moveTo(-2, noseY + 2);
    ctx.quadraticCurveTo(-4, noseY + 5, -2, noseY + 6);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-2, noseY + 2);
    ctx.quadraticCurveTo(0, noseY + 5, 2, noseY + 6);
    ctx.stroke();
    // Tip shadow
    ctx.fillStyle = "rgba(0,0,0,0.06)";
    ctx.beginPath();
    ctx.ellipse(0, noseY + 5, 4, 2, 0, 0, Math.PI * 2);
    ctx.fill();

    // ===== CHEEKS (subtle blush) =====
    if (this.state.mode !== "idle") {
      ctx.fillStyle = cs.cheek;
      ctx.beginPath();
      ctx.ellipse(-18, 8, 7, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(18, 8, 7, 5, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // ===== MOUTH =====
    const mouthY = 18;
    const mouthOpen = this.state.smoothAmp * 9;

    if (this.state.mode === "speaking" && mouthOpen > 0.5) {
      // Open mouth
      ctx.fillStyle = cs.mouthInner;
      ctx.beginPath();
      ctx.ellipse(0, mouthY, 10, 3 + mouthOpen, 0, 0, Math.PI * 2);
      ctx.fill();

      // Teeth (upper)
      ctx.fillStyle = "#f5f5f0";
      ctx.beginPath();
      ctx.ellipse(0, mouthY - 1, 8, 2.5, 0, 0, Math.PI);
      ctx.fill();

      // Lips
      ctx.strokeStyle = cs.lipColor;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(0, mouthY, 10, 3 + mouthOpen, 0, 0, Math.PI * 2);
      ctx.stroke();

      // Upper lip
      ctx.beginPath();
      ctx.moveTo(-10, mouthY - 2);
      ctx.quadraticCurveTo(-5, mouthY - 4, 0, mouthY - 2);
      ctx.quadraticCurveTo(5, mouthY - 4, 10, mouthY - 2);
      ctx.stroke();
    } else if (this.state.mode === "listening") {
      // Slight smile
      ctx.strokeStyle = cs.lipColor;
      ctx.lineWidth = 2.5;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(-8, mouthY);
      ctx.quadraticCurveTo(0, mouthY + 4, 8, mouthY);
      ctx.stroke();
    } else {
      // Neutral
      ctx.strokeStyle = cs.lipColor;
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(-7, mouthY);
      ctx.quadraticCurveTo(0, mouthY + 1, 7, mouthY);
      ctx.stroke();
    }

    // ===== CHIN SHADOW =====
    ctx.fillStyle = "rgba(0,0,0,0.05)";
    ctx.beginPath();
    ctx.ellipse(0, 30, 12, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    // ===== STATUS DOT =====
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
    ctx.arc(40, -38, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.restore();
  }
};