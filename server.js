// === START: server.js ===

const path = require("path");
const express = require("express");
const session = require("express-session");
const { createClient } = require("redis");
const { RedisStore } = require("connect-redis");
const mysql = require("mysql2/promise");
const bcrypt = require("bcryptjs");

const app = express();
const PORT = process.env.PORT || 3000;

app.set("trust proxy", 1);
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

const redisClient = createClient({ url: process.env.REDIS_URL });
redisClient.on("error", (err) => console.error("Redis client error:", err));
redisClient.connect().catch(console.error);

const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

app.use(
  session({
    store: new RedisStore({ client: redisClient, prefix: "lyrics-helper:" }),
    name: "lyrics.sid",
    secret: process.env.SESSION_SECRET || "change-this-secret-in-production",
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 1000 * 60 * 60 * 24 * 7
    }
  })
);

function requireAuth(req, res, next) {
  if (req.session && req.session.user) return next();
  return res.redirect("/login");
}

function countWords(text) {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

function normalizeSectionLabel(line) {
  const trimmed = line.trim();
  if (!trimmed) return null;
  const bracketMatch = trimmed.match(/^\[(.+)\]$/);
  if (bracketMatch) return bracketMatch[1].trim();
  const plainSectionMatch = trimmed.match(
    /^(verse|chorus|pre-chorus|post-chorus|bridge|outro|intro|hook|refrain)(\s*\d+)?$/i
  );
  if (plainSectionMatch) return trimmed;
  return null;
}

function detectSections(lines) {
  const matches = [];
  lines.forEach((line) => {
    const label = normalizeSectionLabel(line);
    if (label) matches.push(label);
  });
  return matches;
}

function parseSections(lines) {
  const sections = [];
  let currentLabel = "Unlabeled";
  let currentLines = [];
  let idCounter = 1;

  function pushSection() {
    const content = currentLines.join("\n").trim();
    if (!content) { currentLines = []; return; }
    sections.push({ id: String(idCounter++), label: currentLabel, content });
    currentLines = [];
  }

  for (const line of lines) {
    const label = normalizeSectionLabel(line);
    if (label) { pushSection(); currentLabel = label; }
    else currentLines.push(line);
  }
  pushSection();
  return sections;
}

function findLongestLine(lines) {
  let longest = "";
  for (const line of lines) {
    if (line.trim().length > longest.trim().length) longest = line;
  }
  return longest;
}

// --- Auth routes ---

app.get("/register", (req, res) => {
  if (req.session && req.session.user) return res.redirect("/");
  res.render("register", { error: null });
});

app.post("/register", async (req, res, next) => {
  const { username, email, password, confirmPassword } = req.body;
  if (!username || !email || !password) {
    return res.status(400).render("register", { error: "All fields are required." });
  }
  if (password !== confirmPassword) {
    return res.status(400).render("register", { error: "Passwords do not match." });
  }
  if (password.length < 8) {
    return res.status(400).render("register", { error: "Password must be at least 8 characters." });
  }
  try {
    const [existing] = await db.query(
      "SELECT id FROM users WHERE username = ? OR email = ? LIMIT 1",
      [username, email]
    );
    if (existing.length > 0) {
      return res.status(400).render("register", { error: "Username or email is already taken." });
    }
    const passwordHash = await bcrypt.hash(password, 12);
    await db.query(
      "INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)",
      [username, email, passwordHash]
    );
    return res.redirect("/login?registered=1");
  } catch (err) {
    console.error("Register error:", err);
    return next(err);
  }
});

app.get("/login", (req, res) => {
  if (req.session && req.session.user) return res.redirect("/");
  const registered = req.query.registered === "1";
  res.render("login", { error: null, registered });
});

app.post("/login", async (req, res, next) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).render("login", { error: "Username and password are required.", registered: false });
  }
  try {
    const [rows] = await db.query(
      "SELECT id, username, password_hash FROM users WHERE username = ? LIMIT 1",
      [username]
    );
    if (rows.length === 0) {
      return res.status(401).render("login", { error: "Invalid username or password.", registered: false });
    }
    const user = rows[0];
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).render("login", { error: "Invalid username or password.", registered: false });
    }
    req.session.regenerate((err) => {
      if (err) return next(err);
      req.session.user = { id: user.id, username: user.username };
      req.session.save((saveErr) => {
        if (saveErr) return next(saveErr);
        return res.redirect("/");
      });
    });
  } catch (err) {
    console.error("Login error:", err);
    return next(err);
  }
});

