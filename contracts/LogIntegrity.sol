// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title LogIntegrity
/// @notice Anchors Merkle root hashes of log batches on-chain so that
///         off-chain log tampering becomes provable. Only the hash is
///         stored on-chain (cheap, private) — the actual logs never
///         leave your server.
contract LogIntegrity {
    struct Anchor {
        bytes32 merkleRoot;   // Merkle root of the log batch
        uint256 timestamp;    // Block timestamp when anchored
        address submitter;    // Who anchored it (your backend's wallet)
        string  batchLabel;   // Human-readable label, e.g. "auth.log-2026-09-14T10:00Z"
        uint256 logCount;     // Number of log lines in this batch
    }

    Anchor[] private anchors;

    // Restrict who can anchor hashes (your backend service's address).
    // In production, use a multisig or a dedicated hot wallet with limited funds.
    address public owner;

    event LogAnchored(
        uint256 indexed anchorId,
        bytes32 indexed merkleRoot,
        uint256 timestamp,
        address submitter,
        string batchLabel,
        uint256 logCount
    );

    modifier onlyOwner() {
        require(msg.sender == owner, "Not authorized: only owner can anchor logs");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    /// @notice Anchor a new Merkle root for a batch of logs.
    function anchorLogs(
        bytes32 merkleRoot,
        string calldata batchLabel,
        uint256 logCount
    ) external onlyOwner returns (uint256 anchorId) {
        anchors.push(Anchor({
            merkleRoot: merkleRoot,
            timestamp: block.timestamp,
            submitter: msg.sender,
            batchLabel: batchLabel,
            logCount: logCount
        }));

        anchorId = anchors.length - 1;

        emit LogAnchored(anchorId, merkleRoot, block.timestamp, msg.sender, batchLabel, logCount);
    }

    /// @notice Verify whether a given Merkle root matches a specific anchor.
    function verifyAnchor(uint256 anchorId, bytes32 merkleRoot) external view returns (bool matches) {
        require(anchorId < anchors.length, "Anchor does not exist");
        return anchors[anchorId].merkleRoot == merkleRoot;
    }

    /// @notice Get total number of anchors stored.
    function getAnchorCount() external view returns (uint256) {
        return anchors.length;
    }

    /// @notice Fetch a single anchor by id.
    function getAnchor(uint256 anchorId) external view returns (
        bytes32 merkleRoot,
        uint256 timestamp,
        address submitter,
        string memory batchLabel,
        uint256 logCount
    ) {
        require(anchorId < anchors.length, "Anchor does not exist");
        Anchor storage a = anchors[anchorId];
        return (a.merkleRoot, a.timestamp, a.submitter, a.batchLabel, a.logCount);
    }

    /// @notice Transfer ownership (e.g., to a multisig) for production hardening.
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Invalid address");
        owner = newOwner;
    }
}
