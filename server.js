// Bring in Express so we can create the web server
const express = require("express");

// Bring in Node's built-in path helper for safe file paths
const path = require("path");

// Bring in express-session so we can keep users logged in
const session = require("express-session");

// Create the Express app
const app = express();

// Use Render's provided port in production, or 3000 locally
const PORT = process.env.PORT || 3000;

// Read the shared app password from environment variables
const APP_PASSWORD = process.env.APP_PASSWORD || "changeme";

// Read the session secret from environment variables
const SESSION_SECRET = process.env.SESSION_SECRET || "temporary-dev-secret-change-this";

// Tell Express to read JSON bodies from fetch requests
app.use(express.json());

// Tell Express to read normal form submissions
app.use(express.urlencoded({ extended: true }));

// Enable session support
app.use(
  session({
    // Secret used to sign the session cookie
    secret: SESSION_SECRET,

    // Do not resave the session if it was not modified
    resave: false,

    // Do not create empty sessions for visitors who never log in
    saveUninitialized: false,

    // Cookie settings for the session
    cookie: {
      secure: false,
      httpOnly: true,
      sameSite: "lax",
      maxAge: 1000 * 60 * 60 * 12
    }
  })
);

// Serve static files from the public folder
app.use(express.static(path.join(__dirname, "public")));

// Middleware that protects routes behind login
function requireAuth(req, res, next) {
  // If the user is logged in, continue
  if (req.session && req.session.isAuthenticated) {
    return next();
  }

  // Otherwise send them to the login page
  res.redirect("/login");
}

// Helper that checks whether a line looks like a section heading
function parseSectionHeading(line) {
  // Remove extra spaces at the beginning and end
  const trimmed = line.trim();

  // Try to match common section names with an optional number
  // Examples this should catch:
  // Verse
  // Verse 1
  // Verse 2:
  // Chorus
  // Chorus:
  // Bridge -
  // Pre-Chorus 1
  const match = trimmed.match(
    /^(verse|chorus|bridge|hook|intro|outro|pre-chorus|post-chorus|refrain)(?:\s+(\d+))?\s*[:\-]?$/i
  );

  // If there is no match, return null
  if (!match) {
    return null;
  }

  // Pull out the section type, like "Verse" or "Chorus"
  const rawType = match[1];

  // Pull out the optional section number, like "1" or "2"
  const rawNumber = match[2];

  // Convert the section type to title case for cleaner display
  const type = rawType
    .toLowerCase()
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("-");

  // Build the display label
  const label = rawNumber ? `${type} ${rawNumber}` : type;

  // Return the parsed heading information
  return {
    type,
    number: rawNumber ? Number(rawNumber) : null,
    label
  };
}

// Helper that turns lyrics text into structured sections
function extractSections(text) {
  // Split the lyrics into separate lines
  const lines = text.split(/\r?\n/);

  // This will hold all parsed sections
  const sections = [];

  // Keep track of the section currently being built
  let currentSection = null;

  // Loop through each line in order
  for (const line of lines) {
    // See if this line is a section heading
    const heading = parseSectionHeading(line);

    // If it is a heading, start a new section
    if (heading) {
      // If there was already a current section, save it before starting a new one
      if (currentSection) {
        // Join the section body lines into one text block
        currentSection.content = currentSection.lines.join("\n").trim();

        // Save the finished section
        sections.push(currentSection);
      }

      // Create a new current section
      currentSection = {
        label: heading.label,
        type: heading.type,
        number: heading.number,
        lines: [],
        content: ""
      };

      // Move to the next line
      continue;
    }

    // If we have not seen a heading yet, create an unlabeled section
    if (!currentSection) {
      currentSection = {
        label: "Unlabeled",
        type: "Unlabeled",
        number: null,
        lines: [],
        content: ""
      };
    }

    // Add this line to the current section body
    currentSection.lines.push(line);
  }

  // After the loop ends, save the last open section if one exists
  if (currentSection) {
    currentSection.content = currentSection.lines.join("\n").trim();
    sections.push(currentSection);
  }

  // Return the finished sections, but remove the temporary "lines" array
  return sections.map((section, index) => ({
    id: index + 1,
    label: section.label,
    type: section.type,
    number: section.number,
    content: section.content
  }));
}

// Helper function that analyzes the lyrics text
function analyzeLyrics(text) {
  // Split the full text into lines
  const lines = text.split(/\r?\n/);

  // Keep only lines that contain real text
  const nonEmptyLines = lines.filter((line) => line.trim() !== "");

  // Split the full text into words
  const words = text.trim() === ""
    ? []
    : text.trim().split(/\s+/);

  // Count all characters including spaces
  const characterCount = text.length;

  // Count characters excluding spaces, tabs, and line breaks
  const characterCountNoSpaces = text.replace(/\s/g, "").length;

  // Find the longest single line
  const longestLine = lines.reduce((longest, current) => {
    return current.length > longest.length ? current : longest;
  }, "");

  // Find all lines that look like section labels
  const detectedSections = lines
    .map((line) => parseSectionHeading(line))
    .filter(Boolean)
    .map((section) => section.label);

  // Build structured sections from the text
  const parsedSections = extractSections(text);

  // Count words in each non-empty line
  const wordsPerLine = nonEmptyLines.map((line) => {
    const trimmed = line.trim();

    // Return 0 if the line is somehow empty
    if (!trimmed) return 0;

    // Otherwise count the words in the line
    return trimmed.split(/\s+/).length;
  });

  // Add up the words across all non-empty lines
  const totalWordsInNonEmptyLines = wordsPerLine.reduce((sum, count) => sum + count, 0);

  // Calculate the average words per non-empty line
  const averageWordsPerLine =
    nonEmptyLines.length > 0
      ? Number((totalWordsInNonEmptyLines / nonEmptyLines.length).toFixed(2))
      : 0;

  // Return all analysis data
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
    detectedSections,
    parsedSections
  };
}

// Show the login page
app.get("/login", (req, res) => {
  // If already logged in, send the user into the app
  if (req.session && req.session.isAuthenticated) {
    return res.redirect("/");
  }

  // Otherwise send the login page
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

// Handle login form submission
app.post("/login", (req, res) => {
  // Read the submitted password
  const { password } = req.body;

  // If the password is correct, mark the session as logged in
  if (password === APP_PASSWORD) {
    req.session.isAuthenticated = true;
    return res.redirect("/");
  }

  // If the password is wrong, send the user back to login with an error flag
  res.redirect("/login?error=1");
});

// Handle logout
app.get("/logout", (req, res) => {
  // Destroy the current session
  req.session.destroy(() => {
    // Send the user back to the login page
    res.redirect("/login");
  });
});

// Protect the main app page
app.get("/", requireAuth, (req, res) => {
  // Send the main tool page
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Protect the lyrics analysis API route
app.post("/api/analyze", requireAuth, (req, res) => {
  // Pull the lyrics value from the JSON body
  const { lyrics } = req.body;

  // Make sure lyrics were provided as text
  if (typeof lyrics !== "string") {
    return res.status(400).json({
      error: "Please send lyrics as text."
    });
  }

  // Analyze the lyrics
  const analysis = analyzeLyrics(lyrics);

  // Send the result back as JSON
  res.json(analysis);
});

// Start the server
app.listen(PORT, () => {
  // Log a startup message
  console.log(`Server running on port ${PORT}`);
});