app.post("/logout", (req, res, next) => {
  if (!req.session) return res.redirect("/login");
  req.session.destroy((err) => {
    if (err) return next(err);
    res.clearCookie("lyrics.sid");
    return res.redirect("/login");
  });
});

// --- App routes ---

app.get("/", requireAuth, (req, res) => {
  res.render("index", { username: req.session.user.username });
});

// --- Draft routes ---

app.get("/api/draft", requireAuth, (req, res) => {
  return res.json({ lyrics: req.session.draftLyrics || "" });
});

app.post("/api/draft", requireAuth, (req, res) => {
  const lyrics = typeof req.body.lyrics === "string" ? req.body.lyrics : "";
  req.session.draftLyrics = lyrics;
  return res.json({ success: true, savedAt: new Date().toISOString() });
});

app.delete("/api/draft", requireAuth, (req, res) => {
  req.session.draftLyrics = "";
  return res.json({ success: true });
});

// --- Analyze ---

app.post("/api/analyze", requireAuth, (req, res) => {
  const lyrics = req.body.lyrics || "";
  req.session.draftLyrics = lyrics;
  const rawLines = lyrics.split("\n");
  const nonEmptyLines = rawLines.filter((line) => line.trim() !== "");
  const detectedSections = detectSections(rawLines);
  const parsedSections = parseSections(rawLines);
  const totalWords = countWords(lyrics);
  const avgWords =
    nonEmptyLines.length > 0 ? (totalWords / nonEmptyLines.length).toFixed(1) : "0";
  res.json({
    lineCount: nonEmptyLines.length,
    wordCount: totalWords,
    averageWordsPerLine: avgWords,
    sectionCount: detectedSections.length,
    detectedSections,
    parsedSections,
    longestLine: findLongestLine(rawLines)
  });
});

// --- Word tools ---

app.get("/api/word-tools/rhymes", requireAuth, (req, res) => {
  const word = (req.query.word || "").toString().trim();
  if (!word) return res.json({ word: "", results: [] });
  const fallbackRhymes = [
    `${word} time`, `${word} light`, `${word} fire`, `${word} sky`, `${word} way`
  ];
  return res.json({ word, results: fallbackRhymes });
});

app.get("/api/word-tools/syllables", requireAuth, (req, res) => {
  const text = (req.query.word || "").toString().trim();
  if (!text) return res.json({ text: "", syllables: 0 });
  const parts = text.toLowerCase().match(/[aeiouy]+/g);
  const syllables = parts ? parts.length : 1;
  return res.json({ text, syllables });
});

app.get("/api/word-tools/random", requireAuth, (req, res) => {
  const topic = (req.query.topic || "").toString().trim();
  const mode = (req.query.mode || "word").toString();
  const randomWords = ["midnight", "echo", "shadow", "ember", "velvet"];
  const randomPhrases = [
    "running through the silence",
    "ghost light on the avenue",
    "holding onto broken time",
    "dancing with the static",
    "fire underneath the rain"
  ];
  const pool = mode === "phrase" ? randomPhrases : randomWords;
  const result = pool[Math.floor(Math.random() * pool.length)];
  return res.json({ mode, topic, result });
});

// --- DB test ---

app.get("/api/db-test", requireAuth, async (req, res) => {
  try {
    const [rows] = await db.query("SELECT 1 + 1 AS result");
    return res.json({ ok: true, result: rows[0].result });
  } catch (err) {
    console.error("DB test error:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// --- Error handlers ---

app.use((req, res) => {
  res.status(404).send("Page not found.");
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).send("Internal server error.");
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// === END: server.js ===
