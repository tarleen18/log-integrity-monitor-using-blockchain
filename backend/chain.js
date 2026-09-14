const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");
require("dotenv").config();

const RPC_URL = process.env.RPC_URL || "http://127.0.0.1:8545";
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS;

const artifactPath = path.join(__dirname, "..", "artifacts", "contracts", "LogIntegrity.sol", "LogIntegrity.json");

function loadAbi() {
  if (!fs.existsSync(artifactPath)) {
    throw new Error(
      "Contract artifact not found. Run `npm run compile` first (and deploy with `npm run deploy:local`)."
    );
  }
  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
  return artifact.abi;
}

function getProvider() {
  return new ethers.JsonRpcProvider(RPC_URL);
}

function getWallet(provider) {
  if (!PRIVATE_KEY) {
    throw new Error("PRIVATE_KEY not set in .env");
  }
  return new ethers.Wallet(PRIVATE_KEY, provider);
}

function getContract() {
  if (!CONTRACT_ADDRESS) {
    throw new Error("CONTRACT_ADDRESS not set in .env — deploy the contract first.");
  }
  const abi = loadAbi();
  const provider = getProvider();
  const wallet = getWallet(provider);
  return new ethers.Contract(CONTRACT_ADDRESS, abi, wallet);
}

function getReadOnlyContract() {
  const abi = loadAbi();
  const provider = getProvider();
  return new ethers.Contract(CONTRACT_ADDRESS, abi, provider);
}

/** Anchor a Merkle root on-chain. Returns the tx receipt and anchorId. */
async function anchorLogs(merkleRoot, batchLabel, logCount) {
  const contract = getContract();
  const tx = await contract.anchorLogs(merkleRoot, batchLabel, logCount);
  const receipt = await tx.wait();

  // Parse the LogAnchored event to get the anchorId
  const event = receipt.logs
    .map((log) => {
      try {
        return contract.interface.parseLog(log);
      } catch {
        return null;
      }
    })
    .find((e) => e && e.name === "LogAnchored");

  return {
    txHash: receipt.hash,
    blockNumber: receipt.blockNumber,
    anchorId: event ? Number(event.args.anchorId) : null
  };
}

/** Fetch all anchors stored on-chain (for the dashboard). */
async function getAllAnchors() {
  const contract = getReadOnlyContract();
  const count = await contract.getAnchorCount();
  const anchors = [];
  for (let i = 0; i < Number(count); i++) {
    const a = await contract.getAnchor(i);
    anchors.push({
      anchorId: i,
      merkleRoot: a[0],
      timestamp: Number(a[1]),
      submitter: a[2],
      batchLabel: a[3],
      logCount: Number(a[4])
    });
  }
  return anchors;
}

/** Check a root hash against a specific anchor. */
async function verifyOnChain(anchorId, merkleRoot) {
  const contract = getReadOnlyContract();
  return contract.verifyAnchor(anchorId, merkleRoot);
}

module.exports = { anchorLogs, getAllAnchors, verifyOnChain, getReadOnlyContract };
