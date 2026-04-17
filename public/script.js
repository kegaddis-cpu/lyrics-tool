// Wait until the full HTML document is ready before running our code
document.addEventListener("DOMContentLoaded", () => {
  // Get the main form so we can listen for submission
  const lyricsForm = document.getElementById("lyrics-form");

  // Get the textarea where the user writes lyrics
  const lyricsInput = document.getElementById("lyrics-input");

  // Get the Clear button
  const clearButton = document.getElementById("clear-btn");

  // Get the status message area
  const statusMessage = document.getElementById("status-message");

  // Get the label helper buttons
  const labelButtons = document.querySelectorAll(".label-btn");

  // Get the parsed sections panel elements
  const parsedSectionsList = document.getElementById("parsed-sections-list");
  const sectionsPanelMessage = document.getElementById("sections-panel-message");

  // Get each stat output field
  const lineCount = document.getElementById("line-count");
  const nonEmptyLineCount = document.getElementById("non-empty-line-count");
  const wordCount = document.getElementById("word-count");
  const characterCount = document.getElementById("character-count");
  const characterCountNoSpaces = document.getElementById("character-count-no-spaces");
  const averageWordsPerLine = document.getElementById("average-words-per-line");
  const longestLineLength = document.getElementById("longest-line-length");
  const sectionCount = document.getElementById("section-count");

  // Get the extra detail output areas
  const sectionsEmpty = document.getElementById("sections-empty");
  const sectionsList = document.getElementById("sections-list");
  const longestLineText = document.getElementById("longest-line-text");

  // Keep track of which parsed section card is being dragged
  let draggedCard = null;

  // Helper function to insert text into the textarea at the current cursor position
  function insertAtCursor(textToInsert) {
    // Get the current cursor start and end positions
    const start = lyricsInput.selectionStart;
    const end = lyricsInput.selectionEnd;

    // Get the text before and after the current selection
    const before = lyricsInput.value.slice(0, start);
    const after = lyricsInput.value.slice(end);

    // Decide whether to add line breaks before the label
    const prefix = before && !before.endsWith("\n") ? "\n\n" : "";

    // Add line breaks after the label so the user can start typing below it
    const insertion = `${prefix}${textToInsert}\n`;

    // Build the new textarea value
    lyricsInput.value = before + insertion + after;

    // Place the cursor at the end of the inserted text
    const newPosition = (before + insertion).length;
    lyricsInput.focus();
    lyricsInput.setSelectionRange(newPosition, newPosition);
  }

  // Helper function to create one parsed section card
  function createSectionCard(section) {
    // Create the outer card element
    const card = document.createElement("article");

    // Add a CSS class for styling
    card.className = "section-card";

    // Mark the card as draggable
    card.draggable = true;

    // Store the section id on the card for future use
    card.dataset.sectionId = section.id;

    // Create the card header
    const cardHeader = document.createElement("div");
    cardHeader.className = "section-card-header";

    // Create the section title element
    const title = document.createElement("h3");
    title.textContent = section.label;

    // Create a small drag handle hint
    const handle = document.createElement("span");
    handle.className = "drag-handle";
    handle.textContent = "Drag";

    // Add the title and handle into the card header
    cardHeader.appendChild(title);
    cardHeader.appendChild(handle);

    // Create the section body text area
    const body = document.createElement("pre");
    body.className = "section-card-content";
    body.textContent = section.content || "(No lines in this section)";

    // Put the header and content into the card
    card.appendChild(cardHeader);
    card.appendChild(body);

    // When dragging starts, remember this card and add a visual state
    card.addEventListener("dragstart", () => {
      draggedCard = card;
      card.classList.add("dragging");
    });

    // When dragging ends, remove the visual drag state
    card.addEventListener("dragend", () => {
      card.classList.remove("dragging");
      draggedCard = null;
    });

    // Allow dropping onto another card
    card.addEventListener("dragover", (event) => {
      // Prevent default so dropping is allowed
      event.preventDefault();

      // Ignore if there is no dragged card or if the target is the same card
      if (!draggedCard || draggedCard === card) {
        return;
      }

      // Move the dragged card before the current card
      parsedSectionsList.insertBefore(draggedCard, card);
    });

    // Return the finished card element
    return card;
  }

  // Helper function to render parsed sections in the panel
  function renderParsedSections(parsedSections) {
    // Clear any existing cards from the panel
    parsedSectionsList.innerHTML = "";

    // If there are no parsed sections, show the helper message
    if (!Array.isArray(parsedSections) || parsedSections.length === 0) {
      sectionsPanelMessage.textContent =
        "No parsed sections yet. Add labels like Verse or Chorus and click Analyze.";
      return;
    }

    // Update the helper message for success
    sectionsPanelMessage.textContent = "Drag section cards to experiment with order.";

    // Create and add one card for each parsed section
    parsedSections.forEach((section) => {
      const card = createSectionCard(section);
      parsedSectionsList.appendChild(card);
    });
  }

  // Helper function to reset all outputs back to defaults
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

  // Helper function to display all returned analysis data
  function displayResults(data) {
    lineCount.textContent = data.lineCount;
    nonEmptyLineCount.textContent = data.nonEmptyLineCount;
    wordCount.textContent = data.wordCount;
    characterCount.textContent = data.characterCount;
    characterCountNoSpaces.textContent = data.characterCountNoSpaces;
    averageWordsPerLine.textContent = data.averageWordsPerLine;
    longestLineLength.textContent = data.longestLineLength;
    sectionCount.textContent = data.sectionCount;

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

  // Add click behavior to every label button
  labelButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const label = button.dataset.label;
      insertAtCursor(label);
    });
  });

  // Listen for form submission
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
      statusMessage.textContent = "Something went wrong while analyzing your lyrics.";
      console.error("Analysis error:", error);
      resetResults();
    }
  });

  // Listen for clicks on the Clear button
  clearButton.addEventListener("click", () => {
    lyricsInput.value = "";
    resetResults();
    lyricsInput.focus();
  });

  // Set the page to its default state on first load
  resetResults();
});
