const fs = require("fs");
const crypto = require("crypto");
const { MerkleTree } = require("merkletreejs");

/**
 * Hash a single log line with SHA-256.
 */
function hashLine(line) {
  return crypto.createHash("sha256").update(line, "utf8").digest();
}

/**
 * Read a log file and build a Merkle tree over its lines.
 * Returns the tree, the root hash (hex, 0x-prefixed for Solidity bytes32),
 * and the individual leaves (so any single line can later be proven
 * to be part of the anchored batch).
 */
function buildMerkleTreeFromFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Log file not found: ${filePath}`);
  }

  const content = fs.readFileSync(filePath, "utf8");
  const lines = content.split("\n").filter((l) => l.trim().length > 0);

  if (lines.length === 0) {
    throw new Error(`Log file is empty: ${filePath}`);
  }

  const leaves = lines.map(hashLine);
  const tree = new MerkleTree(leaves, (data) => crypto.createHash("sha256").update(data).digest(), {
    sortPairs: true
  });

  const rootHex = "0x" + tree.getRoot().toString("hex");

  return {
    tree,
    root: rootHex,
    lineCount: lines.length,
    lines
  };
}

/**
 * Re-hash the current state of a log file and compare against a
 * previously anchored root. This is the actual tamper-detection check.
 */
function verifyFileAgainstRoot(filePath, expectedRoot) {
  const { root, lineCount } = buildMerkleTreeFromFile(filePath);
  return {
    matches: root.toLowerCase() === expectedRoot.toLowerCase(),
    currentRoot: root,
    expectedRoot,
    lineCount
  };
}

module.exports = { buildMerkleTreeFromFile, verifyFileAgainstRoot, hashLine };
