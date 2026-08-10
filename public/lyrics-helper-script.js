(() => {
  let currentSongId = null;
  let lastSelectionStart = 0;
  let lastSelectionEnd = 0;
  let sections = [];
  let nextSectionId = 1;
  let draggingSectionId = null;
  let statusClearTimer = null;
  let isResizing = false;

  const DEFAULT_PANEL_WIDTH = 360;
  const MIN_PANEL_WIDTH = 280;
  const MAX_PANEL_WIDTH = 560;
  const byId = (id) => document.getElementById(id);

  const workspaceLayout = byId("workspaceLayout");
  const panelResizeHandle = byId("panelResizeHandle");
  const collapsePanelBtn = byId("collapsePanelBtn");
  const activePanelLabel = byId("activePanelLabel");
  const lyricsInput = byId("lyricsInput");
  const songTitle = byId("songTitle");
  const isPublic = byId("isPublic");
  const openLibraryBtn = byId("openLibraryBtn");
  const analyzeBtn = byId("analyzeBtn");
  const saveSongBtn = byId("saveSongBtn");
  const newSongBtn = byId("newSongBtn");
  const rhymingBtn = byId("rhymingBtn");
  const randomBtn = byId("randomBtn");
  const analysisResults = byId("analysisResults");
  const songsList = byId("songsList");
  const saveStatus = byId("saveStatus");
  const toolResults = byId("toolResults");
  const toolResultsTitle = byId("toolResultsTitle");
  const toolResultsBody = byId("toolResultsBody");
  const closeToolResultsBtn = byId("closeToolResultsBtn");
  const toolEmptyState = byId("toolEmptyState");
  const editorMainGrid = byId("editorMainGrid");
  const sectionsToggle = byId("sectionsToggle");
  const sectionsList = byId("sectionsList");
  const sectionsEmptyState = byId("sectionsEmptyState");
  const sideTabs = Array.from(document.querySelectorAll(".side-tab"));
  const addSectionButtons = Array.from(document.querySelectorAll(".add-section-btn"));
  const sidePanels = {
    library: byId("panel-library"),
    analysis: byId("panel-analysis"),
    tools: byId("panel-tools")
  };

  if (!workspaceLayout || !lyricsInput || !songTitle) return;

  const railWidth = parseInt(getComputedStyle(workspaceLayout).getPropertyValue("--rail-width"), 10) || 72;
  const isMobile = () => window.matchMedia("(max-width: 767px)").matches;

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (match) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[match]);
  }

  function rememberSelection() {
    lastSelectionStart = lyricsInput.selectionStart || 0;
    lastSelectionEnd = lyricsInput.selectionEnd || 0;
  }

  function clearStatusMessage() {
    if (!saveStatus) return;
    saveStatus.textContent = "";
    saveStatus.classList.remove("error", "success");
  }

  function setStatus(message, isError = false, autoClearMs = 0) {
    if (!saveStatus) return;
    if (statusClearTimer) clearTimeout(statusClearTimer);
    saveStatus.textContent = message || "";
    saveStatus.classList.toggle("error", Boolean(message) && isError);
    saveStatus.classList.toggle("success", Boolean(message) && !isError);
    if (message && autoClearMs > 0) {
      statusClearTimer = setTimeout(clearStatusMessage, autoClearMs);
    }
  }

  function clampPanelWidth(width) {
    return Math.max(MIN_PANEL_WIDTH, Math.min(MAX_PANEL_WIDTH, width));
  }

  function openPanel(panelName, moveFocus = false) {
    if (!sidePanels[panelName]) return;
    workspaceLayout.classList.remove("is-collapsed");

    if (!isMobile() && !parseInt(workspaceLayout.style.getPropertyValue("--panel-width"), 10)) {
      workspaceLayout.style.setProperty("--panel-width", `${DEFAULT_PANEL_WIDTH}px`);
    }

    sideTabs.forEach((tab) => {
      const active = tab.dataset.panel === panelName;
      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-selected", String(active));
      tab.tabIndex = active ? 0 : -1;
      if (active && moveFocus) tab.focus();
    });

    Object.entries(sidePanels).forEach(([name, panel]) => {
      if (!panel) return;
      const active = name === panelName;
      panel.classList.toggle("is-active", active);
      panel.hidden = !active;
    });

    if (activePanelLabel) {
      activePanelLabel.textContent = `${panelName.charAt(0).toUpperCase()}${panelName.slice(1)} panel`;
    }

    if (collapsePanelBtn) collapsePanelBtn.textContent = "Collapse";
  }

  function collapsePanel() {
    if (isMobile()) {
      openPanel("library");
      return;
    }

    workspaceLayout.classList.add("is-collapsed");
    workspaceLayout.style.setProperty("--panel-width", "0px");

    sideTabs.forEach((tab, index) => {
      tab.classList.remove("is-active");
      tab.setAttribute("aria-selected", "false");
      tab.tabIndex = index === 0 ? 0 : -1;
    });

    Object.values(sidePanels).forEach((panel) => {
      if (!panel) return;
      panel.classList.remove("is-active");
      panel.hidden = true;
    });

    if (activePanelLabel) activePanelLabel.textContent = "Workspace panel";
    if (collapsePanelBtn) collapsePanelBtn.textContent = "Open panel";
  }

  function togglePanel(panelName) {
    const tab = sideTabs.find((item) => item.dataset.panel === panelName);
    const alreadyOpen = !isMobile() && !workspaceLayout.classList.contains("is-collapsed") && tab?.classList.contains("is-active");
    if (alreadyOpen) collapsePanel();
    else openPanel(panelName, true);
  }

  function toggleSectionsPanel() {
    if (!editorMainGrid || !sectionsToggle) return;
    const collapsed = editorMainGrid.classList.toggle("sections-collapsed");
    sectionsToggle.setAttribute("aria-expanded", String(!collapsed));
  }

  function showToolResults(title, html) {
    if (!toolResults || !toolResultsTitle || !toolResultsBody || !toolEmptyState) return;
    toolResultsTitle.textContent = title;
    toolResultsBody.innerHTML = html;
    toolResults.hidden = false;
    toolEmptyState.hidden = true;
    openPanel("tools");
  }

  function hideToolResults() {
    if (!toolResults || !toolResultsTitle || !toolResultsBody || !toolEmptyState) return;
    toolResults.hidden = true;
    toolResultsTitle.textContent = "Writing tools";
    toolResultsBody.innerHTML = "";
    toolEmptyState.hidden = false;
  }

  function buildLyricsFromSections() {
    if (!sections.length) return lyricsInput.value.trim();
    return sections.map((section, index) => {
      const count = sections.slice(0, index + 1).filter((item) => item.type === section.type).length;
      const label = `[${section.type} ${count}]`;
      return section.text.trim() ? `${label}\n${section.text.trim()}` : label;
    }).join("\n\n").trim();
  }

  function syncLyricsFromSections() {
    const start = lyricsInput.selectionStart || 0;
    const end = lyricsInput.selectionEnd || 0;
    lyricsInput.value = buildLyricsFromSections();
    lyricsInput.setSelectionRange(Math.min(start, lyricsInput.value.length), Math.min(end, lyricsInput.value.length));
    rememberSelection();
  }

  function createSection(type) {
    sections.push({ id: nextSectionId++, type, text: "" });
    renderSections();
    syncLyricsFromSections();
    setStatus(`${type} section added.`, false, 2200);
  }

  function updateSectionText(id, value) {
    const section = sections.find((item) => item.id === id);
    if (!section) return;
    section.text = value;
    syncLyricsFromSections();
  }

  function removeSection(id) {
    sections = sections.filter((item) => item.id !== id);
    renderSections();
    syncLyricsFromSections();
    setStatus("Section removed.", false, 2200);
  }

  function moveSection(id, direction) {
    const index = sections.findIndex((item) => item.id === id);
    const target = direction === "up" ? index - 1 : index + 1;
    if (index < 0 || target < 0 || target >= sections.length) return;
    [sections[index], sections[target]] = [sections[target], sections[index]];
    renderSections();
    syncLyricsFromSections();
  }

  function renderSections() {
    if (!sectionsList || !sectionsEmptyState) return;
    sectionsEmptyState.hidden = sections.length > 0;
    sectionsList.innerHTML = "";

    sections.forEach((section, index) => {
      const number = sections.slice(0, index + 1).filter((item) => item.type === section.type).length;
      const card = document.createElement("article");
      card.className = "section-card";
      card.draggable = true;
      card.dataset.sectionId = String(section.id);
      card.innerHTML = `
        <div class="section-card-head">
          <div class="section-card-title-group">
            <span class="drag-handle" aria-hidden="true">⋮⋮</span>
            <div><p class="section-card-kicker">Section</p><h4>${escapeHtml(section.type)} ${number}</h4></div>
          </div>
          <div class="section-card-actions">
            <button type="button" class="ghost-btn small-btn" data-action="up" aria-label="Move section up">↑</button>
            <button type="button" class="ghost-btn small-btn" data-action="down" aria-label="Move section down">↓</button>
            <button type="button" class="ghost-btn small-btn" data-action="delete">Delete</button>
          </div>
        </div>
        <textarea class="section-textarea" placeholder="Write ${escapeHtml(section.type.toLowerCase())} lyrics here...">${escapeHtml(section.text)}</textarea>`;

      card.querySelector(".section-textarea").addEventListener("input", (event) => updateSectionText(section.id, event.target.value));
      card.querySelector('[data-action="up"]').addEventListener("click", () => moveSection(section.id, "up"));
      card.querySelector('[data-action="down"]').addEventListener("click", () => moveSection(section.id, "down"));
      card.querySelector('[data-action="delete"]').addEventListener("click", () => removeSection(section.id));
      card.addEventListener("dragstart", () => { draggingSectionId = section.id; card.classList.add("is-dragging"); });
      card.addEventListener("dragend", () => {
        draggingSectionId = null;
        card.classList.remove("is-dragging");
        document.querySelectorAll(".section-card").forEach((item) => item.classList.remove("drag-over"));
      });
      card.addEventListener("dragover", (event) => {
        event.preventDefault();
        if (Number(card.dataset.sectionId) !== draggingSectionId) card.classList.add("drag-over");
      });
      card.addEventListener("dragleave", () 
