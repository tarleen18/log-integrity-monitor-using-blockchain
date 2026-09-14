const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("LogIntegrity", function () {
  let contract, owner, other;

  beforeEach(async function () {
    [owner, other] = await ethers.getSigners();
    const LogIntegrity = await ethers.getContractFactory("LogIntegrity");
    contract = await LogIntegrity.deploy();
    await contract.waitForDeployment();
  });

  it("sets the deployer as owner", async function () {
    expect(await contract.owner()).to.equal(owner.address);
  });

  it("allows the owner to anchor a log batch", async function () {
    const fakeRoot = ethers.keccak256(ethers.toUtf8Bytes("test-log-batch"));
    await expect(contract.anchorLogs(fakeRoot, "auth.log-batch1", 10))
      .to.emit(contract, "LogAnchored")
      .withArgs(0, fakeRoot, await anyUint(), owner.address, "auth.log-batch1", 10);

    expect(await contract.getAnchorCount()).to.equal(1);
  });

  it("rejects anchoring from a non-owner address", async function () {
    const fakeRoot = ethers.keccak256(ethers.toUtf8Bytes("test-log-batch"));
    await expect(
      contract.connect(other).anchorLogs(fakeRoot, "malicious-batch", 5)
    ).to.be.revertedWith("Not authorized: only owner can anchor logs");
  });

  it("verifies a matching root as true", async function () {
    const root = ethers.keccak256(ethers.toUtf8Bytes("original-logs"));
    await contract.anchorLogs(root, "batch1", 3);
    expect(await contract.verifyAnchor(0, root)).to.equal(true);
  });

  it("detects a tampered root (mismatch) as false", async function () {
    const originalRoot = ethers.keccak256(ethers.toUtf8Bytes("original-logs"));
    const tamperedRoot = ethers.keccak256(ethers.toUtf8Bytes("tampered-logs"));
    await contract.anchorLogs(originalRoot, "batch1", 3);
    expect(await contract.verifyAnchor(0, tamperedRoot)).to.equal(false);
  });

  it("stores multiple anchors and retrieves them correctly", async function () {
    const root1 = ethers.keccak256(ethers.toUtf8Bytes("batch-a"));
    const root2 = ethers.keccak256(ethers.toUtf8Bytes("batch-b"));
    await contract.anchorLogs(root1, "batchA", 5);
    await contract.anchorLogs(root2, "batchB", 7);

    expect(await contract.getAnchorCount()).to.equal(2);

    const anchor0 = await contract.getAnchor(0);
    const anchor1 = await contract.getAnchor(1);
    expect(anchor0[0]).to.equal(root1);
    expect(anchor1[0]).to.equal(root2);
    expect(anchor1[4]).to.equal(7);
  });

  it("allows ownership transfer", async function () {
    await contract.transferOwnership(other.address);
    expect(await contract.owner()).to.equal(other.address);
  });
});

// Helper matcher for the dynamic block.timestamp argument
async function anyUint() {
  const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
  return anyValue;
}
