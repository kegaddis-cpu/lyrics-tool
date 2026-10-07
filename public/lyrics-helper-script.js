console.log("Lyrics Helper recovered script loaded");
(() => {
let currentSongId = null;
let lastSelectionStart = 0;
let lastSelectionEnd = 0;
let undoSnapshot = null;
let undoTimer = null;
let statusClearTimer = null;

// Autosave state
const AUTOSAVE_DELAY_MS = 1000;
let autosaveTimer = null;
let isSaving = false;
let saveQueued = false;
let hasUnsavedChanges = false;
let titlePromptShown = false;
let lastSavedTitle = "";

const DEFAULT_PANEL_WIDTH = 360;
const MIN_PANEL_WIDTH = 280;
const MAX_PANEL_WIDTH = 560;
const RAIL_WIDTH = parseInt(getComputedStyle(document.getElementById("workspaceLayout")).getPropertyValue("--rail-width"), 10) || 72;

const workspaceLayout = document.getElementById("workspaceLayout");
const panelResizeHandle = document.getElementById("panelResizeHandle");
const collapsePanelBtn = document.getElementById("collapsePanelBtn");
const activePanelLabel = document.getElementById("activePanelLabel");

const lyricsInput = document.getElementById("lyricsInput");
const songTitle = document.getElementById("songTitle");
const isPublic = document.getElementById("isPublic");
const openLibraryBtn = document.getElementById("openLibraryBtn");
const analyzeBtn = document.getElementById("analyzeBtn");
const saveSongBtn = document.getElementById("saveSongBtn");
const newSongBtn = document.getElementById("newSongBtn");
const rhymingBtn = document.getElementById("rhymingBtn");
const randomBtn = document.getElementById("randomBtn");
const analysisResults = document.getElementById("analysisResults");
const songsList = document.getElementById("songsList");
const saveStatus = document.getElementById("saveStatus");
const toolResults = document.getElementById("toolResults");
const toolResultsTitle = document.getElementById("toolResultsTitle");
const toolResultsBody = document.getElementById("toolResultsBody");
const closeToolResultsBtn = document.getElementById("closeToolResultsBtn");
const toolEmptyState = document.getElementById("toolEmptyState");
const sideTabs = Array.from(document.querySelectorAll(".side-tab"));
const sidePanels = {
  library: document.getElementById("panel-library"),
  analysis: document.getElementById("panel-analysis"),
  tools: document.getElementById("panel-tools")
};

const editorMainGrid = document.getElementById("editorMainGrid");
const sectionsToggle = document.getElementById("sectionsToggle");
const sectionsList = document.getElementById("sectionsList");
const sectionsEmptyState = document.getElementById("sectionsEmptyState");
const addSectionSelect = document.getElementById("addSectionSelect");

function escapeHtml(str) {
  return String(str).replace(/[&<>\"']/g, function (match) {
    const map = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    };
    return map[match];
  });
}

function rememberSelection() {
  lastSelectionStart = lyricsInput.selectionStart || 0;
  lastSelectionEnd = lyricsInput.selectionEnd || 0;
}

["select", "click", "keyup", "mouseup", "focus", "input"].forEach((eventName) => {
  lyricsInput.addEventListener(eventName, rememberSelection);
});

function clearStatusMessage() {
  saveStatus.textContent = "";
  saveStatus.classList.remove("error", "success");
}

// Keep the status banner at the top of what you can see,
// even when the phone keyboard is open and the page has shifted.
document.body.appendChild(saveStatus);

function positionStatusBanner() {
  const vv = window.visualViewport;
  saveStatus.style.top = vv ? `${Math.round(vv.offsetTop) + 12}px` : "";
}

if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", positionStatusBanner);
  window.visualViewport.addEventListener("scroll", positionStatusBanner);
}

function setStatus(message, isError = false, autoClearMs = 0) {
  positionStatusBanner();
  if (statusClearTimer) {
    clearTimeout(statusClearTimer);
    statusClearTimer = null;
  }

  saveStatus.textContent = message || "";
  saveStatus.classList.toggle("error", !!message && isError);
  saveStatus.classList.toggle("success", !!message && !isError);

  if (message && autoClearMs > 0) {
    statusClearTimer = setTimeout(() => {
      clearStatusMessage();
    }, autoClearMs);
  }
}

