const express = require("express");
const path = require("path");
const mysql = require("mysql2/promise");

const app = express();

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const pool = mysql.createPool({
  host: process.env.DB_HOST || "127.0.0.1",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "lyrics_helper",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

async function initDatabase() {
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS songs (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT,
      title VARCHAR(255) NOT NULL,
      lyrics MEDIUMTEXT NULL,
      is_public TINYINT(1) NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      INDEX idx_updated_at (updated_at),
      INDEX idx_is_public (is_public)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

function normalizeBoolean(value) {
  if (value === true || value === 1 || value === "1" || value === "true" || value === "on") {
    return 1;
  }
  return 0;
}

function validateSongId(idParam) {
  const songId = Number(idParam);
  if (!Number.isInteger(songId) || songId <= 0) {
    return null;
  }
  return songId;
}

app.get("/", (req, res) => {
  res.render("index", {
    username: "MonkeyMan",
    pageVersion: "INDEX_V6_FULL_UI",
    railWidth: "72px"
  });
});

app.post("/logout", (req, res) => {
  res.redirect("/");
});

app.get("/api/songs", async (req, res, next) => {
  try {
    const [rows] = await pool.execute(
      `
      SELECT id, title, lyrics, is_public, created_at, updated_at
      FROM songs
      ORDER BY updated_at DESC, id DESC
      `
    );

    res.json({ songs: rows });
  } catch (error) {
    next(error);
  }
});

app.get("/api/songs/:id", async (req, res, next) => {
  try {
    const songId = validateSongId(req.params.id);

    if (!songId) {
      return res.status(400).json({ error: "Invalid song id." });
    }

    const [rows] = await pool.execute(
      `
      SELECT id, title, lyrics, is_public, created_at, updated_at
      FROM songs
      WHERE id = ?
      LIMIT 1
      `,
      [songId]
    );

    if (!rows.length) {
      return res.status(404).json({ error: "Song not found." });
    }

    res.json({ song: rows[0] });
  } catch (error) {
    next(error);
  }
});

app.post("/api/songs", async (req, res, next) => {
  try {
    const title = String(req.body.title || "").trim();
    const lyrics = String(req.body.lyrics || "");
    const isPublic = normalizeBoolean(req.body.is_public);

    if (!title) {
      return res.status(400).json({ error: "Title is required." });
    }

    const [result] = await pool.execute(
      `
      INSERT INTO songs (title, lyrics, is_public)
      VALUES (?, ?, ?)
      `,
      [title, lyrics, isPublic]
    );

    const [rows] = await pool.execute(
      `
      SELECT id, title, lyrics, is_public, created_at, updated_at
      FROM songs
      WHERE id = ?
      LIMIT 1
      `,
      [result.insertId]
    );

    res.status(201).json({
      message: "Song created.",
      songId: result.insertId,
      song: rows[0]
    });
  } catch (error) {
    next(error);
  }
});

app.put("/api/songs/:id", async (req, res, next) => {
  try {
    const songId = validateSongId(req.params.id);
    const title = String(req.body.title || "").trim();
    const lyrics = String(req.body.lyrics || "");
    const isPublic = normalizeBoolean(req.body.is_public);

    if (!songId) {
      return res.status(400).json({ error: "Invalid song id." });
    }

    if (!title) {
      return res.status(400).json({ error: "Title is required." });
    }

    const [result] = await pool.execute(
      `
      UPDATE songs
      SET title = ?, lyrics = ?, is_public = ?
      WHERE id = ?
      `,
      [title, lyrics, isPublic, songId]
    );

    if (!result.affectedRows) {
      return res.status(404).json({ error: "Song not found." });
    }

    const [rows] = await pool.execute(
      `
      SELECT id, title, lyrics, is_public, created_at, updated_at
      FROM songs
      WHERE id = ?
      LIMIT 1
      `,
      [songId]
    );

    res.json({
      message: "Song updated.",
      songId,
      song: rows[0]
    });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/songs/:id", async (req, res, next) => {
  try {
    const songId = validateSongId(req.params.id);

    if (!songId) {
      return res.status(400).json({ error: "Invalid song id." });
    }

    const [rows] = await pool.execute(
      `
      SELECT id, title, lyrics, is_public, created_at, updated_at
      FROM songs
      WHERE id = ?
      LIMIT 1
      `,
      [songId]
    );

    if (!rows.length) {
      return res.status(404).json({ error: "Song not found." });
    }

    await pool.execute(
      `
      DELETE FROM songs
      WHERE id = ?
      `,
      [songId]
    );

    res.json({
      message: "Song deleted.",
      song: rows[0]
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/analyze", (req, res) => {
  const lyrics = String(req.body.lyrics || "");
  const trimmed = lyrics.trim();

  const lines = trimmed ? trimmed.split(/\r?\n/).filter((line) => line.trim()) : [];
  const words = trimmed ? trimmed.match(/\b[\w']+\b/g) || [] : [];

  const sectionRegex = /^\s*\[(verse|chorus|pre-chorus|pre chorus|bridge|hook|intro|outro)(?:\s+\d+)?\]\s*$/i;
  const detectedSections = lines
    .filter((line) => sectionRegex.test(line))
    .map((line) => line.replace(/[\[\]]/g, "").trim());

  let longestLine = "";
  for (const line of lines) {
    if (line.length > longestLine.length && !sectionRegex.test(line)) {
      longestLine = line;
    }
  }

  const averageWordsPerLine = lines.length ? (words.length / lines.length).toFixed(1) : "0.0";

  res.json({
    lineCount: lines.length,
    wordCount: words.length,
    averageWordsPerLine,
    sectionCount: detectedSections.length,
    detectedSections,
    longestLine
  });
});

app.get("/api/word-tools/rhymes", (req, res) => {
  const word = String(req.query.word || "").toLowerCase().trim();

  const rhymeMap = {
    here: ["fear", "dear", "near", "clear", "year", "tear"],
    night: ["light", "bright", "sight", "flight", "might", "white"],
    fire: ["desire", "higher", "wire", "choir", "liar", "spire"],
    pain: ["rain", "train", "chain", "vein", "gain", "again"],
    heart: ["start", "part", "art", "chart", "smart"],
    dream: ["beam", "gleam", "scheme", "stream", "theme"]
  };

  res.json({
    results: (rhymeMap[word] || []).map((item) => ({ word: item }))
  });
});

app.get("/api/word-tools/random", (req, res) => {
  const words = ["midnight", "echo", "shadow", "ember", "velvet", "neon", "fever", "wildfire"];
  const randomWord = words[Math.floor(Math.random() * words.length)];

  res.json({ result: randomWord });
});

app.use((req, res) => {
  if (req.path.startsWith("/api/")) {
    return res.status(404).json({ error: "Route not found." });
  }

  res.status(404).send("Not found");
});

app.use((err, req, res, next) => {
  console.error(err);

  if (req.path.startsWith("/api/")) {
    return res.status(500).json({
      error: "Server error.",
      details: err.message
    });
  }

  res.status(500).send("Server error");
});

const PORT = process.env.PORT || 3000;

initDatabase()
  .then(async () => {
    await pool.execute("SELECT 1");
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch((error) => {
    console.error("Failed to start server:", error);
    process.exit(1);
  });
