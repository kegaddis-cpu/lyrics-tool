console.log("Lyrics Helper recovered script loaded");
(() => {
let currentSongId = null;
let lastSelectionStart = 0;
let lastSelectionEnd = 0;
let sections = [];
let nextSectionId = 1;
let draggingSectionId = null;
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
const addSectionButtons = Array.from(document.querySelectorAll(".add-section-btn"));

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

["select", "click", "keyup", "mouseup", "focus"].forEach((eventName) => {
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

function buildLyricsFromSections() {
  if (!sections.length) return lyricsInput.value.trim();

  return sections
    .map((section, index) => {
      const countForType = sections
        .slice(0, index + 1)
        .filter((item) => item.type === section.type).length;

      const label = `[${section.type} ${countForType}]`;
      const text = section.text.trim();

      return text ? `${label}\n${text}` : `${label}`;
    })
    .join("\n\n")
    .trim();
}

function syncLyricsFromSections() {
  const currentStart = lyricsInput.selectionStart || 0;
  const currentEnd = lyricsInput.selectionEnd || 0;
  lyricsInput.value = buildLyricsFromSections();
  const nextCursor = Math.min(lyricsInput.value.length, currentStart);
  lyricsInput.setSelectionRange(nextCursor, Math.min(lyricsInput.value.length, currentEnd));
  rememberSelection();
}

function createSection(type) {
  sections.push({
    id: nextSectionId++,
    type,
    text: ""
  });

  renderSections();
  syncLyricsFromSections();
  markDirty();
  setStatus(`${type} section added.`, false, 2200);
}

function updateSectionText(id, value) {
  const section = sections.find((item) => item.id === id);
  if (!section) return;
  section.text = value;
  syncLyricsFromSections();
  markDirty();
}

function removeSection(id) {
  sections = sections.filter((item) => item.id !== id);
  renderSections();
  syncLyricsFromSections();
  markDirty();
  setStatus("Section removed.", false, 2200);
}

function moveSection(id, direction) {
  const index = sections.findIndex((item) => item.id === id);
  if (index === -1) return;

  const targetIndex = direction === "up" ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= sections.length) return;

  const temp = sections[index];
  sections[index] = sections[targetIndex];
  sections[targetIndex] = temp;

  renderSections();
  syncLyricsFromSections();
  markDirty();
}

function renderSections() {
  sectionsEmptyState.hidden = sections.length > 0;
  sectionsList.innerHTML = "";

  sections.forEach((section, index) => {
    const duplicateCount = sections
      .slice(0, index + 1)
      .filter((item) => item.type === section.type).length;

    const card = document.createElement("article");
    card.className = "section-card";
    card.draggable = true;
    card.dataset.sectionId = String(section.id);

    card.innerHTML = `
      <div class="section-card-head">
        <div class="section-card-title-group">
          <span class="drag-handle" aria-hidden="true">&#8942;&#8942;</span>
          <div>
            <p class="section-card-kicker">Section</p>
            <h4>${escapeHtml(section.type)} ${duplicateCount}</h4>
          </div>
        </div>

        <div class="section-card-actions">
          <button type="button" class="ghost-btn small-btn" data-action="up" aria-label="Move section up" title="Move up">&#8593;</button>
          <button type="button" class="ghost-btn small-btn" data-action="down" aria-label="Move section down" title="Move down">&#8595;</button>
          <button type="button" class="ghost-btn small-btn" data-action="delete">Delete</button>
        </div>
      </div>

      <textarea
        class="section-textarea"
        placeholder="Write ${escapeHtml(section.type.toLowerCase())} lyrics here..."
      >${escapeHtml(section.text)}</textarea>
    `;

    const textarea = card.querySelector(".section-textarea");
    textarea.addEventListener("input", (event) => {
      updateSectionText(section.id, event.target.value);
    });

    card.querySelector('[data-action="up"]').addEventListener("click", () => moveSection(section.id, "up"));
    card.querySelector('[data-action="down"]').addEventListener("click", () => moveSection(section.id, "down"));
    card.querySelector('[data-action="delete"]').addEventListener("click", () => removeSection(section.id));

    card.addEventListener("dragstart", () => {
      draggingSectionId = section.id;
      card.classList.add("is-dragging");
    });

    card.addEventListener("dragend", () => {
      draggingSectionId = null;
      card.classList.remove("is-dragging");
      sectionsList.querySelectorAll(".section-card").forEach((item) => {
        item.classList.remove("drag-over");
      });
    });

    card.addEventListener("dragover", (event) => {
      event.preventDefault();
      const currentCard = event.currentTarget;
      if (!currentCard || Number(currentCard.dataset.sectionId) === draggingSectionId) return;

      sectionsList.querySelectorAll(".section-card").forEach((item) => {
        item.classList.remove("drag-over");
      });

      currentCard.classList.add("drag-over");
    });

    card.addEventListener("drop", (event) => {
      event.preventDefault();
      const targetId = Number(event.currentTarget.dataset.sectionId);
      if (!draggingSectionId || draggingSectionId === targetId) return;

      const fromIndex = sections.findIndex((item) => item.id === draggingSectionId);
      const toIndex = sections.findIndex((item) => item.id === targetId);
      if (fromIndex === -1 || toIndex === -1) return;

      const [movedSection] = sections.splice(fromIndex, 1);
      sections.splice(toIndex, 0, movedSection);

      renderSections();
      syncLyricsFromSections();
      markDirty();
      setStatus("Section order updated.", false, 2200);
    });

    sectionsList.appendChild(card);
  });
}

function parseSectionsFromLyrics(text) {
  const lines = String(text || "").split(/\r?\n/);
  const headerRegex = /^\s*\[(verse|chorus|pre-chorus|pre chorus|bridge|hook|intro|outro)(?:\s+\d+)?\]\s*$/i;

  const parsed = [];
  let current = null;

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    const headerMatch = trimmed.match(headerRegex);

    if (headerMatch) {
      if (current) {
        current.text = current.lines.join("\n").trim();
        delete current.lines;
        parsed.push(current);
      }

      let type = headerMatch[1];
      if (/^pre chorus$/i.test(type) || /^pre-chorus$/i.test(type)) {
        type = "Pre-Chorus";
      } else {
        type = type.charAt(0).toUpperCase() + type.slice(1).toLowerCase();
      }

      current = {
        id: nextSectionId++,
        type,
        lines: []
      };
      continue;
    }

    if (!current) {
      current = {
        id: nextSectionId++,
        type: "Verse",
        lines: []
      };
    }

    current.lines.push(rawLine);
  }

  if (current) {
    current.text = current.lines.join("\n").trim();
    delete current.lines;
    parsed.push(current);
  }

  return parsed.filter((item) => item.text || item.type);
}

lyricsInput.addEventListener("blur", () => {
  const text = lyricsInput.value.trim();

  if (!text) {
    if (sections.length) {
      sections = [];
      renderSections();
    }
    return;
  }

  const parsed = parseSectionsFromLyrics(text);
  if (parsed.length) {
    sections = parsed;
    renderSections();
  }
});

lyricsInput.addEventListener("input", markDirty);

songTitle.addEventListener("input", () => {
  if (songTitle.value.trim()) titlePromptShown = false;
  markDirty();
});

addSectionButtons.forEach((button) => {
  button.addEventListener("click", () => {
    createSection(button.dataset.type);
  });
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

  const parsed = parseSectionsFromLyrics(lyricsInput.value);
  if (parsed.length) {
    sections = parsed;
    renderSections();
  }
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

    const parsed = parseSectionsFromLyrics(data.song.lyrics || "");
    sections = parsed.length ? parsed : [];
    renderSections();
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
      sections = [];
      renderSections();
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
  sections = [];
  renderSections();
  analysisResults.innerHTML = '<p class="empty-copy">No analysis yet.</p>';
  hideToolResults();
  clearStatusMessage();
}

async function analyzeLyrics() {
  const lyrics = sections.length ? buildLyricsFromSections() : lyricsInput.value.trim();
  lyricsInput.value = lyrics;

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
