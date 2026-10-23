/*
 * key-detect-core.js
 * Pure-JavaScript musical key detection + scale/chord theory helpers.
 * Works in the browser (window.KeyCore) and in Node (module.exports).
 *
 * Detection method:
 *   1. Short-time FFT on mono audio.
 *   2. Estimate tuning offset (cents) from spectral peaks.
 *   3. Fold spectrum into a 12-bin chroma (pitch-class) profile.
 *   4. Correlate against major/minor key profiles for all 24 keys.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.KeyCore = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // ---------- FFT (iterative radix-2, in place) ----------
  function fft(re, im) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) {
        let t = re[i]; re[i] = re[j]; re[j] = t;
        t = im[i]; im[i] = im[j]; im[j] = t;
      }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const ang = (-2 * Math.PI) / len;
      const wr = Math.cos(ang), wi = Math.sin(ang);
      const half = len >> 1;
      for (let i = 0; i < n; i += len) {
        let cr = 1, ci = 0;
        for (let k = 0; k < half; k++) {
          const a = i + k, b = a + half;
          const xr = re[b] * cr - im[b] * ci;
          const xi = re[b] * ci + im[b] * cr;
          re[b] = re[a] - xr; im[b] = im[a] - xi;
          re[a] += xr; im[a] += xi;
          const nr = cr * wr - ci * wi;
          ci = cr * wi + ci * wr;
          cr = nr;
        }
      }
    }
  }

  // ---------- Key profiles ----------
  // Blend of Krumhansl-Kessler and Temperley profiles (more balanced than either alone).
  const KK_MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
  const KK_MINOR = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
  const T_MAJOR = [5.0, 2.0, 3.5, 2.0, 4.5, 4.0, 2.0, 4.5, 2.0, 3.5, 1.5, 4.0];
  const T_MINOR = [5.0, 2.0, 3.5, 4.5, 2.0, 4.0, 2.0, 4.5, 3.5, 2.0, 1.5, 4.0];
  const MAJOR_PROFILE = KK_MAJOR.map((v, i) => v / 6.35 + T_MAJOR[i] / 5.0);
  const MINOR_PROFILE = KK_MINOR.map((v, i) => v / 6.33 + T_MINOR[i] / 5.0);

  function pearson(a, b) {
    const n = a.length;
    let ma = 0, mb = 0;
    for (let i = 0; i < n; i++) { ma += a[i]; mb += b[i]; }
    ma /= n; mb /= n;
    let num = 0, da = 0, db = 0;
    for (let i = 0; i < n; i++) {
      const x = a[i] - ma, y = b[i] - mb;
      num += x * y; da += x * x; db += y * y;
    }
    const d = Math.sqrt(da * db);
    return d ? num / d : 0;
  }

  // Score all 24 keys against a chroma vector. Returns sorted list.
  function scoreKeys(chroma) {
    const out = [];
    for (let r = 0; r < 12; r++) {
      const maj = [], min = [];
      for (let i = 0; i < 12; i++) {
        maj.push(MAJOR_PROFILE[(i - r + 12) % 12]);
        min.push(MINOR_PROFILE[(i - r + 12) % 12]);
      }
      out.push({ root: r, mode: "major", score: pearson(maj, chroma) });
      out.push({ root: r, mode: "minor", score: pearson(min, chroma) });
    }
    out.sort((a, b) => b.score - a.score);
    return out;
  }

  // ---------- Analysis ----------
  const FMIN = 55;     // A1
  const FMAX = 2000;   // ~B6

  /**
   * analyze(samples, sampleRate, options)
   *   samples: Float32Array mono
   * Returns { chroma, ranking, best, tuningCents, confidence, segments, duration }
   * options.onProgress(fraction) optional; options.segmentSeconds (default 12)
   * Async-friendly: yields to the event loop every chunk so the UI stays responsive.
   */
  async function analyze(samples, sampleRate, options) {
    options = options || {};
    const onProgress = options.onProgress || function () {};
    const segmentSeconds = options.segmentSeconds || 12;

    const N = sampleRate >= 32000 ? 16384 : 8192;  // ~0.37s window, ~2.7Hz bins at 22.05k
    const hop = N >> 1;
    const binHz = sampleRate / N;
    const kMin = Math.max(1, Math.floor(FMIN / binHz));
    const kMax = Math.min(N / 2 - 1, Math.ceil(FMAX / binHz));

    // Hann window
    const win = new Float32Array(N);
    for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1));

    // Precompute each bin's fractional MIDI pitch
    const binMidi = new Float32Array(kMax + 1);
    for (let k = kMin; k <= kMax; k++) binMidi[k] = 69 + 12 * Math.log2((k * binHz) / 440);

    const totalFrames = Math.max(0, Math.floor((samples.length - N) / hop) + 1);
    const re = new Float64Array(N), im = new Float64Array(N);
    const frames = [];   // per-frame { mags (sparse peaks), energy, time }

    // Pass 1: spectra + spectral peaks (for tuning + chroma)
    let tuneX = 0, tuneY = 0;
    for (let f = 0; f < totalFrames; f++) {
      const off = f * hop;
      let energy = 0;
      for (let i = 0; i < N; i++) {
        const s = samples[off + i] * win[i];
        re[i] = s; im[i] = 0; energy += s * s;
      }
      fft(re, im);
      const mag = new Float32Array(kMax + 1);
      for (let k = kMin; k <= kMax; k++) mag[k] = Math.sqrt(re[k] * re[k] + im[k] * im[k]);

      // Local peaks above a per-frame threshold
      let maxMag = 0;
      for (let k = kMin; k <= kMax; k++) if (mag[k] > maxMag) maxMag = mag[k];
      const thresh = maxMag * 0.05;
      const peaks = [];
      for (let k = kMin + 1; k < kMax; k++) {
        const m = mag[k];
        if (m > thresh && m >= mag[k - 1] && m > mag[k + 1]) {
          // Parabolic interpolation for sub-bin accuracy
          const a = Math.log(mag[k - 1] + 1e-12), b = Math.log(m + 1e-12), c = Math.log(mag[k + 1] + 1e-12);
          const denom = a - 2 * b + c;
          const p = denom !== 0 ? 0.5 * (a - c) / denom : 0;
          const freq = (k + p) * binHz;
          const midi = 69 + 12 * Math.log2(freq / 440);
          peaks.push({ midi, m });
          // tuning: circular mean of cent deviation
          const dev = (midi - Math.round(midi)) * 2 * Math.PI;
          tuneX += m * Math.cos(dev); tuneY += m * Math.sin(dev);
        }
      }
      frames.push({ peaks, energy, time: off / sampleRate });

      if (f % 40 === 0) {
        onProgress((f / Math.max(1, totalFrames)) * 0.9);
        await new Promise((r) => setTimeout(r, 0));
      }
    }

    const tuningCents = Math.round((Math.atan2(tuneY, tuneX) / (2 * Math.PI)) * 100);
    const tuneShift = tuningCents / 100;

    // Silence gate: ignore frames far below the median energy
    const energies = frames.map((fr) => fr.energy).sort((a, b) => a - b);
    const medianE = energies.length ? energies[Math.floor(energies.length / 2)] : 0;
    const gate = medianE * 0.02;

    // Pass 2: chroma from peaks (tuning-corrected), log-compressed per frame
    const total = new Float64Array(12);
    const segLen = Math.max(1, Math.round(segmentSeconds / (hop / sampleRate)));
    const segChroma = [];
    let usedFrames = 0;

    frames.forEach((fr, idx) => {
      const segIdx = Math.floor(idx / segLen);
      if (!segChroma[segIdx]) segChroma[segIdx] = { chroma: new Float64Array(12), frames: 0, start: fr.time };
      if (fr.energy <= gate || !fr.peaks.length) return;
      const c = new Float64Array(12);
      for (const pk of fr.peaks) {
        const midi = pk.midi - tuneShift;
        const nearest = Math.round(midi);
        const dist = Math.abs(midi - nearest);
        if (dist > 0.4) continue;                 // skip in-between (noise) peaks
        const w = Math.log(1 + 100 * pk.m) * (1 - dist);
        // De-emphasize very low bass (often drones/boom) slightly
        const bassW = nearest < 40 ? 0.6 : 1;
        c[((nearest % 12) + 12) % 12] += w * bassW;
      }
      let s = 0;
      for (let i = 0; i < 12; i++) s += c[i];
      if (!s) return;
      for (let i = 0; i < 12; i++) {
        const v = c[i] / s;
        total[i] += v;
        segChroma[segIdx].chroma[i] += v;
      }
      segChroma[segIdx].frames++;
      usedFrames++;
    });

    onProgress(0.97);

    const duration = samples.length / sampleRate;
    if (!usedFrames) {
      return { chroma: Array.from(total), ranking: [], best: null, tuningCents, confidence: 0, segments: [], duration };
    }

    const chroma = Array.from(total).map((v) => v / usedFrames);
    const ranking = scoreKeys(chroma);
    const best = ranking[0];

    // Confidence: fit strength x margin over the best rival that is NOT the same root
    // (parallel major/minor) or the relative key. Those near-ties are reported via closeCall.
    const rel = relativeOf(best.root, best.mode);
    const rival = ranking.find((k) => k.root !== best.root && !(k.root === rel.root && k.mode === rel.mode));
    const margin = rival ? best.score - rival.score : best.score;
    const confidence = Math.max(0, Math.min(1, best.score)) * Math.max(0, Math.min(1, margin / 0.25));
    // How close the runner-up is (major/minor of same root, or relative key, are common near-ties)
    const runnerUp = ranking[1];
    const closeCall = runnerUp && best.score - runnerUp.score < 0.05 ? runnerUp : null;

    const segments = segChroma
      .filter((sg) => sg && sg.frames >= 3)
      .map((sg) => {
        const sc = Array.from(sg.chroma).map((v) => v / sg.frames);
        const r = scoreKeys(sc)[0];
        return { start: sg.start, end: Math.min(duration, sg.start + segmentSeconds), root: r.root, mode: r.mode, score: r.score };
      });

    onProgress(1);
    return { chroma, ranking, best, tuningCents, confidence, closeCall, segments, duration };
  }

  // ---------- Theory helpers ----------
  const LETTERS = ["C", "D", "E", "F", "G", "A", "B"];
  const LETTER_PC = [0, 2, 4, 5, 7, 9, 11];

  // Preferred spelling of each root, per mode (follows standard key signatures).
  const MAJOR_ROOT_NAMES = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
  const MINOR_ROOT_NAMES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "G#", "A", "Bb", "B"];

  function rootName(pc, mode) {
    return (mode === "minor" ? MINOR_ROOT_NAMES : MAJOR_ROOT_NAMES)[((pc % 12) + 12) % 12];
  }

  function spell(letterIdx, pc) {
    letterIdx = ((letterIdx % 7) + 7) % 7;
    let diff = (pc - LETTER_PC[letterIdx] + 12) % 12;
    if (diff > 6) diff -= 12;
    const acc = diff === 0 ? "" : diff > 0 ? "#".repeat(diff) : "b".repeat(-diff);
    return LETTERS[letterIdx] + acc;
  }

  // Each scale: list of [semitones from root, scale-degree letter offset]
  const SCALES = {
    major:          { label: "Major (Ionian)",   steps: [[0,0],[2,1],[4,2],[5,3],[7,4],[9,5],[11,6]], degrees: ["1","2","3","4","5","6","7"] },
    minor:          { label: "Natural minor (Aeolian)", steps: [[0,0],[2,1],[3,2],[5,3],[7,4],[8,5],[10,6]], degrees: ["1","2","b3","4","5","b6","b7"] },
    harmonicMinor:  { label: "Harmonic minor",   steps: [[0,0],[2,1],[3,2],[5,3],[7,4],[8,5],[11,6]], degrees: ["1","2","b3","4","5","b6","7"] },
    majorPent:      { label: "Major pentatonic", steps: [[0,0],[2,1],[4,2],[7,4],[9,5]], degrees: ["1","2","3","5","6"] },
    minorPent:      { label: "Minor pentatonic", steps: [[0,0],[3,2],[5,3],[7,4],[10,6]], degrees: ["1","b3","4","5","b7"] },
    blues:          { label: "Blues",            steps: [[0,0],[3,2],[5,3],[6,4],[7,4],[10,6]], degrees: ["1","b3","4","b5","5","b7"] },
    dorian:         { label: "Dorian",           steps: [[0,0],[2,1],[3,2],[5,3],[7,4],[9,5],[10,6]], degrees: ["1","2","b3","4","5","6","b7"] },
    mixolydian:     { label: "Mixolydian",       steps: [[0,0],[2,1],[4,2],[5,3],[7,4],[9,5],[10,6]], degrees: ["1","2","3","4","5","6","b7"] },
  };

  // Root letter for spelling: derived from the preferred root name for the key's mode family.
  function rootLetterIdx(name) {
    return LETTERS.indexOf(name[0]);
  }

  // A scale's "family" decides root spelling (minor-type scales use minor key signature names).
  const MINOR_FAMILY = { minor: 1, harmonicMinor: 1, minorPent: 1, blues: 1, dorian: 1 };

  function scaleNotes(rootPc, scaleId, rootSpelling) {
    const sc = SCALES[scaleId];
    const name = rootSpelling || rootName(rootPc, MINOR_FAMILY[scaleId] ? "minor" : "major");
    const L = rootLetterIdx(name);
    return sc.steps.map(([semi, letterOff], i) => {
      const pc = (rootPc + semi) % 12;
      // Blues b5: spell as flattened 5th letter
      return { pc, name: spell(L + letterOff, pc), degree: sc.degrees[i] };
    });
  }

  const TRIADS = {
    major: { quals: ["", "m", "m", "", "", "m", "dim"], numerals: ["I", "ii", "iii", "IV", "V", "vi", "vii°"] },
    minor: { quals: ["m", "dim", "", "m", "m", "", ""], numerals: ["i", "ii°", "III", "iv", "v", "VI", "VII"] },
  };
  const SEVENTHS = {
    major: ["maj7", "m7", "m7", "maj7", "7", "m7", "m7b5"],
    minor: ["m7", "m7b5", "maj7", "m7", "m7", "maj7", "7"],
  };

  function keyChords(rootPc, mode) {
    const notes = scaleNotes(rootPc, mode);
    return notes.map((n, i) => ({
      numeral: TRIADS[mode].numerals[i],
      triad: n.name + TRIADS[mode].quals[i],
      seventh: n.name + SEVENTHS[mode][i],
    }));
  }

  const PROGRESSIONS = {
    major: [
      { name: "Pop anthem", degrees: [0, 4, 5, 3] },   // I V vi IV
      { name: "Classic rock", degrees: [0, 3, 4, 0] }, // I IV V I
      { name: "50s doo-wop", degrees: [0, 5, 3, 4] },  // I vi IV V
      { name: "Jazz turnaround", degrees: [1, 4, 0, 0] }, // ii V I
    ],
    minor: [
      { name: "Minor ballad", degrees: [0, 5, 2, 6] },  // i VI III VII
      { name: "Epic descent", degrees: [0, 6, 5, 6] },  // i VII VI VII
      { name: "Minor rock", degrees: [0, 3, 4, 0] },    // i iv v i
      { name: "Andalusian", degrees: [0, 6, 5, 4] },    // i VII VI v
    ],
  };

  function progressions(rootPc, mode) {
    const chords = keyChords(rootPc, mode);
    return PROGRESSIONS[mode].map((p) => ({
      name: p.name,
      numerals: p.degrees.map((d) => chords[d].numeral).join(" – "),
      chords: p.degrees.map((d) => chords[d].triad).join(" – "),
    }));
  }

  function relativeOf(rootPc, mode) {
    return mode === "major"
      ? { root: (rootPc + 9) % 12, mode: "minor" }
      : { root: (rootPc + 3) % 12, mode: "major" };
  }

  function keyLabel(rootPc, mode) {
    return rootName(rootPc, mode) + " " + mode;
  }

  // Guitar fretboard: standard tuning, low E (string 6) to high e (string 1)
  const TUNING = [
    { label: "e", pc: 4 }, { label: "B", pc: 11 }, { label: "G", pc: 7 },
    { label: "D", pc: 2 }, { label: "A", pc: 9 }, { label: "E", pc: 4 },
  ];

  function fretboard(rootPc, scaleId, frets) {
    frets = frets || 15;
    const notes = scaleNotes(rootPc, scaleId);
    const byPc = {};
    notes.forEach((n) => { if (!byPc[n.pc]) byPc[n.pc] = n; });
    return TUNING.map((s) => ({
      string: s.label,
      frets: Array.from({ length: frets + 1 }, (_, f) => {
        const pc = (s.pc + f) % 12;
        const n = byPc[pc];
        return n ? { fret: f, name: n.name, degree: n.degree, isRoot: pc === rootPc } : null;
      }),
    }));
  }

  return {
    analyze, scoreKeys, scaleNotes, keyChords, progressions, relativeOf,
    rootName, keyLabel, fretboard, SCALES,
    PITCH_NAMES: MAJOR_ROOT_NAMES,
  };
});
