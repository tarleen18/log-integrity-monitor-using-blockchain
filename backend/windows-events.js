const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);
const DEFAULT_CHANNEL = "Microsoft-Windows-Windows Firewall With Advanced Security/Firewall";
const APPLICATION_CHANNEL = "Application";

function configuredChannels() {
  return (process.env.WINDOWS_EVENT_CHANNELS || DEFAULT_CHANNEL)
    .split(",")
    .map((channel) => channel.trim())
    .filter(Boolean);
}

function outputFileName(channel) {
  const name = channel
    .replace(/^Microsoft-Windows-/i, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  return `${name || "windows-events"}.log`;
}

function sourceKey(source) {
  return source.provider ? `${source.channel}|${source.provider}` : source.channel;
}

function sourceFileName(source) {
  const label = source.provider ? `${source.channel}-${source.provider}` : source.channel;
  return outputFileName(label);
}

function configuredSources(logDir) {
  const sources = configuredChannels().map((channel) => ({ channel }));
  const sourcePath = path.join(logDir, ".windows-event-sources.json");

  if (fs.existsSync(sourcePath)) {
    try {
      const selected = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
      for (const provider of selected.applicationProviders || []) {
        if (typeof provider === "string" && provider.trim()) {
          sources.push({ channel: APPLICATION_CHANNEL, provider: provider.trim() });
        }
      }
    } catch (error) {
      console.error(`Could not read Windows event sources: ${error.message}`);
    }
  }

  return sources;
}

async function getWindowsApplicationProviders() {
  const script = `
    Get-WinEvent -LogName Application -MaxEvents 5000 -ErrorAction Stop |
      Select-Object -ExpandProperty ProviderName -Unique |
      Sort-Object
  `;
  const { stdout } = await execFileAsync("powershell.exe", [
    "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script
  ], { maxBuffer: 4 * 1024 * 1024 });

  return stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

async function addApplicationProvider(logDir, provider) {
  const providers = await getWindowsApplicationProviders();
  if (!providers.includes(provider)) {
    throw new Error(`Application provider not found: ${provider}`);
  }

  const sourcePath = path.join(logDir, ".windows-event-sources.json");
  let config = { applicationProviders: [] };
  if (fs.existsSync(sourcePath)) {
    config = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
  }
  config.applicationProviders = [...new Set([...(config.applicationProviders || []), provider])];
  fs.writeFileSync(sourcePath, JSON.stringify(config, null, 2) + "\n", "utf8");
  return { provider, filename: sourceFileName({ channel: APPLICATION_CHANNEL, provider }) };
}

async function readNewEvents(source, lastRecordId) {
  const script = `
    $channel = $env:LOG_INTEGRITY_EVENT_CHANNEL
    $since = [long]$env:LOG_INTEGRITY_EVENT_SINCE
    Get-WinEvent -LogName $channel -ErrorAction Stop |
      Where-Object {
        $_.RecordId -gt $since -and
        (!$env:LOG_INTEGRITY_EVENT_PROVIDER -or $_.ProviderName -eq $env:LOG_INTEGRITY_EVENT_PROVIDER)
      } |
      Sort-Object RecordId |
      ForEach-Object {
        [pscustomobject]@{
          recordId = [long]$_.RecordId
          timeCreated = $_.TimeCreated.ToUniversalTime().ToString("o")
          eventId = [int]$_.Id
          level = $_.LevelDisplayName
          provider = $_.ProviderName
          channel = $channel
          message = $_.Message
        } | ConvertTo-Json -Compress -Depth 4
      }
  `;

  const { stdout } = await execFileAsync("powershell.exe", [
    "-NoProfile",
    "-NonInteractive",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    script
  ], {
    maxBuffer: 16 * 1024 * 1024,
    env: {
      ...process.env,
      LOG_INTEGRITY_EVENT_CHANNEL: source.channel,
      LOG_INTEGRITY_EVENT_SINCE: String(lastRecordId),
      LOG_INTEGRITY_EVENT_PROVIDER: source.provider || ""
    }
  });

  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

async function collectWindowsEvents(logDir) {
  if (process.platform !== "win32" || process.env.WINDOWS_EVENT_LOG_ENABLED === "false") {
    return 0;
  }

  fs.mkdirSync(logDir, { recursive: true });
  const statePath = path.join(logDir, ".windows-event-state.json");
  let state = {};

  if (fs.existsSync(statePath)) {
    try {
      state = JSON.parse(fs.readFileSync(statePath, "utf8"));
    } catch (error) {
      console.error(`Could not read Windows event state: ${error.message}`);
    }
  }

  let totalEvents = 0;
  for (const source of configuredSources(logDir)) {
    const key = sourceKey(source);
    const lastRecordId = Number(state[key] || 0);
    try {
      const events = await readNewEvents(source, lastRecordId);
      if (events.length === 0) continue;

      const outputPath = path.join(logDir, sourceFileName(source));
      fs.appendFileSync(outputPath, events.map((event) => JSON.stringify(event)).join("\n") + "\n", "utf8");
      state[key] = Math.max(...events.map((event) => event.recordId));
      totalEvents += events.length;
      console.log(`[${new Date().toISOString()}] Captured ${events.length} Windows events from ${key}`);
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Failed to capture ${key}: ${error.message}`);
    }
  }

  fs.writeFileSync(statePath, JSON.stringify(state, null, 2) + "\n", "utf8");
  return totalEvents;
}

module.exports = {
  addApplicationProvider,
  collectWindowsEvents,
  getWindowsApplicationProviders
};