function markDirty() {
  hasUnsavedChanges = true;
  if (autosaveTimer) clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => {
    autosaveTimer = null;
    saveSong({ auto: true });
  }, AUTOSAVE_DELAY_MS);
}

async function flushAutosave() {
  if (autosaveTimer) {
    clearTimeout(autosaveTimer);
    autosaveTimer = null;
  }
  while (isSaving) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (hasUnsavedChanges && songTitle.value.trim()) {
    await saveSong({ auto: true });
  }
  if (hasUnsavedChanges) {
    return window.confirm("This song has changes that aren't saved (it may need a title). Discard them?");
  }
  return true;
}

function cancelAutosave() {
  if (autosaveTimer) {
    clearTimeout(autosaveTimer);
    autosaveTimer = null;
  }
  hasUnsavedChanges = false;
  titlePromptShown = false;
}

function redirectIfLoggedOut(response) {
  if (response.status === 401) {
    window.location.href = "/login";
    return true;
  }
  return false;
}

function clampPanelWidth(width) {
  return Math.max(MIN_PANEL_WIDTH, Math.min(MAX_PANEL_WIDTH, width));
}

function openPanel(panelName, moveFocus = false) {
  workspaceLayout.classList.remove("is-collapsed");

  const currentWidth = parseInt(workspaceLayout.style.getPropertyValue("--panel-width"), 10);
  if (!currentWidth) {
    workspaceLayout.style.setProperty("--panel-width", `${DEFAULT_PANEL_WIDTH}px`);
  }

  sideTabs.forEach((tab) => {
    const isActive = tab.dataset.panel === panelName;
    tab.classList.toggle("is-active", isActive);
    tab.setAttribute("aria-selected", String(isActive));
    tab.tabIndex = isActive ? 0 : -1;
    if (isActive && moveFocus) tab.focus();
  });

  Object.entries(sidePanels).forEach(([name, panel]) => {
    const isActive = name === panelName;
    panel.classList.toggle("is-active", isActive);
    panel.hidden = !isActive;
  });

  activePanelLabel.textContent = `${panelName.charAt(0).toUpperCase()}${panelName.slice(1)} panel`;
}

function collapsePanel() {
  workspaceLayout.classList.add("is-collapsed");
  workspaceLayout.style.setProperty("--panel-width", "0px");

  sideTabs.forEach((tab, index) => {
    tab.classList.remove("is-active");
    tab.setAttribute("aria-selected", "false");
    tab.tabIndex = index === 0 ? 0 : -1;
  });

  Object.values(sidePanels).forEach((panel) => {
    panel.classList.remove("is-active");
    panel.hidden = true;
  });

  activePanelLabel.textContent = "Workspace panel";
}

function togglePanel(panelName) {
  const tab = sideTabs.find((item) => item.dataset.panel === panelName);
  const alreadyOpen =
    !workspaceLayout.classList.contains("is-collapsed") &&
    tab &&
    tab.classList.contains("is-active");

  if (alreadyOpen) {
    collapsePanel();
    return;
  }

  openPanel(panelName, true);
}

function toggleSectionsPanel() {
  const collapsed = editorMainGrid.classList.toggle("sections-collapsed");
  sectionsToggle.setAttribute("aria-expanded", String(!collapsed));
}

function showToolResults(title, html) {
  toolResultsTitle.textContent = title;
  toolResultsBody.innerHTML = html;
  toolResults.hidden = false;
  toolEmptyState.hidden = true;
  openPanel("tools");
}

function hideToolResults() {
  toolResults.hidden = true;
  toolResultsTitle.textContent = "Writing tools";
  toolResultsBody.innerHTML = "";
  toolEmptyState.hidden = false;
}

// ===== Sections =====
// The lyrics editor is the only place text lives. A section is a label line
// like [Verse 1] in the editor. The Sections area shows those labels so they
// can be dragged into a new order.

const SECTION_HEADER_RE = /^\s*\[(verse|chorus|pre-chorus|pre chorus|bridge|hook|intro|outro)(?:\s+\d+)?\]\s*$/i;

function normalizeSectionType(raw) {
  if (/^pre[- ]chorus$/i.test(raw)) return "Pre-Chorus";
  return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
}

