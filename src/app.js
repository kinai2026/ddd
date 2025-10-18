/*
  AI 音樂生成器 (3 分鐘) - 純前端 WebAudio 版本
  - 支援多種曲風：EDM、Lo-Fi、Ambient、Classical、Hip-Hop
  - 以程式性作曲 (procedural composition) 模擬 AI 風格生成
  - 實時合成並使用 MediaRecorder 錄音，可下載成 webm/ogg 檔
*/

(function () {
  const $ = (sel) => document.querySelector(sel);
  const genreEl = $('#genre');
  const seedEl = $('#seed');
  const durationEl = $('#duration');
  const startBtn = $('#startBtn');
  const stopBtn = $('#stopBtn');
  const downloadBtn = $('#downloadBtn');
  const progressBar = $('#progressBar');
  const statusText = $('#statusText');
  const timeText = $('#timeText');

  let audioCtx = null;
  let master = null;
  let destinationNode = null; // for MediaRecorder
  let mediaRecorder = null;
  let recordedChunks = [];
  let startTime = 0;
  let durationSec = 180;
  let uiTimer = null;
  let running = false;
  let scheduledStops = [];

  // ====== 工具：PRNG (可重現) ======
  function xmur3(str) { // hash to seed
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return function () {
      h = Math.imul(h ^ (h >>> 16), 2246822507);
      h = Math.imul(h ^ (h >>> 13), 3266489909);
      h ^= h >>> 16;
      return h >>> 0;
    };
  }
  function mulberry32(a) {
    return function () {
      let t = (a += 0x6D2B79F5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function makeRng(seedStr) {
    if (!seedStr) seedStr = String(Date.now());
    const seed = xmur3(seedStr)();
    const rand = mulberry32(seed);
    rand.int = (min, max) => Math.floor(rand() * (max - min + 1)) + min;
    rand.pick = (arr) => arr[Math.floor(rand() * arr.length)];
    return rand;
  }

  // ====== 音樂輔助 ======
  const A4 = 440;
  function midiToFreq(m) { return A4 * Math.pow(2, (m - 69) / 12); }
  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
  function dbToGain(db) { return Math.pow(10, db / 20); }

  // 常用音階
  const SCALES = {
    major: [0, 2, 4, 5, 7, 9, 11],
    minor: [0, 2, 3, 5, 7, 8, 10],
    dorian: [0, 2, 3, 5, 7, 9, 10],
    pentatonic: [0, 2, 4, 7, 9],
    harmonicMinor: [0, 2, 3, 5, 7, 8, 11],
  };

  function chordDegrees(deg, scale) {
    // 以級數建立三和弦 / 七和弦
    const s = scale;
    const triad = [s[deg % s.length], s[(deg + 2) % s.length], s[(deg + 4) % s.length]];
    const seventh = s[(deg + 6) % s.length];
    return { triad, seventh };
  }

  // ====== 音源/合成器 ======
  function createMaster(ac) {
    const master = ac.createGain();
    master.gain.value = 0.9;

    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 24;
    comp.ratio.value = 3.5;
    comp.attack.value = 0.003;
    comp.release.value = 0.2;

    const outGain = ac.createGain();
    outGain.gain.value = 0.9;

    master.connect(comp);
    comp.connect(outGain);

    return { input: master, output: outGain };
  }

  function createReverbish(ac, time = 0.25, feedback = 0.2, cutoff = 8000) {
    // 輕量延遲 + 濾波，模擬空間感
    const delay = ac.createDelay(1.5);
    delay.delayTime.value = time;
    const fb = ac.createGain();
    fb.gain.value = feedback;
    const hp = ac.createBiquadFilter();
    hp.type = 'lowpass';
    hp.frequency.value = cutoff;

    delay.connect(fb);
    fb.connect(hp);
    hp.connect(delay);

    const input = ac.createGain();
    const output = ac.createGain();
    input.connect(delay);
    delay.connect(output);

    return { input, output };
  }

  function env(gainNode, t, a = 0.01, d = 0.1, s = 0.6, r = 0.2, peak = 1.0, sustainLevel = null) {
    const g = gainNode.gain;
    const now = t;
    const sustain = sustainLevel == null ? s : sustainLevel;
    g.cancelScheduledValues(now);
    g.setValueAtTime(0.0001, now);
    g.linearRampToValueAtTime(peak, now + a);
    g.linearRampToValueAtTime(peak * sustain, now + a + d);
    return (releaseAt) => {
      const rt = (releaseAt || acNow()) + 0.0001;
      g.cancelScheduledValues(rt);
      g.setValueAtTime(g.value, rt);
      g.linearRampToValueAtTime(0.0001, rt + r);
    };
  }

  function acNow() {
    return audioCtx ? audioCtx.currentTime : 0;
  }

  function playOsc(ac, { type = 'sine', freq = 440, time = 0, dur = 0.5, gain = 0.2, a = 0.01, d = 0.1, s = 0.6, r = 0.2, detune = 0, out = null }) {
    const o = ac.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, time);
    if (detune) o.detune.setValueAtTime(detune, time);

    const g = ac.createGain();
    g.gain.value = 0;

    const stopEnv = env(g, time, a, d, s, r, gain);

    if (out) {
      o.connect(g); g.connect(out);
    } else {
      o.connect(g); g.connect(master.input);
    }
    o.start(time);
    o.stop(time + dur + Math.max(a + d + r, 0.05));

    // 自動釋放
    stopEnv(time + dur);
    scheduledStops.push(() => { try { o.stop(); } catch(e){} });
  }

  function playNoise(ac, { time = 0, dur = 0.2, gain = 0.2, type = 'white', filter = null, a = 0.001, d = 0.08, s = 0.0, r = 0.08, out = null }) {
    const bufferSize = Math.max(1, Math.floor(ac.sampleRate * dur));
    const buffer = ac.createBuffer(1, bufferSize, ac.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      const v = Math.random() * 2 - 1; // white
      data[i] = v;
    }

    const src = ac.createBufferSource();
    src.buffer = buffer;

    const g = ac.createGain();
    g.gain.value = 0;
    const stopEnv = env(g, time, a, d, s, r, gain);

    let node = src;
    let last = node;
    if (filter) {
      const biq = ac.createBiquadFilter();
      biq.type = filter.type || 'highpass';
      if (filter.frequency) biq.frequency.value = filter.frequency;
      if (filter.Q) biq.Q.value = filter.Q;
      last.connect(biq);
      last = biq;
    }
    last.connect(g);
    if (out) g.connect(out); else g.connect(master.input);

    src.start(time);
    src.stop(time + dur + r + 0.05);

    stopEnv(time + dur);
    scheduledStops.push(() => { try { src.stop(); } catch(e){} });
  }

  // Drums
  function kick(ac, t, gain = 0.9) {
    // pitch drop sine
    const o = ac.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(44, t + 0.12);

    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);

    o.connect(g); g.connect(master.input);
    o.start(t);
    o.stop(t + 0.3);
    scheduledStops.push(() => { try { o.stop(); } catch(e){} });
  }
  function snare(ac, t, gain = 0.4) {
    // noise + tone
    playNoise(ac, { time: t, dur: 0.12, gain, filter: { type: 'bandpass', frequency: 1800, Q: 0.7 }, a: 0.001, d: 0.07, s: 0, r: 0.08 });
    playOsc(ac, { type: 'triangle', freq: 220, time: t, dur: 0.08, gain: gain * 0.3, a: 0.001, d: 0.03, s: 0, r: 0.05 });
  }
  function hat(ac, t, dur = 0.04, gain = 0.18) {
    playNoise(ac, { time: t, dur, gain, filter: { type: 'highpass', frequency: 6000, Q: 0.8 }, a: 0.001, d: dur * 0.6, s: 0, r: dur * 0.4 });
  }
  function clap(ac, t, gain = 0.22) {
    // simplified clap: quick multi-burst noise
    const bursts = [0, 0.011, 0.022, 0.048];
    bursts.forEach((b, i) => playNoise(ac, { time: t + b, dur: 0.035 + i*0.005, gain: gain * (1 - i*0.18), filter: { type: 'bandpass', frequency: 1500, Q: 0.9 }, a: 0.001, d: 0.02, s: 0, r: 0.04 }));
  }

  // Instruments
  function padSynth(ac, { freq, time, dur, gain = 0.2, cutoff = 1800 }) {
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(cutoff, time);

    const reverb = createReverbish(ac, 0.22, 0.35, 7000);
    reverb.output.connect(master.input);

    // Two detuned saws
    [[-7, 0.65], [7, 0.65], [0, 0.55]].forEach(([det, lev]) => {
      playOsc(ac, { type: 'sawtooth', freq, time, dur, gain: gain * lev, a: 0.8, d: 0.8, s: 0.8, r: 1.5, detune: det, out: lp });
    });

    lp.connect(reverb.input);
  }

  function bassSynth(ac, { freq, time, dur, gain = 0.22 }) {
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(500, time);
    lp.Q.value = 0.2;

    playOsc(ac, { type: 'square', freq, time, dur, gain, a: 0.003, d: 0.06, s: 0.4, r: 0.06, out: lp });
    lp.connect(master.input);
  }

  function leadSynth(ac, { freq, time, dur, gain = 0.16, type = 'sawtooth' }) {
    const hp = ac.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.setValueAtTime(200, time);

    const delay = createReverbish(ac, 0.18, 0.28, 6000);
    delay.output.connect(master.input);

    playOsc(ac, { type, freq, time, dur, gain, a: 0.01, d: 0.08, s: 0.4, r: 0.12, out: hp });
    hp.connect(delay.input);
  }

  function pianoSynth(ac, { freq, time, dur, gain = 0.18 }) {
    // simple additive piano-ish
    const partials = [1, 2, 3, 4.2, 5.4];
    const gains = [1, 0.4, 0.25, 0.16, 0.12];
    partials.forEach((p, i) => {
      playOsc(ac, { type: i % 2 ? 'triangle' : 'sine', freq: freq * p, time, dur, gain: gain * gains[i], a: 0.002, d: 0.08, s: 0.0, r: 0.18 });
    });
  }

  function sub808(ac, { freq, time, dur = 0.5, gain = 0.3 }) {
    const o = ac.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(freq * 1.8, time);
    o.frequency.exponentialRampToValueAtTime(freq, time + 0.06);

    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(gain, time + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);

    o.connect(g); g.connect(master.input);
    o.start(time);
    o.stop(time + dur + 0.05);
    scheduledStops.push(() => { try { o.stop(); } catch(e){} });
  }

  // ====== 曲風邏輯 ======
  const GENRES = {
    edm: {
      bpm: 128,
      scale: 'minor',
      root: 45, // A2
      describe: '四拍重擊、低音律動、銜接簡單 lead',
      schedule: (ac, start, dur, rng) => {
        const beat = 60 / GENRES.edm.bpm;
        const sixteenth = beat / 4;
        const bars = Math.ceil(dur / (beat * 4));
        for (let bar = 0; bar < bars; bar++) {
          const barTime = start + bar * beat * 4;
          if (barTime > start + dur) break;

          // drums: four-on-the-floor
          for (let b = 0; b < 4; b++) {
            const t = barTime + b * beat;
            kick(ac, t, 0.8);
            if (b === 1 || b === 3) snare(ac, t, 0.42);
            for (let i = 0; i < 8; i++) {
              const ht = barTime + i * (beat / 2);
              hat(ac, ht, 0.03 + (i % 2 ? 0.005 : 0), 0.16);
            }
          }

          // bassline: root + fifth rhythmic 16ths
          const scale = SCALES[GENRES.edm.scale];
          const root = GENRES.edm.root + (bar % 8 === 4 ? 5 : 0);
          const bassNotes = [0, 0, 7, 0, 0, 7, 0, 12];
          for (let s = 0; s < 16; s++) {
            const nt = barTime + s * sixteenth;
            if (s % 2 === 0) {
              const deg = bassNotes[s % bassNotes.length];
              const note = root + deg;
              bassSynth(ac, { freq: midiToFreq(note), time: nt, dur: sixteenth * 1.1, gain: 0.26 });
            }
          }

          // lead: simple motif every 2 bars
          if (bar % 2 === 0) {
            const motifSteps = [0, 2, 4, 7, 4, 2, 0];
            const motifStart = barTime + beat * rng.pick([0, 1]);
            const base = root + rng.pick([0, 12]);
            motifSteps.forEach((st, i) => {
              const deg = SCALES.minor[(st) % SCALES.minor.length];
              const note = base + deg;
              const t = motifStart + i * (sixteenth * 2);
              if (t < start + dur - 0.1) {
                leadSynth(ac, { freq: midiToFreq(note), time: t, dur: sixteenth * 1.8, gain: 0.13, type: 'sawtooth' });
              }
            });
          }

          // pad on every bar base chord
          const chordDeg = [0, 5, 3, 4][bar % 4]; // i, VI, iv, v (in minor-ish)
          const { triad } = chordDegrees(chordDeg, SCALES.minor);
          const base = GENRES.edm.root + (bar % 8 >= 4 ? 5 : 0);
          triad.forEach((st) => {
            const note = base + st;
            padSynth(ac, { freq: midiToFreq(note), time: barTime, dur: beat * 4.0, gain: 0.07, cutoff: 2400 });
          });
        }
      },
    },
    lofi: {
      bpm: 74,
      scale: 'pentatonic',
      root: 48, // C3
      describe: '慵懶鼓點、爵士和絃、輕柔旋律',
      schedule: (ac, start, dur, rng) => {
        const beat = 60 / GENRES.lofi.bpm;
        const sixteenth = beat / 4;
        const bars = Math.ceil(dur / (beat * 4));
        const swing = 0.58; // swing 8ths

        // subtle vinyl noise
        for (let i = 0; i < Math.ceil(dur / 4); i++) {
          playNoise(ac, { time: start + i * 4, dur: 3.9, gain: 0.02, filter: { type: 'lowpass', frequency: 6000, Q: 0.1 }, a: 0.01, d: 3.5, r: 0.25 });
        }

        for (let bar = 0; bar < bars; bar++) {
          const barTime = start + bar * beat * 4;
          if (barTime > start + dur) break;

          // drums: laid-back
          for (let b = 0; b < 4; b++) {
            const t = barTime + b * beat;
            if (b === 0 || b === 2) kick(ac, t + 0.01, 0.55);
            if (b === 1 || b === 3) snare(ac, t + 0.005, 0.32);
          }
          for (let i = 0; i < 4; i++) {
            // swung 8ths hats
            const t1 = barTime + i * (beat);
            const t2 = t1 + beat * (1 - swing);
            hat(ac, t1 + 0.004, 0.05, 0.12);
            hat(ac, t2 + 0.004, 0.03, 0.1);
          }

          // chords: seventh-ish sustained
          const base = GENRES.lofi.root + (bar % 8 >= 4 ? -5 : 0);
          const degSeq = [0, 3, 5, 4];
          const cd = degSeq[bar % degSeq.length];
          const { triad, seventh } = chordDegrees(cd, SCALES.dorian);
          const notes = [...triad, seventh].map(st => base + st);
          notes.forEach((n, i) => padSynth(ac, { freq: midiToFreq(n), time: barTime, dur: beat * 4.0, gain: 0.05 + i*0.006, cutoff: 1800 }));

          // melody sparse
          if (bar % 2 === 0) {
            const steps = [0, 2, 4, 7, 9];
            const cnt = rng.int(3, 6);
            let t = barTime + beat * rng.pick([0, 1, 2]);
            for (let i = 0; i < cnt; i++) {
              const step = rng.pick(steps);
              const note = base + SCALES.pentatonic[step % SCALES.pentatonic.length] + 12;
              leadSynth(ac, { freq: midiToFreq(note), time: t, dur: sixteenth * rng.int(4, 8), gain: 0.11, type: 'triangle' });
              t += sixteenth * rng.int(3, 6);
              if (t > barTime + beat * 3.5) break;
            }
          }
        }
      },
    },
    ambient: {
      bpm: 60,
      scale: 'pentatonic',
      root: 52, // E3
      describe: '長音墊樂、隨機氛圍點綴、無鼓或極少鼓',
      schedule: (ac, start, dur, rng) => {
        const beat = 60 / GENRES.ambient.bpm;
        const bars = Math.ceil(dur / (beat * 4));
        for (let bar = 0; bar < bars; bar++) {
          const barTime = start + bar * beat * 4;
          if (barTime > start + dur) break;
          const base = GENRES.ambient.root + (bar % 6 === 3 ? -5 : 0);

          // long pad chord
          const deg = [0, 4, 3, 5][bar % 4];
          const { triad } = chordDegrees(deg, SCALES.major);
          triad.forEach((st, i) => padSynth(ac, { freq: midiToFreq(base + st), time: barTime, dur: Math.min(beat * 8.0, (start + dur) - barTime), gain: 0.09 + i*0.01, cutoff: 2600 }));

          // airy blips
          const n = 3 + (bar % 2);
          for (let i = 0; i < n; i++) {
            const t = barTime + beat * rng();
            const step = rng.int(0, SCALES.pentatonic.length - 1);
            const note = base + SCALES.pentatonic[step] + 12 * rng.int(1,2);
            leadSynth(ac, { freq: midiToFreq(note), time: t, dur: 0.35 + rng()*0.35, gain: 0.08, type: 'sine' });
          }
        }
      },
    },
    classical: {
      bpm: 100,
      scale: 'major',
      root: 48, // C3
      describe: '大調進行、琶音與簡單主旋律',
      schedule: (ac, start, dur, rng) => {
        const beat = 60 / GENRES.classical.bpm;
        const sixteenth = beat / 4;
        const bars = Math.ceil(dur / (beat * 4));
        const prog = [0, 4, 5, 3]; // I V vi IV degrees (approx mapping on major scale)

        for (let bar = 0; bar < bars; bar++) {
          const barTime = start + bar * beat * 4;
          if (barTime > start + dur) break;
          const deg = prog[bar % prog.length];
          const base = GENRES.classical.root + (bar % 8 >= 4 ? 12 : 0);
          const { triad } = chordDegrees(deg, SCALES.major);

          // arpeggio quarter + eighths
          const arp = [...triad, triad[0] + 12];
          for (let s = 0; s < 8; s++) {
            const nt = barTime + s * (beat / 2);
            const n = arp[s % arp.length];
            pianoSynth(ac, { freq: midiToFreq(base + n), time: nt, dur: beat / 2, gain: 0.14 });
          }

          // simple melody on top every other bar
          if (bar % 2 === 0) {
            const melody = [0, 2, 4, 5, 7, 5, 4, 2].map(i => SCALES.major[i % SCALES.major.length] + 12);
            melody.forEach((st, i) => {
              const t = barTime + i * sixteenth * 2;
              if (t < start + dur - 0.1) leadSynth(ac, { freq: midiToFreq(base + st), time: t, dur: sixteenth * 2, gain: 0.1, type: 'triangle' });
            });
          }
        }
      },
    },
    hiphop: {
      bpm: 90,
      scale: 'minor',
      root: 43, // G2
      describe: '808 低音、簡單鼓點、稀疏旋律',
      schedule: (ac, start, dur, rng) => {
        const beat = 60 / GENRES.hiphop.bpm;
        const sixteenth = beat / 4;
        const bars = Math.ceil(dur / (beat * 4));

        for (let bar = 0; bar < bars; bar++) {
          const barTime = start + bar * beat * 4;
          if (barTime > start + dur) break;

          // drums
          for (let b = 0; b < 4; b++) {
            const t = barTime + b * beat;
            if (b === 0 || b === 2) kick(ac, t, 0.75);
            if (b === 1 || b === 3) snare(ac, t + 0.01, 0.4);
          }
          for (let i = 0; i < 8; i++) hat(ac, barTime + i * (beat/2) + (i%2?0.01:0), 0.035, 0.13);

          // 808 bass pattern
          const root = GENRES.hiphop.root + (bar % 8 >= 4 ? -5 : 0);
          const pattern = [0, 0, 7, 0, -2, 0, 12, 0];
          pattern.forEach((st, i) => {
            const t = barTime + i * (sixteenth * 2);
            sub808(ac, { freq: midiToFreq(root + st), time: t, dur: sixteenth * 2.2, gain: 0.3 });
          });

          // sparse keys
          if (bar % 2 === 0) {
            const base = root + 12;
            const keys = [0, 3, 5, 7].map(i => SCALES.minor[i % SCALES.minor.length]);
            keys.forEach((st, i) => padSynth(ac, { freq: midiToFreq(base + st), time: barTime + i * beat, dur: beat, gain: 0.06, cutoff: 1800 }));
          }
        }
      },
    },
  };

  // ====== 控制流程 ======
  async function startGeneration() {
    if (running) return;
    running = true;
    statusText.textContent = '初始化音訊引擎...';

    // init audio
    if (!audioCtx || audioCtx.state === 'closed') {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 44100 });
    }

    // master
    const m = createMaster(audioCtx);
    master = m;

    // connect to destination and recorder
    destinationNode = audioCtx.createMediaStreamDestination();
    master.output.connect(audioCtx.destination);
    master.output.connect(destinationNode);

    // recorder
    recordedChunks = [];
    const mimeOptions = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
    ];
    let mimeType = '';
    for (const m of mimeOptions) {
      if (MediaRecorder.isTypeSupported(m)) { mimeType = m; break; }
    }
    try {
      mediaRecorder = new MediaRecorder(destinationNode.stream, mimeType ? { mimeType } : undefined);
    } catch (e) {
      console.warn('MediaRecorder init failed, fallback recording disabled', e);
      mediaRecorder = null;
    }

    if (mediaRecorder) {
      mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) recordedChunks.push(e.data); };
      mediaRecorder.onstop = () => {
        const blob = new Blob(recordedChunks, { type: mimeType || 'audio/webm' });
        const url = URL.createObjectURL(blob);
        downloadBtn.href = url;
        downloadBtn.download = makeFileName();
        downloadBtn.disabled = false;
        statusText.textContent = '已完成，準備好下載';
      };
    }

    const genre = genreEl.value;
    durationSec = clamp(parseInt(durationEl.value || '180', 10) || 180, 30, 600);
    const rng = makeRng(seedEl.value.trim());

    // schedule song
    startTime = audioCtx.currentTime + 0.05;
    const endTime = startTime + durationSec;

    statusText.textContent = `生成中（${genreName(genre)}）...`;

    // 開始錄音
    if (mediaRecorder) try { mediaRecorder.start(); } catch(e){}

    // 安排內容
    const g = GENRES[genre] || GENRES.edm;
    try {
      g.schedule(audioCtx, startTime, durationSec, rng);
    } catch (e) {
      console.error('Schedule error', e);
    }

    // UI update loop
    stopBtn.disabled = false;
    startBtn.disabled = true;
    downloadBtn.disabled = true;
    downloadBtn.removeAttribute('href');
    downloadBtn.removeAttribute('download');

    uiTimer = setInterval(() => {
      const now = audioCtx.currentTime;
      const p = clamp((now - startTime) / durationSec, 0, 1);
      progressBar.style.width = `${(p * 100).toFixed(2)}%`;
      timeText.textContent = `${fmtTime(Math.max(0, now - startTime))} / ${fmtTime(durationSec)}`;
      if (now >= endTime) {
        stopGeneration(true);
      }
    }, 200);
  }

  function stopGeneration(fromAuto = false) {
    if (!running) return;

    // stop scheduled nodes
    scheduledStops.forEach((fn) => { try { fn(); } catch(e){} });
    scheduledStops = [];

    if (uiTimer) { clearInterval(uiTimer); uiTimer = null; }
    progressBar.style.width = '0%';

    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      try { mediaRecorder.stop(); } catch(e){}
    }

    // small fade-out
    if (master && master.input && audioCtx) {
      try {
        const g = master.input.gain;
        g.cancelScheduledValues(audioCtx.currentTime);
        g.setTargetAtTime(0.0001, audioCtx.currentTime, 0.03);
      } catch(e){}
    }

    stopBtn.disabled = true;
    startBtn.disabled = false;
    statusText.textContent = fromAuto ? '完成生成' : '已停止';
    running = false;
  }

  function fmtTime(sec) {
    const s = Math.floor(sec);
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${String(m).padStart(2,'0')}:${String(r).padStart(2,'0')}`;
  }

  function genreName(v) {
    switch (v) {
      case 'edm': return 'EDM / 電子舞曲';
      case 'lofi': return 'Lo-Fi / 輕鬆節奏';
      case 'ambient': return 'Ambient / 氣氛';
      case 'classical': return 'Classical / 古典';
      case 'hiphop': return 'Hip-Hop / 節奏藍調';
      default: return v;
    }
  }

  function makeFileName() {
    const g = genreEl.value;
    const dt = new Date();
    const ds = `${dt.getFullYear()}${String(dt.getMonth()+1).padStart(2,'0')}${String(dt.getDate()).padStart(2,'0')}_${String(dt.getHours()).padStart(2,'0')}${String(dt.getMinutes()).padStart(2,'0')}`;
    const seed = (seedEl.value || '').trim() || 'seed';
    return `ai-music_${g}_${seed}_${ds}.webm`;
  }

  // ====== 綁定事件 ======
  startBtn.addEventListener('click', startGeneration);
  stopBtn.addEventListener('click', () => stopGeneration(false));

  // 依曲風更新按鈕文字
  function syncStartLabel() {
    const secs = clamp(parseInt(durationEl.value||'180',10)||180, 30, 600);
    const mins = (secs/60).toFixed(1).replace('.0','');
    startBtn.textContent = `開始生成 (${mins} 分鐘)`;
    timeText.textContent = `00:00 / ${fmtTime(secs)}`;
  }
  durationEl.addEventListener('change', syncStartLabel);
  syncStartLabel();
})();
