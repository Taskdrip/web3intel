#!/usr/bin/env node

import { chmod, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";

function readArgument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function assertServerUrl(value) {
  const url = new URL(value);
  if (url.protocol !== "https:" && !["localhost", "127.0.0.1", "::1"].includes(url.hostname)) {
    throw new Error("Use an HTTPS Web3Intel URL. Plain HTTP is allowed only for local testing.");
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error("The server argument must be a base URL without credentials, query, or fragment.");
  }
  return url.origin;
}

function readLocalApiConfig(config) {
  const api = config?.http;
  if (!api?.enabled || api.restricted !== true) {
    throw new Error("The selected XMRig config must enable its restricted local HTTP API.");
  }
  if (!["127.0.0.1", "localhost", "::1"].includes(api.host)) {
    throw new Error("The XMRig HTTP API must bind to this computer only, not a network interface.");
  }
  if (!Number.isInteger(api.port) || api.port < 1 || api.port > 65535) {
    throw new Error("The XMRig HTTP API port in the config is invalid.");
  }
  if (typeof api["access-token"] !== "string" || api["access-token"].length < 24) {
    throw new Error("The XMRig HTTP API config must contain its generated access token.");
  }
  return {
    host: api.host === "localhost" ? "127.0.0.1" : api.host,
    port: api.port,
    token: api["access-token"],
  };
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(8_000),
    headers: { accept: "application/json", ...(options.headers ?? {}) },
  });
  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new Error("The server returned an invalid response.");
  }
  if (!response.ok) {
    const message = typeof data?.error === "string" ? data.error : `Request failed (${response.status}).`;
    throw new Error(message);
  }
  return data;
}

async function getXMRigSummary(localApi) {
  const url = `http://${localApi.host}:${localApi.port}`;
  let lastError;
  for (const endpoint of ["/2/summary", "/1/summary"]) {
    try {
      const data = await requestJson(`${url}${endpoint}`, {
        headers: { authorization: `Bearer ${localApi.token}` },
      });
      const hashrate = data?.hashrate?.total?.[0];
      const acceptedShares = data?.results?.shares_good;
      const totalShares = data?.results?.shares_total;
      const uptime = data?.uptime;
      if (![hashrate, acceptedShares, totalShares, uptime].every(Number.isFinite)) {
        throw new Error("The local miner summary did not contain usable statistics.");
      }
      return {
        hashrate: Math.max(0, hashrate),
        acceptedShares: Math.max(0, Math.floor(acceptedShares)),
        rejectedShares: Math.max(0, Math.floor(totalShares - acceptedShares)),
        uptime: Math.max(0, Math.floor(uptime)),
      };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError ?? new Error("XMRig's local summary endpoint is unavailable.");
}

async function main() {
  const server = readArgument("--server");
  const configPath = readArgument("--config");
  if (!server || !configPath) {
    throw new Error("Usage: node web3intel-mining-agent.mjs --server https://your-web3intel-app --config ./config.json");
  }

  const origin = assertServerUrl(server);
  const config = JSON.parse(await readFile(path.resolve(configPath), "utf8"));
  const localApi = readLocalApiConfig(config);
  const apiBase = `${origin}/api/mining`;
  const credentialPath = path.join(os.homedir(), ".web3intel-mining-agent.json");
  let credential;

  try {
    const saved = JSON.parse(await readFile(credentialPath, "utf8"));
    if (saved.server === origin && Number.isInteger(saved.deviceId) && typeof saved.credentialToken === "string") {
      credential = saved;
    }
  } catch {
    // A first run or a different server needs a new one-time pairing code.
  }

  if (!credential) {
    const rl = readline.createInterface({ input: stdin, output: stdout });
    const pairingCode = (await rl.question("Paste the one-time pairing code from Web3Intel: ")).trim();
    rl.close();
    if (pairingCode.length < 16 || pairingCode.length > 64) {
      throw new Error("The pairing code format is invalid.");
    }
    const paired = await requestJson(`${apiBase}/pair`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pairingCode, cpuModel: os.cpus()[0]?.model ?? null }),
    });
    if (!Number.isInteger(paired?.device?.id) || typeof paired?.credentialToken !== "string") {
      throw new Error("The pairing response did not contain a device credential.");
    }
    credential = {
      server: origin,
      deviceId: paired.device.id,
      credentialToken: paired.credentialToken,
    };
    await writeFile(credentialPath, JSON.stringify(credential, null, 2), { mode: 0o600 });
    try {
      await chmod(credentialPath, 0o600);
    } catch {
      // Windows access control is managed by the signed-in operating-system account.
    }
    console.log(`Paired ${paired.device.deviceName}. The device credential was saved in your home folder.`);
  }

  const authorization = { authorization: `Bearer ${credential.credentialToken}` };
  console.log("Monitoring only. This agent does not install, start, stop, or control XMRig.");
  console.log("Keep XMRig running manually if you want its local statistics to appear. Press Ctrl+C to exit.");

  let stopping = false;
  process.once("SIGINT", () => { stopping = true; });
  process.once("SIGTERM", () => { stopping = true; });

  while (!stopping) {
    try {
      const summary = await getXMRigSummary(localApi);
      await requestJson(`${apiBase}/devices/${credential.deviceId}/telemetry`, {
        method: "POST",
        headers: { ...authorization, "content-type": "application/json" },
        body: JSON.stringify(summary),
      });
      console.log(`Reported local XMRig summary at ${new Date().toLocaleTimeString()}. Pool verification is not available.`);
    } catch {
      try {
        await requestJson(`${apiBase}/devices/${credential.deviceId}/heartbeat`, {
          method: "POST",
          headers: authorization,
        });
        console.log("Device connected; local XMRig statistics are not available yet.");
      } catch (error) {
        console.error(error instanceof Error ? error.message : "Device connection failed.");
        if (String(error).includes("credential is invalid or revoked")) {
          console.error("Reconnect this computer from the Web3Intel Mining dashboard.");
          break;
        }
      }
    }
    if (!stopping) await new Promise((resolve) => setTimeout(resolve, 60_000));
  }
  console.log("Monitoring stopped. Stop XMRig separately on this computer if it is still running.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "The mining monitor could not start.");
  process.exitCode = 1;
});