// Split the editor text into: text before the first label, then one block per label.
function splitIntoBlocks(text) {
  const lines = String(text || "").split(/\r?\n/);
  const preamble = [];
  const blocks = [];
  let current = null;

  for (const line of lines) {
    const match = line.match(SECTION_HEADER_RE);
    if (match) {
      current = { type: normalizeSectionType(match[1]), lines: [line] };
      blocks.push(current);
    } else if (current) {
      current.lines.push(line);
    } else {
      preamble.push(line);
    }
  }

  return { preamble, blocks };
}

function trimBlankLines(lines) {
  const copy = lines.slice();
  while (copy.length && !copy[0].trim()) copy.shift();
  while (copy.length && !copy[copy.length - 1].trim()) copy.pop();
  return copy;
}

function joinBlocks(preamble, blocks) {
  const parts = [];
  const pre = trimBlankLines(preamble).join("\n");
  if (pre) parts.push(pre);
  blocks.forEach((block) => parts.push(trimBlankLines(block.lines).join("\n")));
  return parts.join("\n\n");
}

// Number labels in order: [Verse 1], [Chorus 1], [Verse 2]...
function renumberSectionLabels(text) {
  const counts = {};
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => {
      const match = line.match(SECTION_HEADER_RE);
      if (!match) return line;
      const type = normalizeSectionType(match[1]);
      counts[type] = (counts[type] || 0) + 1;
      return `[${type} ${counts[type]}]`;
    })
    .join("\n");
}

function lineStartOffset(text, lineIndex) {
  const lines = text.split("\n");
  let offset = 0;
  for (let i = 0; i < lineIndex && i < lines.length; i += 1) {
    offset += lines[i].length + 1;
  }
  return offset;
}

function setEditorText(text, cursor) {
  lyricsInput.value = text;
  if (typeof cursor === "number") {
    const pos = Math.max(0, Math.min(text.length, cursor));
    lyricsInput.setSelectionRange(pos, pos);
    lastSelectionStart = pos;
    lastSelectionEnd = pos;
  }
  renderSections();
  markDirty();
}

// ----- Undo (one step) -----
function takeUndoSnapshot() {
  undoSnapshot = {
    value: lyricsInput.value,
    start: lyricsInput.selectionStart || 0,
    end: lyricsInput.selectionEnd || 0
  };
}

const undoToast = document.createElement("div");
undoToast.className = "undo-toast";
undoToast.hidden = true;
undoToast.innerHTML = '<span class="undo-toast-text"></span><button type="button" class="undo-toast-btn">Undo</button>';
document.body.appendChild(undoToast);

function positionUndoToast() {
  const vv = window.visualViewport;
  undoToast.style.top = vv ? `${Math.round(vv.offsetTop) + 64}px` : "";
}

if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", positionUndoToast);
  window.visualViewport.addEventListener("scroll", positionUndoToast);
}

function showUndo(message) {
  undoToast.querySelector(".undo-toast-text").textContent = message;
  positionUndoToast();
  undoToast.hidden = false;
  if (undoTimer) clearTimeout(undoTimer);
  undoTimer = setTimeout(hideUndo, 6000);
}

function hideUndo() {
  undoToast.hidden = true;
  if (undoTimer) {
    clearTimeout(undoTimer);
    undoTimer = null;
  }
}

function undoLastSectionChange() {
  if (!undoSnapshot) return;
  const snap = undoSnapshot;
  undoSnapshot = null;
  hideUndo();
  lyricsInput.value = snap.value;
  lyricsInput.setSelectionRange(snap.start, snap.end);
  lastSelectionStart = snap.start;
  lastSelectionEnd = snap.end;
  renderSections();
  markDirty();
  setStatus("Undone.", false, 2000);
}

undoToast.querySelector(".undo-toast-btn").addEventListener("click", undoLastSectionChange);

