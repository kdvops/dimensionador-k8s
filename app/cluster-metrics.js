const MILLI_CPU_PER_CPU = 1000;
const MIB_PER_GIB = 1024;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function parseCpuQuantity(value) {
  if (typeof value !== "string" || value.length === 0) return 0;
  const numeric = Number.parseFloat(value);
  if (!Number.isFinite(numeric)) return 0;
  if (value.endsWith("n")) return numeric / 1_000_000;
  if (value.endsWith("u")) return numeric / 1_000;
  if (value.endsWith("m")) return numeric;
  return numeric * MILLI_CPU_PER_CPU;
}

export function parseMemoryQuantity(value) {
  if (typeof value !== "string" || value.length === 0) return 0;
  const numeric = Number.parseFloat(value);
  if (!Number.isFinite(numeric)) return 0;

  const suffix = value.replace(/^[\d.]+/, "");
  const binary = {
    Ki: 1 / MIB_PER_GIB,
    Mi: 1,
    Gi: MIB_PER_GIB,
    Ti: MIB_PER_GIB * MIB_PER_GIB,
    Pi: MIB_PER_GIB * MIB_PER_GIB * MIB_PER_GIB,
  };
  const decimal = {
    K: 1 / 1024 / 1024,
    M: 1 / 1024,
    G: 1024,
    T: 1024 * 1024,
    P: 1024 * 1024 * 1024,
  };

  if (suffix in binary) return numeric * binary[suffix];
  if (suffix in decimal) return numeric * decimal[suffix];
  return numeric / 1024 / 1024;
}

export function formatCpuMillicores(value) {
  if (!Number.isFinite(value)) return "0m";
  if (value >= MILLI_CPU_PER_CPU) {
    const cores = value / MILLI_CPU_PER_CPU;
    return `${cores.toFixed(1)} vCPU`;
  }
  return `${Math.max(1, Math.round(value))}m`;
}

export function formatMemoryMiB(value) {
  if (!Number.isFinite(value)) return "0 MiB";
  if (value >= MIB_PER_GIB) {
    return `${(value / MIB_PER_GIB).toFixed(1)} GiB`;
  }
  return `${Math.max(1, Math.round(value))} MiB`;
}

function sumUsage(items = []) {
  return items.reduce(
    (accumulator, item) => {
      const usage = item?.usage ?? {};
      accumulator.cpuMillicores += parseCpuQuantity(usage.cpu);
      accumulator.memoryMiB += parseMemoryQuantity(usage.memory);
      return accumulator;
    },
    { cpuMillicores: 0, memoryMiB: 0 },
  );
}

function sumAllocatable(resourceMap = {}) {
  return {
    cpuMillicores: parseCpuQuantity(resourceMap.cpu ?? "0"),
    memoryMiB: parseMemoryQuantity(resourceMap.memory ?? "0"),
  };
}

export function createOfflineSnapshot(reason, limit = 8) {
  return {
    live: false,
    source: "offline-fallback",
    reason,
    collectedAt: new Date().toISOString(),
    totals: {
      nodes: 0,
      pods: 0,
      namespaces: 0,
      cpuUsageMillicores: 0,
      cpuAllocatableMillicores: 0,
      memoryUsageMiB: 0,
      memoryAllocatableMiB: 0,
      cpuPercent: 0,
      memoryPercent: 0,
    },
    nodes: [],
    pods: [],
    namespaces: [],
    limit: clamp(limit, 1, 20),
  };
}

export function buildClusterSnapshot({
  nodeList,
  nodeMetrics,
  podMetrics,
  limit = 8,
}) {
  const nodesByName = new Map(
    (nodeList?.items ?? []).map((node) => {
      const name = node?.metadata?.name ?? "unknown";
      const allocatable = sumAllocatable(node?.status?.allocatable);
      return [name, allocatable];
    }),
  );

  const nodes = (nodeMetrics?.items ?? [])
    .map((item) => {
      const name = item?.metadata?.name ?? "unknown";
      const usage = sumUsage([item]);
      const allocatable = nodesByName.get(name) ?? {
        cpuMillicores: 0,
        memoryMiB: 0,
      };
      return {
        name,
        cpuMillicores: usage.cpuMillicores,
        memoryMiB: usage.memoryMiB,
        cpuAllocatableMillicores: allocatable.cpuMillicores,
        memoryAllocatableMiB: allocatable.memoryMiB,
        cpuPercent: allocatable.cpuMillicores
          ? (usage.cpuMillicores / allocatable.cpuMillicores) * 100
          : 0,
        memoryPercent: allocatable.memoryMiB
          ? (usage.memoryMiB / allocatable.memoryMiB) * 100
          : 0,
      };
    })
    .sort((a, b) => b.cpuPercent - a.cpuPercent || b.memoryPercent - a.memoryPercent);

  const pods = (podMetrics?.items ?? [])
    .map((item) => {
      const usage = sumUsage(item?.containers ?? []);
      const namespace = item?.metadata?.namespace ?? "default";
      const name = item?.metadata?.name ?? "unknown";
      const node = item?.spec?.nodeName ?? "unknown";
      return {
        namespace,
        name,
        node,
        cpuMillicores: usage.cpuMillicores,
        memoryMiB: usage.memoryMiB,
      };
    })
    .sort((a, b) => b.cpuMillicores - a.cpuMillicores || b.memoryMiB - a.memoryMiB)
    .slice(0, clamp(limit, 1, 20));

  const namespaceTotals = new Map();
  for (const item of podMetrics?.items ?? []) {
    const usage = sumUsage(item?.containers ?? []);
    const namespace = item?.metadata?.namespace ?? "default";
    const current = namespaceTotals.get(namespace) ?? {
      namespace,
      pods: 0,
      cpuMillicores: 0,
      memoryMiB: 0,
    };
    current.pods += 1;
    current.cpuMillicores += usage.cpuMillicores;
    current.memoryMiB += usage.memoryMiB;
    namespaceTotals.set(namespace, current);
  }

  const sortedNamespaces = [...namespaceTotals.values()].sort(
    (a, b) => b.cpuMillicores - a.cpuMillicores || b.memoryMiB - a.memoryMiB,
  );

  const totalCpuUsage = nodes.reduce((sum, node) => sum + node.cpuMillicores, 0);
  const totalCpuAllocatable = nodes.reduce(
    (sum, node) => sum + node.cpuAllocatableMillicores,
    0,
  );
  const totalMemoryUsage = nodes.reduce((sum, node) => sum + node.memoryMiB, 0);
  const totalMemoryAllocatable = nodes.reduce(
    (sum, node) => sum + node.memoryAllocatableMiB,
    0,
  );

  return {
    live: true,
    source: "kubernetes-metrics-server",
    collectedAt: new Date().toISOString(),
    totals: {
      nodes: nodes.length,
      pods: (podMetrics?.items ?? []).length,
      namespaces: sortedNamespaces.length,
      cpuUsageMillicores: totalCpuUsage,
      cpuAllocatableMillicores: totalCpuAllocatable,
      memoryUsageMiB: totalMemoryUsage,
      memoryAllocatableMiB: totalMemoryAllocatable,
      cpuPercent: totalCpuAllocatable
        ? (totalCpuUsage / totalCpuAllocatable) * 100
        : 0,
      memoryPercent: totalMemoryAllocatable
        ? (totalMemoryUsage / totalMemoryAllocatable) * 100
        : 0,
    },
    nodes,
    pods,
    namespaces: sortedNamespaces,
    limit: clamp(limit, 1, 20),
  };
}
