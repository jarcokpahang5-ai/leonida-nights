// Sound, synthesized live with WebAudio — no audio files, no network. Engine hum,
// sirens, gunfire, explosions, a cash-register chime and a small bass-driven music
// loop for driving. Everything is silent until the first key press or click, which
// is what browsers require before an AudioContext may start.
export function createAudio() {
  let ctx = null;
  let master = null;
  let musicTimer = null;
  let musicStep = 0;
  let sirenNodes = null;
  let engineNodes = null;
  let muted = false;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      return true;
    } catch {
      return false;
    }
  }

  function tone(freq, dur, type, vol, slideTo) {
    if (!ensure() || muted) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    gain.gain.setValueAtTime(vol || 0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  function noise(dur, vol, lowpass) {
    if (!ensure() || muted) return;
    const t = ctx.currentTime;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.value = vol || 0.3;
    if (lowpass) {
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = lowpass;
      src.connect(filter);
      filter.connect(gain);
    } else {
      src.connect(gain);
    }
    gain.connect(master);
    src.start(t);
  }

  const BASS_LINE = [55, 0, 55, 65.4, 0, 55, 82.4, 73.4, 55, 0, 55, 65.4, 98, 82.4, 73.4, 65.4];
  const HAT_EVERY = 2; // a tick every other step

  function musicTick() {
    if (!ctx || muted) return;
    const note = BASS_LINE[musicStep % BASS_LINE.length];
    if (note) tone(note, 0.22, 'triangle', 0.16);
    if (musicStep % HAT_EVERY === 0) noise(0.03, 0.05, 6000);
    if (musicStep % 16 === 8) tone(220, 0.3, 'sine', 0.05, 330);
    musicStep += 1;
  }

  return {
    unlock() {
      if (ensure() && ctx.state === 'suspended') ctx.resume().catch(() => {});
    },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
    get muted() {
      return muted;
    },
    click() {
      tone(660, 0.07, 'square', 0.08);
    },
    shoot() {
      noise(0.09, 0.25, 2400);
      tone(180, 0.08, 'square', 0.12, 60);
    },
    enemyShoot() {
      noise(0.08, 0.12, 1800);
    },
    explosion() {
      noise(0.7, 0.5, 900);
      tone(90, 0.6, 'sine', 0.35, 30);
    },
    crash() {
      noise(0.15, 0.2, 1200);
    },
    pickup() {
      tone(880, 0.09, 'sine', 0.15);
      setTimeout(() => tone(1320, 0.12, 'sine', 0.15), 80);
    },
    cash() {
      tone(1046, 0.1, 'triangle', 0.18);
      setTimeout(() => tone(1568, 0.18, 'triangle', 0.18), 90);
    },
    missionDone() {
      [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, 0.22, 'triangle', 0.2), i * 110));
    },
    wasted() {
      [392, 330, 262, 196].forEach((f, i) => setTimeout(() => tone(f, 0.4, 'sawtooth', 0.12), i * 220));
    },
    horn() {
      tone(370, 0.25, 'square', 0.1);
      tone(466, 0.25, 'square', 0.08);
    },
    startMusic() {
      if (!ensure() || musicTimer) return;
      musicTimer = setInterval(musicTick, 190);
    },
    stopMusic() {
      if (musicTimer) {
        clearInterval(musicTimer);
        musicTimer = null;
      }
    },
    startSiren() {
      if (!ensure() || sirenNodes || muted) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 800;
      lfo.type = 'square';
      lfo.frequency.value = 0.7;
      lfoGain.gain.value = 220;
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);
      gain.gain.value = 0.045;
      osc.connect(gain);
      gain.connect(master);
      osc.start();
      lfo.start();
      sirenNodes = { osc, lfo, gain };
    },
    stopSiren() {
      if (!sirenNodes) return;
      try {
        sirenNodes.osc.stop();
        sirenNodes.lfo.stop();
      } catch { /* already stopped */ }
      sirenNodes = null;
    },
    engine(on, speed01) {
      if (!ensure()) return;
      if (!on) {
        if (engineNodes) {
          try { engineNodes.osc.stop(); } catch { /* already stopped */ }
          engineNodes = null;
        }
        return;
      }
      if (!engineNodes) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.value = 70;
        gain.gain.value = 0.03;
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 500;
        osc.connect(filter);
        filter.connect(gain);
        gain.connect(master);
        osc.start();
        engineNodes = { osc, gain };
      }
      engineNodes.osc.frequency.value = 60 + speed01 * 160;
      engineNodes.gain.gain.value = muted ? 0 : 0.02 + speed01 * 0.05;
    },
  };
}