// ----- Add a section label at the cursor -----
function insertSectionAtCursor(type) {
  takeUndoSnapshot();

  const value = lyricsInput.value;
  let pos = Math.max(0, Math.min(value.length, lastSelectionStart || 0));
  if (document.activeElement === lyricsInput) pos = lyricsInput.selectionStart || 0;

  // If the cursor is in the middle of a line, put the label after that line
  // so a lyric line never gets split in two.
  let insertAt = pos;
  const atLineStart = pos === 0 || value[pos - 1] === "\n";
  if (!atLineStart) {
    const lineEnd = value.indexOf("\n", pos);
    insertAt = lineEnd === -1 ? value.length : lineEnd;
  }

  let before = value.slice(0, insertAt);
  const after = value.slice(insertAt).replace(/^\n/, "");

  if (before && !before.endsWith("\n")) before += "\n";
  if (before.trim() && !before.endsWith("\n\n")) before += "\n";

  const labelLineIndex = before.split("\n").length - 1;
  const text = renumberSectionLabels(`${before}[${type}]\n${after}`);
  const cursor = lineStartOffset(text, labelLineIndex + 1);

  lyricsInput.focus();
  setEditorText(text, cursor);

  const label = text.split("\n")[labelLineIndex].replace(/[\[\]]/g, "");
  showUndo(`${label} added`);
}

if (addSectionSelect) {
  // Remember the cursor before the dropdown takes focus.
  addSectionSelect.addEventListener("pointerdown", rememberSelection);
  addSectionSelect.addEventListener("change", () => {
    const type = addSectionSelect.value;
    addSectionSelect.value = "";
    if (type) insertSectionAtCursor(type);
  });
}

// ----- Reorder sections -----
function reorderSections(newOrder) {
  const { preamble, blocks } = splitIntoBlocks(lyricsInput.value);
  if (newOrder.length !== blocks.length) return;
  if (newOrder.every((oldIndex, i) => oldIndex === i)) {
    renderSections();
    return;
  }

  takeUndoSnapshot();
  const reordered = newOrder.map((oldIndex) => blocks[oldIndex]);
  setEditorText(renumberSectionLabels(joinBlocks(preamble, reordered)));
  showUndo("Sections reordered");
}

// Tap a label to jump to that section in the editor.
function jumpToSection(blockIndex) {
  const lines = lyricsInput.value.split("\n");
  let count = -1;
  for (let i = 0; i < lines.length; i += 1) {
    if (SECTION_HEADER_RE.test(lines[i])) {
      count += 1;
      if (count === blockIndex) {
        const pos = lineStartOffset(lyricsInput.value, Math.min(i + 1, lines.length - 1));
        lyricsInput.focus();
        lyricsInput.setSelectionRange(pos, pos);
        rememberSelection();
        const lineHeight = parseFloat(getComputedStyle(lyricsInput).lineHeight) || 20;
        lyricsInput.scrollTop = Math.max(0, i * lineHeight - lineHeight);
        return;
      }
    }
  }
}

// ----- Draw the label chips -----
function renderSections() {
  const { blocks } = splitIntoBlocks(lyricsInput.value);
  sectionsEmptyState.hidden = blocks.length > 0;
  sectionsList.innerHTML = "";

  blocks.forEach((block, index) => {
    const chip = document.createElement("div");
    chip.className = "section-chip";
    chip.dataset.index = String(index);
    chip.innerHTML = `
      <span class="section-chip-handle" aria-hidden="true">&#8942;&#8942;</span>
      <button type="button" class="section-chip-label" title="Go to this section">${escapeHtml(block.lines[0].trim().replace(/[\[\]]/g, ""))}</button>
    `;
    chip.querySelector(".section-chip-label").addEventListener("click", () => jumpToSection(index));
    attachChipDrag(chip);
    sectionsList.appendChild(chip);
  });
}

// Drag works with mouse, finger, or pen. Grab the dotted handle.
// Moves are tracked on the whole window because the chip moves around
// in the list while you drag it.
let chipDrag = null;

function attachChipDrag(chip) {
  const handle = chip.querySelector(".section-chip-handle");

  handle.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    chipDrag = { chip, pointerId: event.pointerId };
    chip.classList.add("is-dragging");
    sectionsList.classList.add("is-sorting");
  });
}

