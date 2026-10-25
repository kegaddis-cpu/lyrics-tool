/* key-finder.js — UI for the Key Finder page. Requires key-detect-core.js (window.KeyCore). */
(function () {
  "use strict";
  const K = window.KeyCore;
  const $ = (id) => document.getElementById(id);

  const state = {
    root: 9,          // A
    mode: "major",
    scale: "major",
    label: "name",    // fretboard labels: name | degree
    detected: null,
  };

  // ---------- Controls setup ----------
  function fillRootSelect() {
    const sel = $("rootSelect");
    sel.innerHTML = "";
    for (let pc = 0; pc < 12; pc++) {
      const opt = document.createElement("option");
      opt.value = pc;
      opt.textContent = K.rootName(pc, state.mode);
      sel.appendChild(opt);
    }
    sel.value = state.root;
  }

  function fillScaleSelect() {
    const sel = $("scaleSelect");
    sel.innerHTML = "";
    Object.entries(K.SCALES).forEach(([id, sc]) => {
      const opt = document.createElement("option");
      opt.value = id;
      opt.textContent = sc.label;
      sel.appendChild(opt);
    });
    sel.value = state.scale;
  }

  function setKey(root, mode, opts) {
    state.root = root;
    state.mode = mode;
    // Keep a pentatonic/blues/mode choice if the user picked one; otherwise follow the mode.
    if (!opts || !opts.keepScale || state.scale === "major" || state.scale === "minor") {
      state.scale = mode;
    }
    fillRootSelect();
    $("scaleSelect").value = state.scale;
    document.querySelectorAll("[data-mode]").forEach((b) => b.classList.toggle("is-active", b.dataset.mode === mode));
    renderTheory();
  }

  // When the user picks a key by hand, stop live detection from overriding it.
  function pauseFollow() {
    const t = $("followToggle");
    if (t && t.checked && mic.running) {
      t.checked = false;
      setMicStatus("Auto-update paused because you picked a key. Tick the box to resume.");
    }
  }

  $("rootSelect").addEventListener("change", (e) => { pauseFollow(); setKey(Number(e.target.value), state.mode, { keepScale: true }); });
  $("scaleSelect").addEventListener("change", (e) => { state.scale = e.target.value; renderTheory(); });
  document.querySelectorAll("[data-mode]").forEach((btn) =>
    btn.addEventListener("click", () => { pauseFollow(); setKey(state.root, btn.dataset.mode, { keepScale: true }); })
  );
  document.querySelectorAll("[data-label]").forEach((btn) =>
    btn.addEventListener("click", () => {
      state.label = btn.dataset.label;
      document.querySelectorAll("[data-label]").forEach((b) => b.classList.toggle("is-active", b === btn));
      renderFretboard();
    })
  );
  $("relativeBtn").addEventListener("click", () => {
    pauseFollow();
    const r = K.relativeOf(state.root, state.mode);
    setKey(r.root, r.mode);
  });

  // ---------- Theory rendering ----------
  function renderTheory() {
    const notes = K.scaleNotes(state.root, state.scale);
    $("scaleNotes").innerHTML = notes
      .map((n, i) => `<div class="kf-note-chip${i === 0 ? " is-root" : ""}"><strong>${n.name}</strong><span>${n.degree}</span></div>`)
      .join("");

    const keyName = K.keyLabel(state.root, state.mode);
    $("chordKeyName").textContent = keyName;
    $("chords").innerHTML = K.keyChords(state.root, state.mode)
      .map((c) => `<div class="kf-chord"><span class="kf-numeral">${c.numeral}</span><strong>${c.triad}</strong><span class="kf-seventh">${c.seventh}</span></div>`)
      .join("");

    $("progressions").innerHTML = K.progressions(state.root, state.mode)
      .map((p) => `<li><span class="kf-prog-name">${p.name}</span><strong>${p.chords}</strong><span class="kf-numeral">${p.numerals}</span></li>`)
      .join("");

    const rel = K.relativeOf(state.root, state.mode);
    $("relativeBtn").textContent = "Switch to " + K.keyLabel(rel.root, rel.mode);
    renderFretboard();
  }

  function renderFretboard() {
    const FRETS = 15;
    const board = K.fretboard(state.root, state.scale, FRETS);
    const left = 34, top = 26, fretW = 56, strGap = 30, openW = 40;
    const width = left + openW + FRETS * fretW + 16;
    const height = top + strGap * 5 + 40;
    const svg = $("fretboard");
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.setAttribute("width", width);
    svg.setAttribute("height", height);

    const x0 = left + openW; // nut position
    const fretX = (f) => x0 + f * fretW;
    const noteX = (f) => (f === 0 ? left + openW / 2 : fretX(f) - fretW / 2);
    const strY = (s) => top + s * strGap;

    let out = "";
    // Inlays
    [3, 5, 7, 9, 15].forEach((f) => {
      out += `<circle cx="${fretX(f) - fretW / 2}" cy="${top + strGap * 2.5}" r="6" class="fb-inlay"/>`;
    });
    out += `<circle cx="${fretX(12) - fretW / 2}" cy="${top + strGap * 1.5}" r="6" class="fb-inlay"/>`;
    out += `<circle cx="${fretX(12) - fretW / 2}" cy="${top + strGap * 3.5}" r="6" class="fb-inlay"/>`;
    // Frets
    for (let f = 0; f <= FRETS; f++) {
      out += `<line x1="${fretX(f)}" y1="${strY(0)}" x2="${fretX(f)}" y2="${strY(5)}" class="${f === 0 ? "fb-nut" : "fb-fret"}"/>`;
      if (f > 0) out += `<text x="${fretX(f) - fretW / 2}" y="${strY(5) + 28}" class="fb-fretnum">${f}</text>`;
    }
    // Strings
    board.forEach((s, i) => {
      out += `<line x1="${left + 4}" y1="${strY(i)}" x2="${fretX(FRETS)}" y2="${strY(i)}" class="fb-string" style="stroke-width:${1 + i * 0.35}"/>`;
      out += `<text x="${left - 14}" y="${strY(i) + 4}" class="fb-strname">${s.string}</text>`;
    });
    // Notes
    board.forEach((s, i) => {
      s.frets.forEach((n, f) => {
        if (!n) return;
        const txt = state.label === "degree" ? n.degree : n.name;
        out += `<g class="fb-dot${n.isRoot ? " is-root" : ""}${f === 0 ? " is-open" : ""}">` +
          `<circle cx="${noteX(f)}" cy="${strY(i)}" r="12"/>` +
          `<text x="${noteX(f)}" y="${strY(i) + 4}">${txt}</text></g>`;
      });
    });
    svg.innerHTML = out;
  }

  // ---------- Audio loading + detection ----------
  function setStatus(msg, isError) {
    $("status").textContent = msg;
    $("status").classList.toggle("is-error", !!isError);
  }
  function setProgress(frac) {
    $("progressWrap").hidden = frac === null;
    if (frac !== null) $("progressBar").style.width = Math.round(frac * 100) + "%";
  }

  function decode(arrayBuffer) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    return new Promise((resolve, reject) => {
      // Callback form works on older iOS Safari too
      const p = ctx.decodeAudioData(arrayBuffer, resolve, reject);
      if (p && p.then) p.then(resolve, reject);
    }).finally(() => { if (ctx.close) ctx.close(); });
  }

  // Mix to mono and downsample to ~22 kHz (plenty for pitch analysis, and 2-4x faster).
  function toMono(audioBuffer) {
    const sr = audioBuffer.sampleRate;
    const factor = Math.max(1, Math.floor(sr / 20000));
    const chans = [];
    for (let c = 0; c < audioBuffer.numberOfChannels; c++) chans.push(audioBuffer.getChannelData(c));
    const len = Math.floor(audioBuffer.length / factor);
    const out = new Float32Array(len);
    const norm = 1 / (chans.length * factor);
    for (let i = 0; i < len; i++) {
      let s = 0;
      const base = i * factor;
      for (let k = 0; k < factor; k++) for (let c = 0; c < chans.length; c++) s += chans[c][base + k];
      out[i] = s * norm;
    }
    return { samples: out, sampleRate: sr / factor };
  }

  async function handleFile(file) {
    if (!file) return;
    if (mic.running) stopMic("Stopped listening to analyze the file.");
    $("resultCard").hidden = true;
    setProgress(0);
    setStatus(`Reading "${file.name}"…`);

    const player = $("player");
    if (player.src) URL.revokeObjectURL(player.src);
    player.src = URL.createObjectURL(file);
    player.hidden = false;

    try {
      const buf = await file.arrayBuffer();
      setStatus("Decoding audio…");
      const audio = await decode(buf);
      const { samples, sampleRate } = toMono(audio);
      setStatus(`Analyzing ${formatTime(audio.duration)} of audio…`);
      const result = await K.analyze(samples, sampleRate, { onProgress: setProgress });
      setProgress(null);

      if (!result.best) {
        setStatus("Couldn't hear enough pitched sound to detect a key. Try a section with chords or melody.", true);
        return;
      }
      state.detected = result;
      showResult(result, "File: " + file.name);
      setKey(result.best.root, result.best.mode);
      setStatus(`Done: ${file.name}`);
    } catch (err) {
      console.error(err);
      setProgress(null);
      setStatus("This file couldn't be decoded by your browser. Try MP3 or WAV.", true);
    }
  }

  function formatTime(s) {
    const m = Math.floor(s / 60), sec = Math.floor(s % 60);
    return `${m}:${String(sec).padStart(2, "0")}`;
  }

  function showResult(r, source) {
    const { best } = r;
    $("resultCard").hidden = false;
    $("sourcePill").textContent = source || "";
    $("keyName").textContent = K.keyLabel(best.root, best.mode);
    const rel = K.relativeOf(best.root, best.mode);
    $("keyRelative").textContent = `Relative key: ${K.keyLabel(rel.root, rel.mode)} (same notes)`;

    const pct = Math.round(r.confidence * 100);
    const level = pct >= 60 ? "high" : pct >= 35 ? "medium" : "low";
    $("confText").textContent = `· ${level} (${pct}%)`;
    $("confFill").style.width = Math.max(4, pct) + "%";
    $("confFill").dataset.level = level;

    const c = r.tuningCents;
    $("tuningText").textContent = Math.abs(c) <= 5
      ? "Tuning: standard (A = 440 Hz)"
      : `Tuning: ${Math.abs(c)} cents ${c > 0 ? "sharp" : "flat"} of A = 440 Hz`;

    const note = $("closeCallNote");
    if (r.closeCall) {
      note.hidden = false;
      note.textContent = `Close call: ${K.keyLabel(r.closeCall.root, r.closeCall.mode)} scored almost the same. ` +
        "Listen for which chord feels like home, then pick it below.";
    } else {
      note.hidden = true;
    }

    // Candidates
    const top = r.ranking.slice(0, 5);
    const maxS = top[0].score;
    $("candidates").innerHTML = top
      .map((k, i) => {
        const w = Math.max(6, Math.round((Math.max(0, k.score) / maxS) * 100));
        return `<button type="button" class="kf-cand${i === 0 ? " is-best" : ""}" data-root="${k.root}" data-mode="${k.mode}">` +
          `<span class="kf-cand-name">${K.keyLabel(k.root, k.mode)}</span>` +
          `<span class="kf-cand-bar"><span style="width:${w}%"></span></span>` +
          `<span class="kf-cand-score">${k.score.toFixed(2)}</span></button>`;
      })
      .join("");
    $("candidates").querySelectorAll(".kf-cand").forEach((b) =>
      b.addEventListener("click", () => { pauseFollow(); setKey(Number(b.dataset.root), b.dataset.mode); })
    );

    // Chroma bars (ordered from detected root)
    const maxC = Math.max(...r.chroma);
    const keyNotes = K.scaleNotes(best.root, best.mode);
    const inKey = new Set(keyNotes.map((n) => n.pc));
    const nameOf = (pc) => (keyNotes.find((n) => n.pc === pc) || {}).name || K.rootName(pc, best.mode);
    let bars = "";
    for (let i = 0; i < 12; i++) {
      const pc = (best.root + i) % 12;
      const h = Math.round((r.chroma[pc] / maxC) * 100);
      bars += `<div class="kf-chroma-col${inKey.has(pc) ? " in-key" : ""}"><div class="kf-chroma-bar" style="height:${h}%"></div><span>${nameOf(pc)}</span></div>`;
    }
    $("chromaBars").innerHTML = bars;

    // Timeline (only meaningful for longer audio)
    const segs = r.segments || [];
    if (r.duration >= 40 && segs.length >= 3) {
      $("timelineWrap").hidden = false;
      const family = (k) => {
        // Group a key with its relative so A major / F# minor count as "same key"
        return k.mode === "major" ? k.root : (k.root + 3) % 12;
      };
      const bestFam = family(best);
      $("timeline").innerHTML = segs
        .map((s) => {
          const same = family(s) === bestFam;
          const parallel = s.root === best.root && s.mode !== best.mode;
          const cls = same ? "same" : parallel ? "parallel" : "other";
          const w = ((s.end - s.start) / r.duration) * 100;
          return `<div class="kf-seg ${cls}" style="flex-basis:${w}%" title="${formatTime(s.start)}–${formatTime(s.end)}: ${K.keyLabel(s.root, s.mode)}"><span>${K.rootName(s.root, s.mode)}${s.mode === "minor" ? "m" : ""}</span></div>`;
        })
        .join("");
      const others = segs.filter((s) => family(s) !== bestFam && !(s.root === best.root));
      $("timelineNote").textContent = others.length / segs.length > 0.25
        ? "Some sections lean toward a different key. There may be a key change or borrowed chords."
        : "The key stays steady through the song.";
    } else {
      $("timelineWrap").hidden = true;
    }
  }

  $("audioFile").addEventListener("change", (e) => handleFile(e.target.files[0]));

  const drop = $("dropZone");
  ["dragenter", "dragover"].forEach((ev) =>
    drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("is-drag"); })
  );
  ["dragleave", "drop"].forEach((ev) =>
    drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("is-drag"); })
  );
  drop.addEventListener("drop", (e) => {
    const f = e.dataTransfer && e.dataTransfer.files[0];
    if (f) handleFile(f);
  });

  // ---------- Live microphone (default mode) ----------
  const mic = { running: false, ctx: null, stream: null, src: null, proc: null, mute: null,
    live: null, timer: null, raf: 0, level: 0, wakeLock: null, startedAt: 0,
    candidate: null, candidateCount: 0, shownKey: null };

  function setMicStatus(msg, isError) {
    $("micStatus").textContent = msg;
    $("micStatus").classList.toggle("is-error", !!isError);
  }

  function setLiveKey(text, idle) {
    $("liveKey").textContent = text;
    $("liveKey").classList.toggle("is-idle", !!idle);
  }

  function micSupported() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  }

  async function startMic() {
    if (!micSupported()) {
      setMicStatus("This browser can't use the microphone here. Open the page over https in Safari, Chrome, or Edge, or use the file option below.", true);
      return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    // Create + resume the context inside the tap (required on iPhone/iPad)
    const ctx = new Ctx();
    if (ctx.resume) ctx.resume();
    setMicStatus("Waiting for microphone permission...");
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
    } catch (err) {
      if (ctx.close) ctx.close();
      const denied = err && (err.name === "NotAllowedError" || err.name === "SecurityError");
      setMicStatus(denied
        ? "Microphone access was blocked. Allow it in your browser's site settings, then try again."
        : "Couldn't start the microphone (" + (err && err.name || "error") + ").", true);
      return;
    }

    const sr = ctx.sampleRate;
    const factor = Math.max(1, Math.floor(sr / 20000));
    const live = K.createLiveAnalyzer(sr / factor, { windowSeconds: Number($("windowSelect").value) });
    const src = ctx.createMediaStreamSource(stream);
    const proc = ctx.createScriptProcessor(4096, 1, 1);
    const mute = ctx.createGain();
    mute.gain.value = 0;               // keeps the node running without echoing to speakers
    src.connect(proc); proc.connect(mute); mute.connect(ctx.destination);

    proc.onaudioprocess = (e) => {
      const x = e.inputBuffer.getChannelData(0);
      const n = Math.floor(x.length / factor);
      const out = new Float32Array(n);
      let sq = 0;
      for (let i = 0; i < n; i++) {
        let v = 0;
        for (let k = 0; k < factor; k++) v += x[i * factor + k];
        v /= factor;
        out[i] = v; sq += v * v;
      }
      mic.level = Math.sqrt(sq / Math.max(1, n));
      live.push(out);
    };

    Object.assign(mic, { running: true, ctx, stream, src, proc, mute, live, startedAt: Date.now(),
      candidate: null, candidateCount: 0, shownKey: null });
    $("micBtn").classList.add("is-on");
    $("micBtn").setAttribute("aria-pressed", "true");
    $("micBtnText").textContent = "Stop";
    $("liveBadge").hidden = false;
    setLiveKey("Listening...", true);
    setMicStatus("Listening. Play or sing for a few seconds.");

    try {
      if (navigator.wakeLock) {
        mic.wakeLock = await navigator.wakeLock.request("screen");
        mic.wakeLock.addEventListener("release", () => { mic.wakeLock = null; });
      }
    } catch (_) {}

    mic.timer = setInterval(updateLive, 500);
    const draw = () => {
      // Map RMS to a 0-100% meter (log scale)
      const db = 20 * Math.log10(mic.level + 1e-6);
      const pct = Math.max(0, Math.min(100, ((db + 60) / 50) * 100));
      $("levelFill").style.width = pct + "%";
      mic.raf = requestAnimationFrame(draw);
    };
    draw();
  }

  function stopMic(message) {
    if (!mic.running) return;
    clearInterval(mic.timer);
    cancelAnimationFrame(mic.raf);
    try { mic.proc.onaudioprocess = null; mic.src.disconnect(); mic.proc.disconnect(); mic.mute.disconnect(); } catch (_) {}
    mic.stream.getTracks().forEach((t) => t.stop());
    if (mic.ctx.close) mic.ctx.close();
    if (mic.wakeLock) { mic.wakeLock.release().catch(() => {}); mic.wakeLock = null; }
    mic.running = false;
    $("micBtn").classList.remove("is-on");
    $("micBtn").setAttribute("aria-pressed", "false");
    $("micBtnText").textContent = "Start listening";
    $("liveBadge").hidden = true;
    $("levelFill").style.width = "0%";
    const r = mic.live && mic.live.result();
    setMicStatus(message || (r && r.best
      ? "Stopped. Last key heard: " + K.keyLabel(r.best.root, r.best.mode) + "."
      : "Stopped."));
  }

  function updateLive() {
    const r = mic.live.result();
    const elapsed = (Date.now() - mic.startedAt) / 1000;
    if (!r.best) {
      if (elapsed > 6 && r.heardSeconds < 1) {
        setMicStatus("Not hearing much yet. Move closer or turn the music up.");
      } else {
        setMicStatus("Listening... heard " + r.heardSeconds.toFixed(0) + " s of music so far.");
      }
      return;
    }
    const label = K.keyLabel(r.best.root, r.best.mode);
    setLiveKey(label, false);
    setMicStatus("Heard " + Math.round(r.heardSeconds) + " s of music" + (r.confidence < 0.35 ? ". Still settling..." : ".") +
      ($("followToggle").checked ? "" : " Auto-update is paused."));
    showResult(r, "Live mic");

    // Only move the scales/chords once the key has held steady for ~1.5 s
    const id = r.best.root + r.best.mode;
    if (id === mic.candidate) mic.candidateCount++;
    else { mic.candidate = id; mic.candidateCount = 1; }
    if ($("followToggle").checked && mic.candidateCount >= 3 && id !== mic.shownKey) {
      mic.shownKey = id;
      setKey(r.best.root, r.best.mode, { keepScale: true });
    }
  }

  $("micBtn").addEventListener("click", () => (mic.running ? stopMic() : startMic()));
  $("windowSelect").addEventListener("change", (e) => { if (mic.live) mic.live.setWindow(Number(e.target.value)); });
  $("followToggle").addEventListener("change", (e) => {
    if (e.target.checked) { mic.shownKey = null; if (mic.running) setMicStatus("Auto-update is back on."); }
  });
  $("resetBtn").addEventListener("click", () => {
    if (mic.live) mic.live.reset();
    mic.candidate = null; mic.candidateCount = 0; mic.shownKey = null;
    setLiveKey(mic.running ? "Listening..." : "Play or sing near your device", true);
    $("resultCard").hidden = true;
    if (mic.running) setMicStatus("Starting over. Listening...");
  });
  document.addEventListener("visibilitychange", () => {
    // Re-acquire the screen wake lock when returning to the tab
    if (document.visibilityState === "visible" && mic.running && navigator.wakeLock && !mic.wakeLock) {
      navigator.wakeLock.request("screen").then((l) => { mic.wakeLock = l; }).catch(() => {});
    }
  });
  if (!micSupported()) {
    setMicStatus("Microphone isn't available in this browser. Use the file option below.", true);
    $("uploadCard").open = true;
  }

  // Initial render
  fillRootSelect();
  fillScaleSelect();
  renderTheory();
})();
