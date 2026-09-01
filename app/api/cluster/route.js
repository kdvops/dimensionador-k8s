import { readFile } from "node:fs/promises";
import {
  buildClusterSnapshot,
  createOfflineSnapshot,
} from "../../cluster-metrics.js";

export const runtime = "nodejs";

if (typeof process !== "undefined") {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

const SERVICE_ACCOUNT_TOKEN = "/var/run/secrets/kubernetes.io/serviceaccount/token";

async function readJson(url, token) {
  const response = await fetch(url, {
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

async function fetchLiveClusterSnapshot(limit) {
  const host = process.env.KUBERNETES_SERVICE_HOST;
  const port = process.env.KUBERNETES_SERVICE_PORT ?? "443";
  if (!host) throw new Error("Kubernetes service host is unavailable");

  const token = (await readFile(SERVICE_ACCOUNT_TOKEN, "utf8")).trim();
  const baseUrl = `https://${host}:${port}`;

  const [nodeList, nodeMetrics, podMetrics] = await Promise.all([
    readJson(`${baseUrl}/api/v1/nodes`, token),
    readJson(`${baseUrl}/apis/metrics.k8s.io/v1beta1/nodes`, token),
    readJson(`${baseUrl}/apis/metrics.k8s.io/v1beta1/pods`, token),
  ]);

  return buildClusterSnapshot({
    nodeList,
    nodeMetrics,
    podMetrics,
    limit,
  });
}

export async function GET(request) {
  const url = new URL(request.url);
  const rawLimit = Number(url.searchParams.get("limit") ?? 8);
  const limit = Number.isFinite(rawLimit) ? rawLimit : 8;

  try {
    return Response.json(await fetchLiveClusterSnapshot(limit), {
      headers: {
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return Response.json(
      createOfflineSnapshot(
        error instanceof Error ? error.message : "Unknown cluster metrics error",
        limit,
      ),
      {
        headers: {
          "cache-control": "no-store",
        },
      },
    );
  }
}
