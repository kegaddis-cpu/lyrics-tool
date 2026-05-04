const express = require("express");
const path = require("path");
const session = require("express-session");
const { createClient } = require("redis");
const { RedisStore } = require("connect-redis");

const app = express();
const PORT = process.env.PORT || 3000;

const APP_PASSWORD = process.env.APP_PASSWORD || "changeme123";
const SESSION_SECRET = process.env.SESSION_SECRET || "replace-this-session-secret";
const REDIS_URL = process.env.REDIS_URL;

const redisClient = createClient({
  url: REDIS_URL
});

redisClient.on("error", (err) => {
  console.error("Redis error:", err);
});

function normalizeText(value) {
  return (value || "").trim().toLowerCase();
}

async function fetchDatamuse(params) {
  const url = new URL("https://api.datamuse.com/words");

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, value);
    }
  });

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Datamuse error: ${response.status}`);
  }

  return response.json();
}

async function startServer() {
  if (!REDIS_URL) {
    throw new Error("Missing REDIS_URL environment variable");
  }

  await redisClient.connect();

  app.set("trust proxy", 1);

  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));

  app.use(
    session({
      store: new RedisStore({
        client: redisClient,
        prefix: "lyrics_tool:"
      }),
      name: "lyrics_tool_session",
      secret: SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      proxy: true,
      cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: 1000 * 60 * 60 * 12
      }
    })
  );

  function requireAuth(req, res, next) {
    if (req.session && req.session.authenticated) {
      return next();
    }
    return res.redirect("/login");
  }

  function requireApiAuth(req, res, next) {
    if (req.session && req.session.authenticated) {
      return next();
    }
    return res.status(401).json({ error: "Authentication required" });
  }

  app.use(express.static(path.join(__dirname, "public")));

  app.get("/login", (req, res) => {
    if (req.session && req.session.authenticated) {
      return res.redirect("/");
    }

    res.sendFile(path.join(__dirname, "public", "login.html"));
  });

  app.post("/login", (req, res, next) => {
    const password = (req.body.password || "").trim();

    if (password !== APP_PASSWORD) {
      return res.redirect("/login?error=1");
    }

    req.session.regenerate((err) => {
      if (err) {
        return next(err);
      }

      req.session.authenticated = true;

      req.session.save((saveErr) => {
        if (saveErr) {
          return next(saveErr);
        }

        return res.redirect("/");
      });
    });
  });

  app.post("/logout", (req, res, next) => {
    req.session.destroy((err) => {
      if (err) {
        return next(err);
      }

      res.clearCookie("lyrics_tool_session");
      return res.redirect("/login");
    });
  });

  app.post("/api/analyze", requireApiAuth, (req, res) => {
    const lyrics = req.body.lyrics || "";

    const lines = lyrics.split(/\r?\n/);
    const nonEmptyLines = lines.filter((line) => line.trim() !== "");
    const words = lyrics.trim() ? lyrics.trim().split(/\s+/) : [];

    const sectionPattern = /^(verse|chorus|pre-chorus|bridge|outro|intro)(.*)?$/i;
    const detectedSections = [];
    const parsedSections = [];

    let currentSection = null;
    let unlabeledBuffer = [];

    lines.forEach((line) => {
      const trimmed = line.trim();
      const isSectionLabel = sectionPattern.test(trimmed);

      if (isSectionLabel) {
        if (currentSection) {
          parsedSections.push(currentSection);
        } else if (unlabeledBuffer.length > 0) {
          parsedSections.push({
            id: `section-${parsedSections.length + 1}`,
            label: "Unlabeled",
            content: unlabeledBuffer.join("\n").trim()
          });
          unlabeledBuffer = [];
        }

        detectedSections.push(trimmed);

        currentSection = {
          id: `section-${parsedSections.length + 1}`,
          label: trimmed,
          content: ""
        };
      } else {
        if (currentSection) {
          currentSection.content += (currentSection.content ? "\n" : "") + line;
        } else {
          unlabeledBuffer.push(line);
        }
      }
    });

    if (currentSection) {
      parsedSections.push(currentSection);
    } else if (unlabeledBuffer.length > 0) {
      parsedSections.push({
        id: `section-${parsedSections.length + 1}`,
        label: "Unlabeled",
        content: unlabeledBuffer.join("\n").trim()
      });
    }

    const longestLine = lines.reduce((longest, line) => {
      return line.length > longest.length ? line : longest;
    }, "");

    res.json({
      lineCount: lines.length,
      wordCount: words.length,
      averageWordsPerLine:
        nonEmptyLines.length > 0 ? (words.length / nonEmptyLines.length).toFixed(2) : "0",
      sectionCount: parsedSections.length,
      detectedSections,
      parsedSections,
      longestLine
    });
  });

  app.get("/api/word-tools/rhymes", requireApiAuth, async (req, res) => {
    try {
      const word = normalizeText(req.query.word);

      if (!word) {
        return res.status(400).json({ error: "Word is required" });
      }

      const data = await fetchDatamuse({
        rel_rhy: word,
        max: 16
      });

      return res.json({
        word,
        results: data.map((item) => item.word)
      });
    } catch (error) {
      console.error("Rhymes error:", error);
      return res.status(500).json({ error: "Failed to fetch rhymes" });
    }
  });

  app.get("/api/word-tools/syllables", requireApiAuth, async (req, res) => {
    try {
      const text = normalizeText(req.query.word);

      if (!text) {
        return res.status(400).json({ error: "Word or phrase is required" });
      }

      const data = await fetchDatamuse({
        sp: text,
        md: "s",
        max: 1
      });

      const match = Array.isArray(data) && data.length > 0 ? data[0] : null;

      return res.json({
        text,
        syllables: match && typeof match.numSyllables === "number" ? match.numSyllables : null
      });
    } catch (error) {
      console.error("Syllables error:", error);
      return res.status(500).json({ error: "Failed to fetch syllables" });
    }
  });

  app.get("/api/word-tools/random", requireApiAuth, async (req, res) => {
    try {
      const topic = normalizeText(req.query.topic);
      const mode = normalizeText(req.query.mode) || "phrase";

      const params = {
        max: 40
      };

      if (topic) {
        params.ml = topic;
      } else {
        const seeds = ["love", "night", "dream", "fire", "heart", "rain", "road", "light"];
        params.ml = seeds[Math.floor(Math.random() * seeds.length)];
      }

      const data = await fetchDatamuse(params);

      let results = data.filter((item) => item.word);

      if (mode === "word") {
        results = results.filter((item) => !item.word.includes(" "));
      }

      if (mode === "phrase") {
        const multi = results.filter((item) => item.word.includes(" "));
        if (multi.length > 0) {
          results = multi;
        }
      }

      if (results.length === 0) {
        return res.json({ result: null, mode });
      }

      const chosen = results[Math.floor(Math.random() * results.length)];

      return res.json({
        result: chosen.word,
        mode
      });
    } catch (error) {
      console.error("Random word/phrase error:", error);
      return res.status(500).json({ error: "Failed to fetch random result" });
    }
  });

  app.get("/", requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
  });

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Server startup error:", err);
  process.exit(1);
});
