document.addEventListener("DOMContentLoaded", () => {
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

  let draggedCard = null;

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

    if (!draggedCard || draggedCard === card) {
      return;
    }

    parsedSectionsList.insertBefore(draggedCard, card);
  });

  return card;
}
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
      "Drag section cards to reorder them. The textarea will update automatically.";

    parsedSections.forEach((section) => {
      const card = createSectionCard(section);
      parsedSectionsList.appendChild(card);
    });
  }

  function resetResults() {
    lineCount.textContent = "0";
    nonEmptyLineCount.textContent = "0";
    wordCount.textContent = "0";
    characterCount.textContent = "0";
    characterCountNoSpaces.textContent = "0";
    averageWordsPerLine.textContent = "0";
    longestLineLength.textContent = "0";
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
    nonEmptyLineCount.textContent = data.nonEmptyLineCount ?? "0";
    wordCount.textContent = data.wordCount ?? "0";
    characterCount.textContent = data.characterCount ?? "0";
    characterCountNoSpaces.textContent = data.characterCountNoSpaces ?? "0";
    averageWordsPerLine.textContent = data.averageWordsPerLine ?? "0";
    longestLineLength.textContent = data.longestLineLength ?? "0";
    sectionCount.textContent = data.sectionCount ?? "0";

    if (data.longestLine && data.longestLine.trim() !== "") {
      longestLineText.textContent = data.longestLine;
    } else {
      longestLineText.textContent = "No longest line found yet.";
    }

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
        "Something went wrong while analyzing your lyrics.";
    }
  });

  clearButton.addEventListener("click", () => {
    lyricsInput.value = "";
    resetResults();
    lyricsInput.focus();
  });

  resetResults();
});
