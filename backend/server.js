const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
require("dotenv").config();

const { buildMerkleTreeFromFile, verifyFileAgainstRoot } = require("./merkle");
const { anchorLogs, getAllAnchors, verifyOnChain } = require("./chain");
const {
  addApplicationProvider,
  collectWindowsEvents,
  getWindowsApplicationProviders
} = require("./windows-events");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "frontend")));

const LOG_DIR = process.env.LOG_DIR || path.join(__dirname, "..", "logs");
const PORT = process.env.PORT || 4000;

app.get("/api/sources", async (req, res) => {
  try {
    const files = fs.readdirSync(LOG_DIR).filter((f) => f.endsWith(".log") || f.endsWith(".txt"));
    const applicationProviders = process.platform === "win32"
      ? await getWindowsApplicationProviders()
      : [];
    res.json({ files, applicationProviders });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/sources/application", async (req, res) => {
  try {
    const { provider } = req.body;
    if (!provider) return res.status(400).json({ error: "provider is required" });

    const source = await addApplicationProvider(LOG_DIR, provider);
    await collectWindowsEvents(LOG_DIR);
    res.json({ success: true, ...source });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// --- List available log files ---
app.get("/api/logs", (req, res) => {
  try {
    const files = fs.readdirSync(LOG_DIR).filter((f) => f.endsWith(".log") || f.endsWith(".txt"));
    res.json({ files });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Anchor a log file's current state on-chain ---
app.post("/api/anchor", async (req, res) => {
  try {
    const { filename } = req.body;
    if (!filename) return res.status(400).json({ error: "filename is required" });

    const filePath = path.join(LOG_DIR, filename);
    const { root, lineCount } = buildMerkleTreeFromFile(filePath);
    const batchLabel = `${filename}-${new Date().toISOString()}`;

    const result = await anchorLogs(root, batchLabel, lineCount);

    res.json({
      success: true,
      merkleRoot: root,
      lineCount,
      batchLabel,
      ...result
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Get all on-chain anchors (for dashboard) ---
app.get("/api/anchors", async (req, res) => {
  try {
    const anchors = await getAllAnchors();
    res.json({ anchors });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Verify a log file's current state against a specific on-chain anchor ---
app.post("/api/verify", async (req, res) => {
  try {
    const { filename, anchorId } = req.body;
    if (!filename || anchorId === undefined) {
      return res.status(400).json({ error: "filename and anchorId are required" });
    }

    const filePath = path.join(LOG_DIR, filename);
    const anchors = await getAllAnchors();
    const anchor = anchors.find((a) => a.anchorId === Number(anchorId));
    if (!anchor) return res.status(404).json({ error: "Anchor not found" });

    const localCheck = verifyFileAgainstRoot(filePath, anchor.merkleRoot);
    const onChainCheck = await verifyOnChain(Number(anchorId), localCheck.currentRoot);

    res.json({
      filename,
      anchorId: Number(anchorId),
      anchoredRoot: anchor.merkleRoot,
      currentRoot: localCheck.currentRoot,
      lineCount: localCheck.lineCount,
      anchoredLineCount: anchor.logCount,
      tampered: !onChainCheck,
      verified: onChainCheck
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Log Integrity Monitor backend running at http://localhost:${PORT}`);
  console.log(`   Watching log directory: ${LOG_DIR}`);
});
