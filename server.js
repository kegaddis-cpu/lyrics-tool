const express = require("express");
const session = require("express-session");
const path = require("path");
const mysql = require("mysql2/promise");

const app = express();
const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === "production";

if (isProduction) {
  app.set("trust proxy", 1);
}

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
      secure: isProduction,
      httpOnly: true,
      sameSite: "lax"
    }
  })
);

const db = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

let songsTableReady = false;

async function ensureSongsTable() {
  if (songsTableReady) return;

  await db.query(`
    CREATE TABLE IF NOT EXISTS songs (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      username VARCHAR(255) NOT NULL,
      title VARCHAR(255) NOT NULL,
      lyrics LONGTEXT,
      is_public TINYINT(1) NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  songsTableReady = true;
}

app.use(async (req, res, next) => {
  try {
    await ensureSongsTable();

    if (!req.session.username) {
      req.session.username = "MonkeyMan";
    }

    next();
  } catch (error) {
    console.error("Startup middleware error:", error);
    res.status(500).send("Database setup failed.");
  }
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

app.get("/api/songs", async (req, res) => {
  try {
    const username = req.session.username;

    const [rows] = await db.query(
      `
      SELECT id, title, lyrics, is_public
      FROM songs
      WHERE username = ?
      ORDER BY updated_at DESC, id DESC
      `,
      [username]
    );

    res.json({ songs: rows });
  } catch (error) {
    console.error("GET /api/songs error:", error);
    res.status(500).json({ error: "Failed to load songs." });
  }
});

app.get("/api/songs/:id", async (req, res) => {
  try {
    const songId = Number(req.params.id);
    const username = req.session.username;

    if (!Number.isFinite(songId)) {
      return res.status(400).json({ error: "Invalid song id." });
    }

    const [rows] = await db.query(
      `
      SELECT id, title, lyrics, is_public
      FROM songs
      WHERE id = ? AND username = ?
      LIMIT 1
      `,
      [songId, username]
    );

    if (!rows.length) {
      return res.status(404).json({ error: "Song not found." });
    }

    return res.json({ song: rows[0] });
  } catch (error) {
    console.error("GET /api/songs/:id error:", error);
    return res.status(500).json({ error: "Failed to load song." });
  }
});

app.post("/api/songs", async (req, res) => {
  try {
    const username = req.session.username;
    const title = String(req.body.title || "").trim();
    const lyrics = String(req.body.lyrics || "");
    const isPublic = req.body.is_public ? 1 : 0;

    if (!title) {
      return res.status(400).json({ error: "Title is required." });
    }

    const [result] = await db.query(
      `
      INSERT INTO songs (username, title, lyrics, is_public)
      VALUES (?, ?, ?, ?)
      `,
      [username, title, lyrics, isPublic]
    );

    return res.json({
      message: "Song saved successfully.",
      songId: result.insertId
    });
  } catch (error) {
    console.error("POST /api/songs error:", error);
    return res.status(500).json({ error: "Failed to save song." });
  }
});

app.put("/api/songs/:id", async (req, res) => {
  try {
    const songId = Number(req.params.id);
    const username = req.session.username;
    const title = String(req.body.title || "").trim();
    const lyrics = String(req.body.lyrics || "");
    const isPublic = req.body.is_public ? 1 : 0;

    if (!Number.isFinite(songId)) {
      return res.status(400).json({ error: "Invalid song id." });
    }

    if (!title) {
      return res.status(400).json({ error: "Title is required." });
    }

    const [result] = await db.query(
      `
      UPDATE songs
      SET title = ?, lyrics = ?, is_public = ?
      WHERE id = ? AND username = ?
      `,
      [title, lyrics, isPublic, songId, username]
    );

    if (!result.affectedRows) {
      return res.status(404).json({ error: "Song not found." });
    }

    return res.json({
      message: "Song updated successfully.",
      songId
    });
  } catch (error) {
    console.error("PUT /api/songs/:id error:", error);
    return res.status(500).json({ error: "Failed to update song." });
  }
});

app.delete("/api/songs/:id", async (req, res) => {
  try {
    const songId = Number(req.params.id);
    const username = req.session.username;

    if (!Number.isFinite(songId)) {
      return res.status(400).json({ error: "Invalid song id." });
    }

    const [result] = await db.query(
      `
      DELETE FROM songs
      WHERE id = ? AND username = ?
      `,
      [songId, username]
    );

    if (!result.affectedRows) {
      return res.status(404).json({ error: "Song not found." });
    }

    return res.json({
      message: "Song deleted successfully."
    });
  } catch (error) {
    console.error("DELETE /api/songs/:id error:", error);
    return res.status(500).json({ error: "Failed to delete song." });
  }
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
  const sectionMatches =
    lyrics.match(/^\[(verse|chorus|pre-chorus|pre chorus|bridge|hook|intro|outro)[^\n]*\]$/gim) || [];

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