window.addEventListener("pointermove", (event) => {
  if (!chipDrag || chipDrag.pointerId !== event.pointerId) return;
  event.preventDefault();
  const chip = chipDrag.chip;
  const target = document.elementFromPoint(event.clientX, event.clientY);
  const overChip = target && target.closest(".section-chip");
  if (!overChip || overChip === chip || overChip.parentElement !== sectionsList) return;

  const rect = overChip.getBoundingClientRect();
  const sameRow = Math.abs(rect.top - chip.getBoundingClientRect().top) < rect.height / 2;
  const placeAfter = sameRow
    ? event.clientX > rect.left + rect.width / 2
    : event.clientY > rect.top + rect.height / 2;

  sectionsList.insertBefore(chip, placeAfter ? overChip.nextSibling : overChip);
}, { passive: false });

function finishChipDrag(event) {
  if (!chipDrag || chipDrag.pointerId !== event.pointerId) return;
  chipDrag.chip.classList.remove("is-dragging");
  chipDrag = null;
  sectionsList.classList.remove("is-sorting");
  const newOrder = Array.from(sectionsList.querySelectorAll(".section-chip")).map((item) => Number(item.dataset.index));
  reorderSections(newOrder);
}

window.addEventListener("pointerup", finishChipDrag);
window.addEventListener("pointercancel", finishChipDrag);

lyricsInput.addEventListener("input", renderSections);

lyricsInput.addEventListener("input", markDirty);

songTitle.addEventListener("input", () => {
  if (songTitle.value.trim()) titlePromptShown = false;
  markDirty();
});

