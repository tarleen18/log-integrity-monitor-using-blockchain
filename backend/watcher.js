/**
 * Runs as a background service (e.g. via cron, systemd, or `pm2 start watcher.js`).
 * Every ANCHOR_INTERVAL_MINUTES, it hashes each log file in LOG_DIR and
 * anchors the Merkle root on-chain automatically — no manual button-press
 * needed in production use.
 */
const fs = require("fs");
const path = require("path");
require("dotenv").config();

const { buildMerkleTreeFromFile } = require("./merkle");
const { anchorLogs } = require("./chain");
const { collectWindowsEvents } = require("./windows-events");

const LOG_DIR = process.env.LOG_DIR || path.join(__dirname, "..", "logs");
const INTERVAL_MIN = Number(process.env.ANCHOR_INTERVAL_MINUTES || 5);

async function anchorAllLogs() {
  await collectWindowsEvents(LOG_DIR);
  const files = fs.readdirSync(LOG_DIR).filter((f) => f.endsWith(".log") || f.endsWith(".txt"));

  if (files.length === 0) {
    console.log(`[${new Date().toISOString()}] No log files found in ${LOG_DIR}`);
    return;
  }

  for (const filename of files) {
    try {
      const filePath = path.join(LOG_DIR, filename);
      const { root, lineCount } = buildMerkleTreeFromFile(filePath);
      const batchLabel = `${filename}-${new Date().toISOString()}`;

      const result = await anchorLogs(root, batchLabel, lineCount);

      console.log(
        `[${new Date().toISOString()}] Anchored ${filename} ` +
          `(${lineCount} lines) -> anchorId=${result.anchorId}, tx=${result.txHash}`
      );
    } catch (err) {
      console.error(`[${new Date().toISOString()}] Failed to anchor ${filename}:`, err.message);
    }
  }
}

console.log(`🔄 Watcher started. Anchoring logs every ${INTERVAL_MIN} minute(s) from ${LOG_DIR}`);
anchorAllLogs(); // run once immediately on startup
setInterval(anchorAllLogs, INTERVAL_MIN * 60 * 1000);
