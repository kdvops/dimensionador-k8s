import assert from "node:assert/strict";
import test from "node:test";
import {
  buildClusterSnapshot,
  parseCpuQuantity,
  parseMemoryQuantity,
} from "../app/cluster-metrics.js";

test("parses cpu and memory quantities", () => {
  assert.equal(parseCpuQuantity("896m"), 896);
  assert.equal(parseCpuQuantity("1"), 1000);
  assert.equal(parseMemoryQuantity("4775Mi"), 4775);
  assert.equal(parseMemoryQuantity("11Gi"), 11264);
});

test("builds a ranked cluster snapshot", () => {
  const snapshot = buildClusterSnapshot({
    nodeList: {
      items: [
        {
          metadata: { name: "node-a" },
          status: { allocatable: { cpu: "4", memory: "8Gi" } },
        },
      ],
    },
    nodeMetrics: {
      items: [
        {
          metadata: { name: "node-a" },
          usage: { cpu: "250m", memory: "1024Mi" },
        },
      ],
    },
    podMetrics: {
      items: [
        {
          metadata: { namespace: "observability", name: "grafana-0" },
          spec: { nodeName: "node-a" },
          containers: [
            { usage: { cpu: "130m", memory: "200Mi" } },
            { usage: { cpu: "20m", memory: "40Mi" } },
          ],
        },
        {
          metadata: { namespace: "apps", name: "api-7d9f8" },
          spec: { nodeName: "node-a" },
          containers: [{ usage: { cpu: "5m", memory: "80Mi" } }],
        },
      ],
    },
    limit: 1,
  });

  assert.equal(snapshot.live, true);
  assert.equal(snapshot.totals.nodes, 1);
  assert.equal(snapshot.totals.pods, 2);
  assert.equal(snapshot.pods.length, 1);
  assert.equal(snapshot.pods[0].name, "grafana-0");
  assert.equal(snapshot.namespaces[0].namespace, "observability");
});