function getSelectionOrLastWord() {
  const selected = lyricsInput.value
    .slice(lastSelectionStart, lastSelectionEnd)
    .trim()
    .toLowerCase();

  if (selected && /^[a-zA-Z']+$/.test(selected)) {
    return selected;
  }

  const text = lyricsInput.value.trim();
  if (!text) return "";

  const words = text.match(/[A-Za-z']+/g);
  return words && words.length ? words[words.length - 1].toLowerCase() : "";
}

function insertWordIntoEditor(word) {
  const value = lyricsInput.value;
  const start = typeof lastSelectionStart === "number" ? lastSelectionStart : value.length;
  const end = typeof lastSelectionEnd === "number" ? lastSelectionEnd : value.length;

  const insertionPrefix = start > 0 && !/\s/.test(value[start - 1]) ? " " : "";
  const insertionSuffix = start === end && end < value.length && !/\s/.test(value[end]) ? " " : "";

  lyricsInput.value =
    value.slice(0, start) +
    insertionPrefix +
    word +
    insertionSuffix +
    value.slice(end);

  const cursor = start + insertionPrefix.length + word.length + insertionSuffix.length;
  lyricsInput.focus();
  lyricsInput.setSelectionRange(cursor, cursor);
  rememberSelection();
  markDirty();
  renderSections();
}

function getFallbackRhymes(word) {
  const fallbackMap = {
    here: ["fear", "dear", "near", "beer", "clear", "year"],
    night: ["light", "bright", "sight", "flight", "white", "might"],
    fire: ["desire", "higher", "wire", "choir", "liar", "spire"],
    pain: ["rain", "train", "chain", "vein", "gain", "again"]
  };

  return fallbackMap[word] || [];
}

function getFallbackRandomItems() {
  return ["midnight", "echo", "shadow", "ember", "velvet"];
}

function renderRhymeResults(sourceWord, suggestions) {
  if (!suggestions.length) {
    showToolResults(
      "Rhyming ideas",
      `<p class="empty-copy">No rhyme ideas came back for "${escapeHtml(sourceWord)}".</p>`
    );
    return;
  }

  showToolResults(
    `Rhymes for "${sourceWord}"`,
    `
      <div class="tool-chip-list">
        ${suggestions.map((word) => `
          <button
            type="button"
            class="chip-btn"
            data-insert-word="${escapeHtml(word)}"
            title="Click to insert"
          >${escapeHtml(word)}</button>
        `).join("")}
      </div>
      <p class="empty-copy">Click a word to insert it into the editor.</p>
    `
  );
}

function renderRandomResults(items) {
  const safeItems = items.length ? items : getFallbackRandomItems();

  showToolResults(
    "Random writing ideas",
    `
      <div class="analysis-card">
        <h3>Try one</h3>
        <div class="tool-chip-list">
          ${safeItems.map((item) => `
            <button
              type="button"
              class="chip-btn"
              data-insert-word="${escapeHtml(item)}"
              title="Click to insert"
            >${escapeHtml(item)}</button>
          `).join("")}
        </div>
      </div>
      <p class="empty-copy">Click a word to insert it into the editor.</p>
    `
  );
}

sideTabs.forEach((tab, index) => {
  tab.addEventListener("click", () => {
    togglePanel(tab.dataset.panel);
  });

  tab.addEventListener("keydown", (event) => {
    let nextIndex = index;

    if (event.key === "ArrowDown" || event.key === "ArrowRight") {
      nextIndex = (index + 1) % sideTabs.length;
    } else if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
      nextIndex = (index - 1 + sideTabs.length) % sideTabs.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = sideTabs.length - 1;
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      togglePanel(tab.dataset.panel);
      return;
    } else {
      return;
    }

    event.preventDefault();
    sideTabs[nextIndex].focus();
  });
});

collapsePanelBtn.addEventListener("click", collapsePanel);
closeToolResultsBtn.addEventListener("click", hideToolResults);
openLibraryBtn.addEventListener("click", () => openPanel("library", true));

if (sectionsToggle && editorMainGrid) {
  sectionsToggle.addEventListener("click", toggleSectionsPanel);
}

let isResizing = false;

panelResizeHandle.addEventListener("mousedown", (event) => {
  if (workspaceLayout.classList.contains("is-collapsed")) return;

  isResizing = true;
  document.body.classList.add("is-resizing");
  event.preventDefault();
});

window.addEventListener("mousemove", (event) => {
  if (!isResizing) return;

  const layoutRect = workspaceLayout.getBoundingClientRect();
  const nextWidth = clampPanelWidth(layoutRect.right - event.clientX - RAIL_WIDTH);
  workspaceLayout.style.setProperty("--panel-width", `${nextWidth}px`);
});

window.addEventListener("mouseup", () => {
  if (!isResizing) return;
  isResizing = false;
  document.body.classList.remove("is-resizing");
});

async function loadSongs() {
  songsList.innerHTML = '<p class="empty-copy">Loading songs...</p>';

  try {
    const response = await fetch("/api/songs");
    if (redirectIfLoggedOut(response)) return;
    const data = await response.json();

    if (!response.ok) {
      songsList.innerHTML = `<p class="empty-copy">${escapeHtml(data.details || data.error || "Failed to load songs.")}</p>`;
      return;
    }

    if (!data.songs || !data.songs.length) {
      songsList.innerHTML = '<p class="empty-copy">No songs saved yet.</p>';
      return;
    }

    songsList.innerHTML = data.songs.map((song) => `
      <article class="song-card">
        <div class="song-card-head">
          <div>
            <h3>${escapeHtml(song.title)}</h3>
            <p>${song.is_public ? "Public" : "Private"}</p>
          </div>
        </div>

        <p class="song-preview">${escapeHtml((song.lyrics || "").slice(0, 100)) || "No lyrics saved yet."}</p>

        <div class="song-card-actions">
          <button type="button" class="primary-btn small-btn" onclick="openSong(${song.id}, event)">Load</button>
          <button type="button" class="secondary-btn small-btn" onclick="deleteSong(${song.id}, event)">Delete</button>
        </div>
      </article>
    `).join("");
  } catch (error) {
    songsList.innerHTML = '<p class="empty-copy">Could not load songs.</p>';
  }
}

async function openSong(songId, event) {
  if (event) event.stopPropagation();

  if (!(await flushAutosave())) return;

  try {
    const response = await fetch(`/api/songs/${songId}`);
    if (redirectIfLoggedOut(response)) return;
    const data = await response.json();

    if (!response.ok) {
      setStatus(data.details || data.error || "Could not load song.", true, 3500);
      return;
    }

    currentSongId = data.song.id;
    songTitle.value = data.song.title || "";
    lyricsInput.value = data.song.lyrics || "";
    if (isPublic) isPublic.checked = !!data.song.is_public;

    renderSections();
    hideUndo();
    undoSnapshot = null;
    cancelAutosave();
    lastSavedTitle = data.song.title || "";

    setStatus(`Loaded "${data.song.title}".`, false, 2800);
    openPanel("library");
  } catch (error) {
    setStatus("Could not load song.", true, 3500);
  }
}

async function saveSong(options = {}) {
  const auto = options.auto === true;
  const title = songTitle.value.trim();

  if (!title) {
    // Save button / Ctrl+S: stop, move the cursor to the title box, and ask.
    // Autosave: just show a reminder once. Never move the cursor while typing.
    if (!auto) {
      setStatus("Please enter a song title to save.", true, 4000);
      songTitle.focus();
    } else if (!titlePromptShown) {
      titlePromptShown = true;
      setStatus("Add a title to turn on autosave.", true, 4000);
    }
    return;
  }

  if (isSaving) {
    saveQueued = true;
    return;
  }

  if (!auto) {
    if (autosaveTimer) {
      clearTimeout(autosaveTimer);
      autosaveTimer = null;
    }
    lyricsInput.value = lyricsInput.value.trim();
  }

  const lyrics = lyricsInput.value;
  const publicValue = isPublic ? isPublic.checked : false;
  const wasNewSong = !currentSongId;
  const titleChanged = title !== lastSavedTitle;

  isSaving = true;
  saveQueued = false;
  setStatus(auto ? "Saving..." : "Saving song...", false);

  try {
    const url = currentSongId ? `/api/songs/${currentSongId}` : "/api/songs";
    const method = currentSongId ? "PUT" : "POST";

    const response = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        lyrics,
        is_public: publicValue
      })
    });

    if (response.status === 401) {
      setStatus("You've been logged out, so this wasn't saved. Copy your lyrics somewhere safe, then refresh the page and log in.", true);
      return;
    }

    const data = await response.json();

    if (!response.ok) {
      setStatus(data.details || data.error || "Could not save song.", true, 5000);
      return;
    }

    if (data.songId) {
      currentSongId = data.songId;
    }

    lastSavedTitle = title;

    // Only mark as saved if nothing changed while the save was in progress.
    if (songTitle.value.trim() === title && lyricsInput.value === lyrics) {
      hasUnsavedChanges = false;
    }

    if (!auto || wasNewSong || titleChanged) {
      await loadSongs();
    }

    if (auto) {
      setStatus("\u2713 Saved", false, 2000);
    } else {
      setStatus(`\u2713 Song saved successfully: "${title}"`, false, 4500);
    }
  } catch (error) {
    setStatus(auto ? "Autosave failed. Check your connection." : "Could not save song.", true, 5000);
  } finally {
    isSaving = false;
    if (saveQueued) {
      saveQueued = false;
      if (hasUnsavedChanges) markDirty();
    }
  }
}

