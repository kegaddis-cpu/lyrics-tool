const express = require("express");
const path = require("path");
const session = require("express-session");

const app = express();
const PORT = process.env.PORT || 3000;

const APP_PASSWORD = process.env.APP_PASSWORD || "changeme123";
const SESSION_SECRET = process.env.SESSION_SECRET || "replace-this-session-secret";

app.set("trust proxy", 1);

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use(
  session({
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

app.get("/", requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
