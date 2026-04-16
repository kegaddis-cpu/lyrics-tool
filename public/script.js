// Wait until the HTML page has fully loaded before running our code
document.addEventListener("DOMContentLoaded", () => {
  // Get the form element so we can listen for the Analyze button click
  const lyricsForm = document.getElementById("lyrics-form");

  // Get the textarea where the user types or pastes lyrics
  const lyricsInput = document.getElementById("lyrics-input");

  // Get the Clear button so we can erase the form and results
  const clearButton = document.getElementById("clear-btn");

  // Get the status message area so we can show helpful messages
  const statusMessage = document.getElementById("status-message");

  // Get each result field so we can update them after analysis
  const lineCount = document.getElementById("line-count");
  const nonEmptyLineCount = document.getElementById("non-empty-line-count");
  const wordCount = document.getElementById("word-count");
  const characterCount = document.getElementById("character-count");
  const characterCountNoSpaces = document.getElementById("character-count-no-spaces");
  const averageWordsPerLine = document.getElementById("average-words-per-line");
  const longestLineLength = document.getElementById("longest-line-length");
  const sectionCount = document.getElementById("section-count");

  // Get the areas used for extra detail output
  const sectionsEmpty = document.getElementById("sections-empty");
  const sectionsList = document.getElementById("sections-list");
  const longestLineText = document.getElementById("longest-line-text");

  // Create a helper function to reset the results back to zero/defaults
  function resetResults() {
    // Set all numeric result areas back to zero
    lineCount.textContent = "0";
    nonEmptyLineCount.textContent = "0";
    wordCount.textContent = "0";
    characterCount.textContent = "0";
    characterCountNoSpaces.textContent = "0";
    averageWordsPerLine.textContent = "0";
    longestLineLength.textContent = "0";
    sectionCount.textContent = "0";

    // Clear out any old list items from the detected sections list
    sectionsList.innerHTML = "";

    // Show the empty-state text again
    sectionsEmpty.style.display = "block";
    sectionsEmpty.textContent = "No sections detected yet.";

    // Reset the longest line display
    longestLineText.textContent = "Nothing analyzed yet.";

    // Reset the status message
    statusMessage.textContent = "Enter some lyrics and click Analyze.";
  }

  // Create a helper function that fills the page with analysis results
  function displayResults(data) {
    // Put the returned numbers into the correct result boxes
    lineCount.textContent = data.lineCount;
    nonEmptyLineCount.textContent = data.nonEmptyLineCount;
    wordCount.textContent = data.wordCount;
    characterCount.textContent = data.characterCount;
    characterCountNoSpaces.textContent = data.characterCountNoSpaces;
    averageWordsPerLine.textContent = data.averageWordsPerLine;
    longestLineLength.textContent = data.longestLineLength;
    sectionCount.textContent = data.sectionCount;

    // Show the longest line if one exists, otherwise show a fallback message
    if (data.longestLine && data.longestLine.trim() !== "") {
      longestLineText.textContent = data.longestLine;
    } else {
      longestLineText.textContent = "No longest line found yet.";
    }

    // Clear any old section items before adding new ones
    sectionsList.innerHTML = "";

    // If the server found section labels, show them in a list
    if (Array.isArray(data.detectedSections) && data.detectedSections.length > 0) {
      // Hide the empty-state message
      sectionsEmpty.style.display = "none";

      // Loop through each section label returned by the server
      data.detectedSections.forEach((section) => {
        // Create a new list item
        const listItem = document.createElement("li");

        // Put the section text into the list item
        listItem.textContent = section;

        // Add the list item to the unordered list on the page
        sectionsList.appendChild(listItem);
      });
    } else {
      // If no sections were found, show the empty-state message
      sectionsEmpty.style.display = "block";
      sectionsEmpty.textContent = "No section labels were detected.";
    }

    // Update the status message to show success
    statusMessage.textContent = "Analysis complete.";
  }

  // Listen for the form being submitted
  lyricsForm.addEventListener("submit", async (event) => {
    // Stop the browser from reloading the page when the form submits
    event.preventDefault();

    // Read the current text from the textarea
    const lyrics = lyricsInput.value;

    // If the textarea is empty or only spaces, show a message and stop
    if (!lyrics.trim()) {
      statusMessage.textContent = "Please enter some lyrics before analyzing.";
      resetResults();
      return;
    }

    // Let the user know the app is working
    statusMessage.textContent = "Analyzing lyrics...";

    try {
      // Send the lyrics text to our Express backend as JSON
      const response = await fetch("/api/analyze", {
        // Tell fetch we want to make a POST request
        method: "POST",

        // Tell the server we are sending JSON
        headers: {
          "Content-Type": "application/json"
        },

        // Convert our JavaScript object into a JSON string
        body: JSON.stringify({ lyrics })
      });

      // If the server response is not successful, throw an error
      if (!response.ok) {
        throw new Error(`Server returned ${response.status}`);
      }

      // Convert the JSON response from the server into a JavaScript object
      const data = await response.json();

      // Put the returned analysis data onto the page
      displayResults(data);
    } catch (error) {
      // If anything fails, show an error message to the user
      statusMessage.textContent = "Something went wrong while analyzing your lyrics.";

      // Write the actual error into the browser console for debugging
      console.error("Analysis error:", error);

      // Clear old results so the page does not show stale data
      resetResults();
    }
  });

  // Listen for clicks on the Clear button
  clearButton.addEventListener("click", () => {
    // Clear the textarea
    lyricsInput.value = "";

    // Reset all result areas
    resetResults();

    // Put the cursor back into the textarea for convenience
    lyricsInput.focus();
  });

  // Run the reset once when the page first loads
  resetResults();
});