async function deleteSong(songId, event) {
  if (event) event.stopPropagation();

  const confirmed = window.confirm("Delete this song?");
  if (!confirmed) return;

  try {
    const response = await fetch(`/api/songs/${songId}`, {
      method: "DELETE"
    });

    if (redirectIfLoggedOut(response)) return;
    const data = await response.json();

    if (!response.ok) {
      setStatus(data.details || data.error || "Could not delete song.", true, 4000);
      return;
    }

    if (currentSongId === songId) {
      cancelAutosave();
      currentSongId = null;
      lastSavedTitle = "";
      songTitle.value = "";
      lyricsInput.value = "";
      if (isPublic) isPublic.checked = false;
      renderSections();
      hideUndo();
      undoSnapshot = null;
      analysisResults.innerHTML = '<p class="empty-copy">No analysis yet.</p>';
      hideToolResults();
    }

    setStatus("Song deleted.", false, 2800);
    await loadSongs();
  } catch (error) {
    setStatus("Could not delete song.", true, 4000);
  }
}

async function resetEditor() {
  if (!(await flushAutosave())) return;
  cancelAutosave();
  lastSavedTitle = "";
  currentSongId = null;
  songTitle.value = "";
  lyricsInput.value = "";
  if (isPublic) isPublic.checked = false;
  renderSections();
  hideUndo();
  undoSnapshot = null;
  analysisResults.innerHTML = '<p class="empty-copy">No analysis yet.</p>';
  hideToolResults();
  clearStatusMessage();
}

