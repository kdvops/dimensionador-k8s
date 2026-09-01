import { readFile } from "node:fs/promises";
import { filterLogEntries, splitLogLines } from "../../log-utils.js";

export const runtime = "nodejs";

if (typeof process !== "undefined") {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

const SERVICE_ACCOUNT_TOKEN = "/var/run/secrets/kubernetes.io/serviceaccount/token";

async function readJson(url, token, signal) {
  const response = await fetch(url, {
    signal,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`${url} returned ${response.status}`);
  }

  return response.json();
}

async function readText(url, token, signal) {
  const response = await fetch(url, {
    signal,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "text/plain",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`${url} returned ${response.status}`);
  }

  return response.text();
}

function buildBaseUrl() {
  const host = process.env.KUBERNETES_SERVICE_HOST;
  const port = process.env.KUBERNETES_SERVICE_PORT ?? "443";
  if (!host) throw new Error("Kubernetes service host is unavailable");
  return `https://${host}:${port}`;
}

export async function GET(request) {
  const url = new URL(request.url);
  const namespace = url.searchParams.get("namespace") ?? "";
  const podName = url.searchParams.get("pod") ?? "";
  const requestedContainer = url.searchParams.get("container") ?? "";
  const filter = url.searchParams.get("filter") ?? "";
  const tailLines = Math.max(
    20,
    Math.min(1000, Number(url.searchParams.get("tailLines") ?? 300) || 300),
  );

  if (!namespace || !podName) {
    return Response.json(
      {
        live: false,
        source: "kubernetes-logs",
        error: "Missing namespace or pod query parameter",
        collectedAt: new Date().toISOString(),
      },
      { status: 400, headers: { "cache-control": "no-store" } },
    );
  }

  try {
    const token = (await readFile(SERVICE_ACCOUNT_TOKEN, "utf8")).trim();
    const baseUrl = buildBaseUrl();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);

    try {
      const pod = await readJson(
        `${baseUrl}/api/v1/namespaces/${encodeURIComponent(namespace)}/pods/${encodeURIComponent(podName)}`,
        token,
        controller.signal,
      );

      const containers = (pod?.spec?.containers ?? []).map(
        (container) => container?.name,
      ).filter(Boolean);
      const container = requestedContainer || containers[0] || "";
      if (!container) {
        throw new Error(`Pod ${namespace}/${podName} has no containers`);
      }

      const logText = await readText(
        `${baseUrl}/api/v1/namespaces/${encodeURIComponent(namespace)}/pods/${encodeURIComponent(podName)}/log?container=${encodeURIComponent(container)}&tailLines=${tailLines}&timestamps=true`,
        token,
        controller.signal,
      );

      const allLines = splitLogLines(logText);
      const filteredLines = filterLogEntries(allLines, filter);

      return Response.json(
        {
          live: true,
          source: "kubernetes-pod-logs",
          collectedAt: new Date().toISOString(),
          namespace,
          pod: podName,
          node: pod?.spec?.nodeName ?? "unknown",
          container,
          containers,
          filter,
          tailLines,
          totalLines: allLines.length,
          matchedLines: filteredLines.length,
          lines: filteredLines,
        },
        { headers: { "cache-control": "no-store" } },
      );
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    return Response.json(
      {
        live: false,
        source: "kubernetes-logs",
        error: error instanceof Error ? error.message : "Unknown logs error",
        namespace,
        pod: podName,
        collectedAt: new Date().toISOString(),
      },
      { status: 500, headers: { "cache-control": "no-store" } },
    );
  }
}
