const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.post("/api/analyze", (req, res) => {
  const lyrics = req.body.lyrics || "";

  const lines = lyrics.split(/\r?\n/);
  const nonEmptyLines = lines.filter((line) => line.trim() !== "");
  const words = lyrics.trim() ? lyrics.trim().split(/\s+/) : [];
  const characterCount = lyrics.length;
  const characterCountNoSpaces = lyrics.replace(/\s/g, "").length;

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
    nonEmptyLineCount: nonEmptyLines.length,
    wordCount: words.length,
    characterCount,
    characterCountNoSpaces,
    averageWordsPerLine:
      nonEmptyLines.length > 0 ? (words.length / nonEmptyLines.length).toFixed(2) : "0",
    longestLineLength: longestLine.length,
    longestLine,
    sectionCount: parsedSections.length,
    detectedSections,
    parsedSections
  });
});

app.get("/logout", (req, res) => {
  res.redirect("/");
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
