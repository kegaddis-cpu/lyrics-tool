const express = require("express");
const path = require("path");
const session = require("express-session");

const app = express();
const PORT = process.env.PORT || 3000;
const APP_PASSWORD = process.env.APP_PASSWORD || "changeme";
const SESSION_SECRET = process.env.SESSION_SECRET || "temporary-dev-secret-change-this";

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: false,
      httpOnly: true,
      sameSite: "lax",
      maxAge: 1000 * 60 * 60 * 12
    }
  })
);

app.use(express.static(path.join(__dirname, "public")));

function requireAuth(req, res, next) {
  if (req.session && req.session.isAuthenticated) {
    return next();
  }
  res.redirect("/login");
}

function analyzeLyrics(text) {
  const lines = text.split(/\r?\n/);
  const nonEmptyLines = lines.filter((line) => line.trim() !== "");
  const words = text.trim() === "" ? [] : text.trim().split(/\s+/);
  const characterCount = text.length;
  const characterCountNoSpaces = text.replace(/\s/g, "").length;

  const longestLine = lines.reduce((longest, current) => {
    return current.length > longest.length ? current : longest;
  }, "");

  const detectedSections = lines
    .map((line) => line.trim())
    .filter((line) =>
      /^(verse|chorus|bridge|hook|intro|outro|pre-chorus|post-chorus|refrain)(\s+\d+)?[:\-]?$/i.test(line)
    );

  const wordsPerLine = nonEmptyLines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed) return 0;
    return trimmed.split(/\s+/).length;
  });

  const totalWordsInNonEmptyLines = wordsPerLine.reduce((sum, count) => sum + count, 0);

  const averageWordsPerLine =
    nonEmptyLines.length > 0
      ? Number((totalWordsInNonEmptyLines / nonEmptyLines.length).toFixed(2))
      : 0;

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

app.get("/login", (req, res) => {
  if (req.session && req.session.isAuthenticated) {
    return res.redirect("/");
  }
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

app.post("/login", (req, res) => {
  const { password } = req.body;

  if (password === APP_PASSWORD) {
    req.session.isAuthenticated = true;
    return res.redirect("/");
  }

  res.redirect("/login?error=1");
});

app.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/login");
  });
});

app.get("/", requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.post("/api/analyze", requireAuth, (req, res) => {
  const { lyrics } = req.body;

  if (typeof lyrics !== "string") {
    return res.status(400).json({
      error: "Please send lyrics as text."
    });
  }

  const analysis = analyzeLyrics(lyrics);
  res.json(analysis);
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
