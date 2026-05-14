const express = require("express");
const session = require("express-session");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(
  session({
    secret: process.env.SESSION_SECRET || "lyrics-helper-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: false,
      httpOnly: true,
      sameSite: "lax"
    }
  })
);

// In-memory data store
let songs = [];
let nextSongId = 1;

// Demo auth/session bootstrap
app.use((req, res, next) => {
  if (!req.session.username) {
    req.session.username = "MonkeyMan";
  }
  next();
});

app.get("/", (req, res) => {
  res.render("index", {
    username: req.session.username,
    pageVersion: "INDEX_V6_FULL_UI",
    railWidth: "72px"
  });
});

app.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/");
  });
});

app.get("/api/songs", (req, res) => {
  res.json({ songs });
});

app.get("/api/songs/:id", (req, res) => {
  const songId = Number(req.params.id);
  const song = songs.find((item) => item.id === songId);

  if (!song) {
    return res.status(404).json({ error: "Song not found." });
  }

  return res.json({ song });
});

app.post("/api/songs", (req, res) => {
  const title = String(req.body.title || "").trim();
  const lyrics = String(req.body.lyrics || "");
  const isPublic = !!req.body.is_public;

  if (!title) {
    return res.status(400).json({ error: "Title is required." });
  }

  const newSong = {
    id: nextSongId++,
    title,
    lyrics,
    is_public: isPublic
  };

  songs.unshift(newSong);

  return res.json({
    message: "Song saved successfully.",
    songId: newSong.id
  });
});

app.put("/api/songs/:id", (req, res) => {
  const songId = Number(req.params.id);
  const song = songs.find((item) => item.id === songId);

  if (!song) {
    return res.status(404).json({ error: "Song not found." });
  }

  const title = String(req.body.title || "").trim();
  const lyrics = String(req.body.lyrics || "");
  const isPublic = !!req.body.is_public;

  if (!title) {
    return res.status(400).json({ error: "Title is required." });
  }

  song.title = title;
  song.lyrics = lyrics;
  song.is_public = isPublic;

  return res.json({
    message: "Song updated successfully.",
    songId: song.id
  });
});

app.delete("/api/songs/:id", (req, res) => {
  const songId = Number(req.params.id);
  const existingIndex = songs.findIndex((item) => item.id === songId);

  if (existingIndex === -1) {
    return res.status(404).json({ error: "Song not found." });
  }

  songs.splice(existingIndex, 1);

  return res.json({
    message: "Song deleted successfully."
  });
});

app.post("/api/analyze", (req, res) => {
  const lyrics = String(req.body.lyrics || "");
  const lines = lyrics
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const words = lyrics.match(/[A-Za-z']+/g) || [];
  const averageWordsPerLine = lines.length
    ? (words.length / lines.length).toFixed(1)
    : "0.0";

  const detectedSections = [];
  const sectionMatches = lyrics.match(/^(verse|chorus|bridge|hook|intro|outro)[^\n]*$/gim) || [];

  sectionMatches.forEach((section) => {
    const normalized = section.trim();
    if (!detectedSections.includes(normalized)) {
      detectedSections.push(normalized);
    }
  });

  let longestLine = "";
  for (const line of lines) {
    if (line.length > longestLine.length) {
      longestLine = line;
    }
  }

  return res.json({
    lineCount: lines.length,
    wordCount: words.length,
    averageWordsPerLine,
    sectionCount: detectedSections.length,
    detectedSections,
    longestLine
  });
});

app.get("/api/word-tools/rhymes", async (req, res) => {
  try {
    const rawWord = String(req.query.word || "").trim().toLowerCase();
    const word = rawWord.replace(/[^a-z']/g, "");

    if (!word) {
      return res.status(400).json({
        error: "A word is required."
      });
    }

    const perfectUrl = `https://api.datamuse.com/words?rel_rhy=${encodeURIComponent(word)}&max=12`;
    const nearUrl = `https://api.datamuse.com/words?rel_nry=${encodeURIComponent(word)}&max=8`;

    const [perfectResponse, nearResponse] = await Promise.all([
      fetch(perfectUrl),
      fetch(nearUrl)
    ]);

    if (!perfectResponse.ok || !nearResponse.ok) {
      return res.status(502).json({
        error: "Could not fetch rhyme suggestions."
      });
    }

    const perfectData = await perfectResponse.json();
    const nearData = await nearResponse.json();

    const combined = [...perfectData, ...nearData]
      .map((item) => (item && item.word ? String(item.word).trim().toLowerCase() : ""))
      .filter((item) => item && /^[a-z']+$/.test(item))
      .filter((item) => item !== word);

    const uniqueResults = [...new Set(combined)].slice(0, 16);

    return res.json({
      word,
      results: uniqueResults
    });
  } catch (error) {
    console.error("Rhyming API error:", error);
    return res.status(500).json({
      error: "Server error while fetching rhymes."
    });
  }
});

app.get("/api/word-tools/random", async (req, res) => {
  try {
    const fallbackWords = ["midnight", "echo", "shadow", "ember", "velvet"];
    const randomWord = fallbackWords[Math.floor(Math.random() * fallbackWords.length)];

    return res.json({
      result: randomWord
    });
  } catch (error) {
    return res.status(500).json({
      error: "Could not fetch a random word."
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
