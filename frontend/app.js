const API = "http://localhost:4000/api";

async function loadFiles() {
  const res = await fetch(`${API}/sources`);
  const { files, applicationProviders } = await res.json();
  const fileSelect = document.getElementById("fileSelect");
  const verifyFileSelect = document.getElementById("verifyFileSelect");
  const applicationProviderSelect = document.getElementById("applicationProviderSelect");
  fileSelect.innerHTML = files.map((f) => `<option value="${f}">${f}</option>`).join("");
  verifyFileSelect.innerHTML = fileSelect.innerHTML;
  applicationProviderSelect.innerHTML = applicationProviders.length
    ? applicationProviders.map((provider) => `<option value="${provider}">${provider}</option>`).join("")
    : "<option value=\"\">No Windows Application providers found</option>";
}

async function loadAnchors() {
  const res = await fetch(`${API}/anchors`);
  const { anchors } = await res.json();

  const tbody = document.querySelector("#anchorsTable tbody");
  tbody.innerHTML = anchors
    .map(
      (a) => `<tr>
        <td>${a.anchorId}</td>
        <td>${a.batchLabel}</td>
        <td class="mono">${a.merkleRoot.slice(0, 14)}...${a.merkleRoot.slice(-8)}</td>
        <td>${a.logCount}</td>
        <td>${new Date(a.timestamp * 1000).toLocaleString()}</td>
      </tr>`
    )
    .join("");

  const anchorSelect = document.getElementById("anchorSelect");
  anchorSelect.innerHTML = anchors
    .map((a) => `<option value="${a.anchorId}">#${a.anchorId} — ${a.batchLabel}</option>`)
    .join("");
}

document.getElementById("anchorBtn").addEventListener("click", async () => {
  const filename = document.getElementById("fileSelect").value;
  const resultBox = document.getElementById("anchorResult");
  resultBox.textContent = "Anchoring on blockchain... (waiting for transaction confirmation)";

  try {
    const res = await fetch(`${API}/anchor`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename })
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    resultBox.innerHTML =
      `<span class="ok">✔ Anchored successfully</span>\n` +
      `Merkle Root: ${data.merkleRoot}\n` +
      `Lines hashed: ${data.lineCount}\n` +
      `Anchor ID: ${data.anchorId}\n` +
      `Tx Hash: ${data.txHash}\n` +
      `Block: ${data.blockNumber}`;

    await loadAnchors();
  } catch (err) {
    resultBox.innerHTML = `<span class="fail">✖ ${err.message}</span>`;
  }
});

document.getElementById("addApplicationBtn").addEventListener("click", async () => {
  const provider = document.getElementById("applicationProviderSelect").value;
  const resultBox = document.getElementById("applicationResult");
  if (!provider) return;
  resultBox.textContent = "Capturing application events...";

  try {
    const res = await fetch(`${API}/sources/application`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider })
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    resultBox.innerHTML = `<span class="ok">✔ Application log captured</span>\n` +
      `Provider: ${data.provider}\n` +
      `File: ${data.filename}\n\nSelect this file above to anchor it.`;
    await loadFiles();
  } catch (err) {
    resultBox.innerHTML = `<span class="fail">✖ ${err.message}</span>`;
  }
});

document.getElementById("verifyBtn").addEventListener("click", async () => {
  const filename = document.getElementById("verifyFileSelect").value;
  const anchorId = document.getElementById("anchorSelect").value;
  const resultBox = document.getElementById("verifyResult");
  resultBox.textContent = "Verifying...";

  try {
    const res = await fetch(`${API}/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename, anchorId })
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    if (data.verified) {
      resultBox.innerHTML =
        `<span class="ok">✔ VERIFIED — No tampering detected</span>\n` +
        `Anchored root:  ${data.anchoredRoot}\n` +
        `Current root:   ${data.currentRoot}\n` +
        `Lines: ${data.lineCount} (anchored: ${data.anchoredLineCount})`;
    } else {
      resultBox.innerHTML =
        `<span class="fail">⚠ ALERT — LOG FILE HAS BEEN TAMPERED WITH</span>\n` +
        `Anchored root:  ${data.anchoredRoot}\n` +
        `Current root:   ${data.currentRoot}\n` +
        `Lines: ${data.lineCount} (anchored: ${data.anchoredLineCount})\n\n` +
        `The hashes do not match — the log file was modified after anchoring.`;
    }
  } catch (err) {
    resultBox.innerHTML = `<span class="fail">✖ ${err.message}</span>`;
  }
});

document.getElementById("refreshBtn").addEventListener("click", loadAnchors);

loadFiles();
loadAnchors();
