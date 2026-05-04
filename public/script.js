document.addEventListener("DOMContentLoaded", () => {
  const lyricsForm = document.getElementById("lyrics-form");
  const lyricsInput = document.getElementById("lyrics-input");
  const clearButton = document.getElementById("clear-btn");
  const statusMessage = document.getElementById("status-message");
  const labelButtons = document.querySelectorAll(".label-btn");

  const parsedSectionsList = document.getElementById("parsed-sections-list");
  const sectionsPanelMessage = document.getElementById("sections-panel-message");

  const lineCount = document.getElementById("line-count");
  const wordCount = document.getElementById("word-count");
  const averageWordsPerLine = document.getElementById("average-words-per-line");
  const sectionCount = document.getElementById("section-count");

  const sectionsEmpty = document.getElementById("sections-empty");
  const sectionsList = document.getElementById("sections-list");
  const longestLineText = document.getElementById("longest-line-text");

  const wordToolsInput = document.getElementById("word-tools-input");
  const randomModeSelect = document.getElementById("random-mode-select");
  const getRhymesBtn = document.getElementById("get-rhymes-btn");
  const getSyllablesBtn = document.getElementById("get-syllables-btn");
  const getRandomBtn = document.getElementById("get-random-btn");
  const wordToolsStatus = document.getElementById("word-tools-status");
  const wordToolsResults = document.getElementById("word-tools-results");

  const STORAGE_KEY = "lyrics-helper-draft";

  let draggedCard = null;

  function saveDraft() {
    localStorage.setItem(STORAGE_KEY, lyricsInput.value);
  }

  function loadDraft() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved !== null) {
      lyricsInput.value = saved;
    }
  }

  function clearDraft() {
    localStorage.removeItem(STORAGE_KEY);
  }

  function escapeHtml(value) {
    return value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function setWordToolsStatus(message) {
    wordToolsStatus.textContent = message;
  }

  function setWordToolsResults(html) {
    wordToolsResults.innerHTML = html;
  }

  async function fetchWordToolsJson(url) {
    const response = await fetch(url);

    if (response.status === 401) {
      window.location.href = "/login";
      return null;
    }

    if (!response.ok) {
      throw new Error(`Server returned ${response.status}`);
    }

    return response.json();
  }

  function renderWordList(title, words) {
    if (!Array.isArray(words) || words.length === 0) {
      setWordToolsResults(`<p class="word-tools-empty">No results found.</p>`);
      return;
    }

    const items = words
      .map((word) => `<span class="word-chip">${escapeHtml(word)}</span>`)
      .join("");

    setWordToolsResults(`
      <div class="word-tools-result-block">
        <h3>${escapeHtml(title)}</h3>
        <div class="word-chip-list">${items}</div>
      </div>
    `);
  }

  function renderSyllableResult(text, syllables) {
    if (syllables === null || syllables === undefined) {
      setWordToolsResults(`<p class="word-tools-empty">No syllable data found for <strong>${escapeHtml(text)}</strong>.</p>`);
      return;
    }

    setWordToolsResults(`
      <div class="word-tools-result-block">
        <h3>Syllable Count</h3>
        <p><strong>${escapeHtml(text)}</strong> has ${syllables} syllable${syllables === 1 ? "" : "s"}.</p>
      </div>
    `);
  }

  function renderRandomResult(result, mode) {
    if (!result) {
      setWordToolsResults(`<p class="word-tools-empty">No random ${mode} found.</p>`);
      return;
    }

    setWordToolsResults(`
      <div class="word-tools-result-block">
        <h3>Random ${mode === "word" ? "Word" : "Phrase"}</h3>
        <div class="word-chip-list">
          <span class="word-chip">${escapeHtml(result)}</span>
        </div>
      </div>
    `);
  }

  function insertAtCursor(textToInsert) {
    const start = lyricsInput.selectionStart ?? 0;
    const end = lyricsInput.selectionEnd ?? 0;

    const before = lyricsInput.value.slice(0, start);
    const after = lyricsInput.value.slice(end);

    const prefix = before && !before.endsWith("\n") ? "\n\n" : "";
    const insertion = `${prefix}${textToInsert}\n`;

    lyricsInput.value = before + insertion + after;

    const newPosition = (before + insertion).length;
    lyricsInput.focus();
    lyricsInput.setSelectionRange(newPosition, newPosition);
    saveDraft();
  }

  function syncTextareaFromCards() {
    const cards = Array.from(parsedSectionsList.querySelectorAll(".section-card"));

    if (cards.length === 0) {
      return;
    }

    const rebuiltText = cards
      .map((card) => {
        const label = card.dataset.label || "Unlabeled";
        const content = card.dataset.content || "";

        if (label === "Unlabeled") {
          return content.trim();
        }

        return `${label}\n${content.trim()}`.trim();
      })
      .filter((block) => block !== "")
      .join("\n\n");

    lyricsInput.value = rebuiltText;
    saveDraft();
  }

  function createSectionCard(section) {
    const card = document.createElement("article");
    card.className = "section-card";
    card.draggable = true;

    card.dataset.sectionId = section.id || "";
    card.dataset.label = section.label || "Unlabeled";
    card.dataset.content = section.content || "";

    const handle = document.createElement("span");
    handle.className = "drag-handle";
    handle.setAttribute("aria-hidden", "true");
    handle.textContent = "☰";

    const contentWrap = document.createElement("div");
    contentWrap.className = "section-card-main";

    const title = document.createElement("h3");
    title.className = "section-card-title";
    title.textContent = section.label || "Unlabeled";

    const body = document.createElement("pre");
    body.className = "section-card-content";
    body.textContent = section.content || "(No lines in this section)";

    contentWrap.appendChild(title);
    contentWrap.appendChild(body);

    card.appendChild(handle);
    card.appendChild(contentWrap);

    card.addEventListener("dragstart", (event) => {
      draggedCard = card;
      card.classList.add("dragging");

      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = "move";
      }
    });

    card.addEventListener("dragend", () => {
      card.classList.remove("dragging");
      draggedCard = null;
      syncTextareaFromCards();
      sectionsPanelMessage.textContent =
        "Section order updated. The textarea now matches the card order.";
    });

    card.addEventListener("dragover", (event) => {
      event.preventDefault();

      if (!draggedCard || draggedCard === card) {
        return;
      }

      parsedSectionsList.insertBefore(draggedCard, card);
    });

    return card;
  }

  function renderParsedSections(parsedSections) {
    parsedSectionsList.innerHTML = "";

    if (!Array.isArray(parsedSections) || parsedSections.length === 0) {
      sectionsPanelMessage.textContent =
        "No parsed sections yet. Add labels like Verse or Chorus and click Analyze.";
      return;
    }

    sectionsPanelMessage.textContent =
      "Drag section cards using the handle on the left. The textarea will update automatically.";

    parsedSections.forEach((section) => {
      parsedSectionsList.appendChild(createSectionCard(section));
    });
  }

  function resetResults() {
    lineCount.textContent = "0";
    wordCount.textContent = "0";
    averageWordsPerLine.textContent = "0";
    sectionCount.textContent = "0";

    sectionsList.innerHTML = "";
    sectionsEmpty.style.display = "block";
    sectionsEmpty.textContent = "No sections detected yet.";

    longestLineText.textContent = "Nothing analyzed yet.";

    parsedSectionsList.innerHTML = "";
    sectionsPanelMessage.textContent =
      "Analyze your lyrics to turn detected sections into draggable cards.";

    statusMessage.textContent = "Enter some lyrics and click Analyze.";
  }

  function displayResults(data) {
    lineCount.textContent = data.lineCount ?? "0";
    wordCount.textContent = data.wordCount ?? "0";
    averageWordsPerLine.textContent = data.averageWordsPerLine ?? "0";
    sectionCount.textContent = data.sectionCount ?? "0";

    longestLineText.textContent =
      data.longestLine && data.longestLine.trim() !== ""
        ? data.longestLine
        : "No longest line found yet.";

    sectionsList.innerHTML = "";

    if (Array.isArray(data.detectedSections) && data.detectedSections.length > 0) {
      sectionsEmpty.style.display = "none";
      data.detectedSections.forEach((section) => {
        const listItem = document.createElement("li");
        listItem.textContent = section;
        sectionsList.appendChild(listItem);
      });
    } else {
      sectionsEmpty.style.display = "block";
      sectionsEmpty.textContent = "No section labels were detected.";
    }

    renderParsedSections(data.parsedSections);
    statusMessage.textContent = "Analysis complete.";
  }

  labelButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const label = button.dataset.label;
      if (label) {
        insertAtCursor(label);
      }
    });
  });

  lyricsInput.addEventListener("input", saveDraft);

  getRhymesBtn.addEventListener("click", async () => {
    const word = wordToolsInput.value.trim();

    if (!word) {
      setWordToolsStatus("Type a word first.");
      setWordToolsResults("");
      return;
    }

    setWordToolsStatus(`Finding rhymes for "${word}"...`);

    try {
      const data = await fetchWordToolsJson(`/api/word-tools/rhymes?word=${encodeURIComponent(word)}`);
      if (!data) return;

      setWordToolsStatus(`Rhymes for "${data.word}"`);
      renderWordList(`Rhymes for "${data.word}"`, data.results || []);
    } catch (error) {
      console.error(error);
      setWordToolsStatus("Could not fetch rhymes right now.");
      setWordToolsResults("");
    }
  });

  getSyllablesBtn.addEventListener("click", async () => {
    const text = wordToolsInput.value.trim();

    if (!text) {
      setWordToolsStatus("Type a word or phrase first.");
      setWordToolsResults("");
      return;
    }

    setWordToolsStatus(`Counting syllables for "${text}"...`);

    try {
      const data = await fetchWordToolsJson(`/api/word-tools/syllables?word=${encodeURIComponent(text)}`);
      if (!data) return;

      setWordToolsStatus(`Syllable result for "${data.text}"`);
      renderSyllableResult(data.text, data.syllables);
    } catch (error) {
      console.error(error);
      setWordToolsStatus("Could not fetch syllable data right now.");
      setWordToolsResults("");
    }
  });

  getRandomBtn.addEventListener("click", async () => {
    const topic = wordToolsInput.value.trim();
    const mode = randomModeSelect.value;

    setWordToolsStatus(
      topic
        ? `Finding a random ${mode} related to "${topic}"...`
        : `Finding a random ${mode}...`
    );

    try {
      const data = await fetchWordToolsJson(
        `/api/word-tools/random?topic=${encodeURIComponent(topic)}&mode=${encodeURIComponent(mode)}`
      );
      if (!data) return;

      setWordToolsStatus(`Random ${data.mode} ready.`);
      renderRandomResult(data.result, data.mode);
    } catch (error) {
      console.error(error);
      setWordToolsStatus("Could not fetch a random result right now.");
      setWordToolsResults("");
    }
  });

  lyricsForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const lyrics = lyricsInput.value;
    saveDraft();

    if (!lyrics.trim()) {
      resetResults();
      statusMessage.textContent = "Please enter some lyrics before analyzing.";
      return;
    }

    statusMessage.textContent = "Analyzing lyrics...";

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ lyrics })
      });

      if (response.status === 401) {
        window.location.href = "/login";
        return;
      }

      if (!response.ok) {
        throw new Error(`Server returned ${response.status}`);
      }

      const data = await response.json();
      displayResults(data);
    } catch (error) {
      console.error("Analysis error:", error);
      statusMessage.textContent =
        "Something went wrong while analyzing your lyrics.";
    }
  });

  clearButton.addEventListener("click", () => {
    lyricsInput.value = "";
    clearDraft();
    resetResults();
    lyricsInput.focus();
  });

  loadDraft();
  resetResults();
});
