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
  const getSelectedRhymesBtn = document.getElementById("get-selected-rhymes-btn");
  const getRhymesBtn = document.getElementById("get-rhymes-btn");
  const getSyllablesBtn = document.getElementById("get-syllables-btn");
  const getRandomBtn = document.getElementById("get-random-btn");
  const selectedWordPreview = document.getElementById("selected-word-preview");
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

  function getSelectedWordFromLyrics() {
    const start = lyricsInput.selectionStart ?? 0;
    const end = lyricsInput.selectionEnd ?? 0;
    const selectedText = lyricsInput.value.slice(start, end).trim();

    if (!selectedText) {
      return "";
    }

    return selectedText.replace(/[^\w'-\s]/g, "").trim();
  }

  function updateSelectedWordPreview() {
    const selectedWord = getSelectedWordFromLyrics();

    if (selectedWord) {
      selectedWordPreview.textContent = `Selected in lyrics: "${selectedWord}"`;
    } else {
      selectedWordPreview.textContent = "No word selected in lyrics yet.";
    }
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
      .map((word) => `<button type="button" class="word-chip insert-word-btn" data-word="${escapeHtml(word)}">${escapeHtml(word)}</button>`)
      .join("");

    setWordToolsResults(`
      <div class="word-tools-result-block">
        <h3>${escapeHtml(title)}</h3>
        <div class="word-chip-list">${items}</div>
      </div>
    `);

    document.querySelectorAll(".insert-word-btn").forEach((button) => {
      button.addEventListener("click", () => {
        const word = button.dataset.word || "";
        wordToolsInput.value = word;
        setWordToolsStatus(`Loaded "${word}" into the word tools input.`);
      });
    });
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
          <button type="button" class="word-chip insert-word-btn" data-word="${escapeHtml(result)}">${escapeHtml(result)}</button>
        </div>
      </div>
    `);

    document.querySelectorAll(".insert-word-btn").forEach((button) => {
      button.addEventListener("click", () => {
        const word = button.dataset.word || "";
        wordToolsInput.value = word;
        setWordToolsStatus(`Loaded "${word}" into the word tools input.`);
      });
    });
  }

  async function runRhymesSearch(word, sourceLabel) {
    if (!word) {
      setWordToolsStatus("Select a word in the lyrics or type one first.");
      setWordToolsResults("");
      return;
    }

    wordToolsInput.value = word;
    setWordToolsStatus(`Finding rhymes for "${word}" from ${sourceLabel}...`);

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
  }

  function insertAtCursor(text
