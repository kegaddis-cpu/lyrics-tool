function initializeLyricsTool() {
  // Prevent double initialization
  if (window.__lyricsToolInitialized) {
    return;
  }
  window.__lyricsToolInitialized = true;

  // Core app elements
  const lyricsForm = document.getElementById("lyrics-form");
  const lyricsInput = document.getElementById("lyrics-input");
  const clearButton = document.getElementById("clear-btn");
  const statusMessage = document.getElementById("status-message");
  const labelButtons = document.querySelectorAll(".label-btn");

  const parsedSectionsList = document.getElementById("parsed-sections-list");
  const sectionsPanelMessage = document.getElementById("sections-panel-message");

  const lineCount = document.getElementById("line-count");
  const nonEmptyLineCount = document.getElementById("non-empty-line-count");
  const wordCount = document.getElementById("word-count");
  const characterCount = document.getElementById("character-count");
  const characterCountNoSpaces = document.getElementById("character-count-no-spaces");
  const averageWordsPerLine = document.getElementById("average-words-per-line");
  const longestLineLength = document.getElementById("longest-line-length");
  const sectionCount = document.getElementById("section-count");

  const sectionsEmpty = document.getElementById("sections-empty");
  const sectionsList = document.getElementById("sections-list");
  const longestLineText = document.getElementById("longest-line-text");

  // If this is not the app page, stop quietly
  if (!lyricsForm || !lyricsInput || !statusMessage) {
    return;
  }

  let draggedCard = null;

  function insertAtCursor(textToInsert) {
    const start = lyricsInput.selectionStart ?? 0;
    const end = lyricsInput.selectionEnd ?? 0;

    const before = lyricsInput.value.slice(0, start);
    const after = lyricsInput.value.slice(end);

    const needsLeadingBreaks = before.length > 0 && !before.endsWith("\n");
    const prefix = needsLeadingBreaks ? "\n\n" : "";
    const insertion = `${prefix}${textToInsert}\n`;

    lyricsInput.value = before + insertion + after;

    const newPosition = (before + insertion).length;
    lyricsInput.focus();
    lyricsInput.setSelectionRange(newPosition, newPosition);
  }

  function syncTextareaFromCards() {
    if (!parsedSectionsList) {
      return;
    }

    const cards = Array.from(parsedSectionsList.querySelectorAll(".section-card"));

    if (cards.length === 0) {
      return;
    }

    const rebuiltText = cards
      .map((card) => {
        const label = card.dataset.label || "";
        const content = card.dataset.content || "";

        if (label === "Unlabeled") {
          return content.trim();
        }

        return `${label}\n${content.trim()}`.trim();
      })
      .filter((block) => block !== "")
      .join("\n\n");

    lyricsInput.value = rebuiltText;
  }

  function createSectionCard(section) {
    const card = document.createElement("article");
    card.className = "section-card";
    card.draggable = true;
    card.dataset.sectionId = section.id || "";
    card.dataset.label = section.label || "Unlabeled";
    card.dataset.content = section.content || "";

    const cardHeader = document.createElement("div");
    cardHeader.className = "section-card-header";

    const title = document.createElement("h3");
    title.textContent = section.label || "Unlabeled";

    const handle = document.createElement("span");
    handle.className = "drag-handle";
    handle.textContent = "Drag";

    cardHeader.appendChild(title);
    cardHeader.appendChild(handle);

    const body = document.createElement("pre");
    body.className = "section-card-content";
    body.textContent = section.content || "(No lines in this section)";

    card.appendChild(cardHeader);
    card.appendChild(body);

    card.addEventListener("dragstart", () => {
      draggedCard = card;
      card.classList.add("dragging");
    });

    card.addEventListener("dragend", () => {
      card.classList.remove("dragging");
      draggedCard = null;
      syncTextareaFromCards();

      if (sectionsPanelMessage) {
        sectionsPanelMessage.textContent =
          "Section order updated. The textarea now matches the card order.";
      }
    });

    card.addEventListener("dragover", (event) => {
      event.preventDefault();

      if (!draggedCard || draggedCard === card || !parsedSectionsList) {
        return;
      }

      parsedSectionsList.insertBefore(draggedCard, card);
    });

    return card;
  }

  function renderParsedSections(parsedSections) {
    if (!parsedSectionsList || !sectionsPanelMessage) {
      return;
    }

    parsedSectionsList.innerHTML = "";

    if (!Array.isArray(parsedSections) || parsedSections.length === 0) {
      sectionsPanelMessage.textContent =
        "No parsed sections yet. Add labels like Verse or Chorus and click Analyze.";
      return;
    }

    sectionsPanelMessage.textContent =
      "Drag section cards to reorder them. The textarea will update automatically.";

    parsedSections.forEach((section) => {
      parsedSectionsList.appendChild(createSectionCard(section));
    });
  }

  function resetResults() {
    if (lineCount) lineCount.textContent = "0";
    if (nonEmptyLineCount) nonEmptyLineCount.textContent = "0";
    if (wordCount) wordCount.textContent = "0";
    if (characterCount) characterCount.textContent = "0";
    if (characterCountNoSpaces) characterCountNoSpaces.textContent = "0";
    if (averageWordsPerLine) averageWordsPerLine.textContent = "0";
    if (longestLineLength) longestLineLength.textContent = "0";
    if (sectionCount) sectionCount.textContent = "0";

    if (sectionsList) {
      sectionsList.innerHTML = "";
    }

    if (sectionsEmpty) {
      sectionsEmpty.style.display = "block";
      sectionsEmpty.textContent = "No sections detected yet.";
    }

    if (longestLineText) {
      longestLineText.textContent = "Nothing analyzed yet.";
    }

    if (parsedSectionsList) {
      parsedSectionsList.innerHTML = "";
    }

    if (sectionsPanelMessage) {
      sectionsPanelMessage.textContent =
        "Analyze your lyrics to turn detected sections into draggable cards.";
    }

    statusMessage.textContent = "Enter some lyrics and click Analyze.";
  }

  function displayResults(data) {
    if (lineCount) lineCount.textContent = data.lineCount ?? "0";
    if (nonEmptyLineCount) nonEmptyLineCount.textContent = data.nonEmptyLineCount ?? "0";
    if (wordCount) wordCount.textContent = data.wordCount ?? "0";
    if (characterCount) characterCount.textContent = data.characterCount ?? "0";
    if (characterCountNoSpaces) {
      characterCountNoSpaces.textContent = data.characterCountNoSpaces ?? "0";
    }
    if (averageWordsPerLine) {
      averageWordsPerLine.textContent = data.averageWordsPerLine ?? "0";
    }
    if (longestLineLength) {
      longestLineLength.textContent = data.longestLineLength ?? "0";
    }
    if (sectionCount) sectionCount.textContent = data.sectionCount ?? "0";

    if (longestLineText) {
      longestLineText.textContent =
        data.longestLine && data.longestLine.trim() !== ""
          ? data.longestLine
          : "No longest line found yet.";
    }

    if (sectionsList) {
      sectionsList.innerHTML = "";
    }

    if (Array.isArray(data.detectedSections) && data.detectedSections.length > 0) {
      if (sectionsEmpty) {
        sectionsEmpty.style.display = "none";
      }

      if (sectionsList) {
        data.detectedSections.forEach((section) => {
          const listItem = document.createElement("li");
          listItem.textContent = section;
          sectionsList.appendChild(listItem);
        });
      }
    } else if (sectionsEmpty) {
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

  lyricsForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const lyrics = lyricsInput.value;

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

      if (!response.ok) {
        throw new Error(`Server returned ${response.status}`);
      }

      const data = await response.json();
      displayResults(data);
    } catch (error) {
      console.error("Analysis error:", error);
      statusMessage.textContent =
        "Something went wrong while analyzing your lyrics. Check the browser console.";
    }
  });

  if (clearButton) {
    clearButton.addEventListener("click", () => {
      lyricsInput.value = "";
      resetResults();
      lyricsInput.focus();
    });
  }

  resetResults();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeLyricsTool);
} else {
  initializeLyricsTool();
}