async function analyzeLyrics() {
  const lyrics = lyricsInput.value.trim();

  try {
    const response = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lyrics })
    });

    const data = await response.json();

    if (!response.ok) {
      analysisResults.innerHTML = '<p class="empty-copy">Could not analyze lyrics.</p>';
      return;
    }

    analysisResults.innerHTML = `
      <div class="stats-grid">
        <div class="stat-card">
          <span>Lines</span>
          <strong>${data.lineCount}</strong>
        </div>
        <div class="stat-card">
          <span>Words</span>
          <strong>${data.wordCount}</strong>
        </div>
        <div class="stat-card">
          <span>Avg / line</span>
          <strong>${data.averageWordsPerLine}</strong>
        </div>
        <div class="stat-card">
          <span>Sections</span>
          <strong>${data.sectionCount}</strong>
        </div>
      </div>

      <div class="analysis-card">
        <h3>Detected sections</h3>
        <p>${data.detectedSections && data.detectedSections.length ? data.detectedSections.map(escapeHtml).join(", ") : "None detected"}</p>
      </div>

      <div class="analysis-card">
        <h3>Longest line</h3>
        <p>${data.longestLine ? escapeHtml(data.longestLine) : "None"}</p>
      </div>
    `;

    openPanel("analysis");
  } catch (error) {
    analysisResults.innerHTML = '<p class="empty-copy">Could not analyze lyrics.</p>';
  }
}

async function showRhymes() {
  const sourceWord = getSelectionOrLastWord();

  if (!sourceWord) {
    showToolResults(
      "Rhyming ideas",
      `<p class="empty-copy">Select a word or place your cursor in the editor first.</p>`
    );
    return;
  }

  showToolResults(
    "Rhyming ideas",
    `<p class="empty-copy">Loading rhyme suggestions for "${escapeHtml(sourceWord)}"...</p>`
  );

  try {
    const params = new URLSearchParams({ word: sourceWord });
    const response = await fetch(`/api/word-tools/rhymes?${params.toString()}`);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.details || data.error || "Could not fetch rhymes.");
    }

    const suggestions = Array.isArray(data.results)
      ? data.results
          .map((item) => typeof item === "string" ? item : item.word)
          .filter(Boolean)
      : [];

    const cleaned = [...new Set(
      suggestions
        .map((word) => String(word).trim().toLowerCase())
        .filter((word) => /^[a-zA-Z']+$/.test(word) && word !== sourceWord)
    )].slice(0, 16);

    if (!cleaned.length) {
      throw new Error("No rhyme suggestions returned.");
    }

    renderRhymeResults(sourceWord, cleaned);
  } catch (error) {
    const fallback = getFallbackRhymes(sourceWord);
    renderRhymeResults(sourceWord, fallback);
    if (!fallback.length) {
      setStatus("No rhyme suggestions found.", true, 3500);
    } else {
      setStatus("Using fallback rhyme ideas.", true, 3000);
    }
  }
}

async function showRandomIdeas() {
  showToolResults(
    "Random writing ideas",
    `<p class="empty-copy">Loading random ideas...</p>`
  );

  try {
    const params = new URLSearchParams({ mode: "word" });
    const response = await fetch(`/api/word-tools/random?${params.toString()}`);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.details || data.error || "Could not fetch random ideas.");
    }

    const items = data.result ? [data.result] : [];

    if (!items.length) {
      throw new Error("No random ideas returned.");
    }

    renderRandomResults(items);
  } catch (error) {
    renderRandomResults(getFallbackRandomItems());
    setStatus("Using fallback random ideas.", true, 3000);
  }
}

analyzeBtn.addEventListener("click", analyzeLyrics);
saveSongBtn.addEventListener("click", () => saveSong());

// Ctrl+S / Cmd+S saves right away
document.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
    event.preventDefault();
    saveSong();
  }
});

// Warn before leaving the page if something hasn't saved yet
window.addEventListener("beforeunload", (event) => {
  if (hasUnsavedChanges || isSaving) {
    event.preventDefault();
    event.returnValue = "";
  }
});
newSongBtn.addEventListener("click", resetEditor);
rhymingBtn.addEventListener("click", showRhymes);
randomBtn.addEventListener("click", showRandomIdeas);

loadSongs();
renderSections();
openPanel("library");

window.openSong = openSong;
window.deleteSong = deleteSong;
window.insertToolWord = function (word) {
  insertWordIntoEditor(word);
};

toolResultsBody.addEventListener("click", (event) => {
  const button = event.target.closest("[data-insert-word]");
  if (button) insertWordIntoEditor(button.dataset.insertWord);
});

})();
