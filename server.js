// Bring in the Express library so we can create a web server
const express = require("express");

// Bring in Node's built-in path tool so we can safely build file paths
const path = require("path");

// Create the Express application
const app = express();

// Use the port Render gives us when deployed,
// or use port 3000 when running locally on your computer
const PORT = process.env.PORT || 3000;

// Tell Express to automatically read JSON data
// that comes in from the browser in POST requests
app.use(express.json());

// Tell Express to serve any files inside the "public" folder
// This is how the browser can load index.html, style.css, script.js, images, etc.
app.use(express.static(path.join(__dirname, "public")));

// Create a helper function to analyze the lyrics text
function analyzeLyrics(text) {
  // Split the text into lines wherever there is a new line
  const lines = text.split(/\r?\n/);

  // Remove empty lines for stats that should only count real content
  const nonEmptyLines = lines.filter((line) => line.trim() !== "");

  // Split text into words using whitespace, then remove empty results
  const words = text.trim() === ""
    ? []
    : text.trim().split(/\s+/);

  // Count all characters, including spaces and line breaks
  const characterCount = text.length;

  // Count only characters that are not spaces, tabs, or line breaks
  const characterCountNoSpaces = text.replace(/\s/g, "").length;

  // Find the longest line in the text
  const longestLine = lines.reduce((longest, current) => {
    return current.length > longest.length ? current : longest;
  }, "");

  // Look for section labels like Verse, Chorus, Bridge, Hook, Outro, etc.
  const detectedSections = lines
    .map((line) => line.trim())
    .filter((line) =>
      /^(verse|chorus|bridge|hook|intro|outro|pre-chorus|post-chorus|refrain)(\s+\d+)?[:\-]?$/i.test(line)
    );

  // Count words per non-empty line so we can calculate an average
  const wordsPerLine = nonEmptyLines.map((line) => {
    const trimmed = line.trim();

    // If somehow the line is empty, return 0
    if (!trimmed) return 0;

    // Split the line into words and count them
    return trimmed.split(/\s+/).length;
  });

  // Add up all words-per-line values
  const totalWordsInNonEmptyLines = wordsPerLine.reduce((sum, count) => sum + count, 0);

  // Avoid dividing by zero if there are no non-empty lines
  const averageWordsPerLine =
    nonEmptyLines.length > 0
      ? Number((totalWordsInNonEmptyLines / nonEmptyLines.length).toFixed(2))
      : 0;

  // Send all analysis results back as one object
  return {
    lineCount: lines.length,
    nonEmptyLineCount: nonEmptyLines.length,
    wordCount: words.length,
    characterCount,
    characterCountNoSpaces,
    longestLine,
    longestLineLength: longestLine.length,
    averageWordsPerLine,
    sectionCount: detectedSections.length,
    detectedSections
  };
}

// Create a POST API route that the browser can call to analyze lyrics
app.post("/api/analyze", (req, res) => {
  // Pull the lyrics text out of the JSON body sent from the browser
  const { lyrics } = req.body;

  // If the browser did not send a string, return a 400 error
  if (typeof lyrics !== "string") {
    return res.status(400).json({
      error: "Please send lyrics as text."
    });
  }

  // Run the analysis
  const analysis = analyzeLyrics(lyrics);

  // Send the analysis results back to the browser as JSON
  res.json(analysis);
});

// Create a route for the homepage
// This sends back public/index.html when someone visits the site root
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Start the server and listen for incoming requests
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
