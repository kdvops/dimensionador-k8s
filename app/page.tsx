"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  formatCpuMillicores,
  formatMemoryMiB,
} from "./cluster-metrics.js";

type View = "planner" | "cluster";
type Profile = "general" | "compute" | "memory";

type ClusterNode = {
  name: string;
  cpuMillicores: number;
  memoryMiB: number;
  cpuAllocatableMillicores: number;
  memoryAllocatableMiB: number;
  cpuPercent: number;
  memoryPercent: number;
};

type ClusterPod = {
  namespace: string;
  name: string;
  node: string;
  cpuMillicores: number;
  memoryMiB: number;
};

type ClusterNamespace = {
  namespace: string;
  pods: number;
  cpuMillicores: number;
  memoryMiB: number;
};

type ClusterSnapshot = {
  live: boolean;
  source: string;
  reason?: string;
  collectedAt: string;
  totals: {
    nodes: number;
    pods: number;
    namespaces: number;
    cpuUsageMillicores: number;
    cpuAllocatableMillicores: number;
    memoryUsageMiB: number;
    memoryAllocatableMiB: number;
    cpuPercent: number;
    memoryPercent: number;
  };
  nodes: ClusterNode[];
  pods: ClusterPod[];
  namespaces: ClusterNamespace[];
  limit: number;
};

const profiles: Record<
  Profile,
  { label: string; cpu: number; ram: number; note: string }
> = {
  general: {
    label: "Balanceado",
    cpu: 16,
    ram: 64,
    note: "Aplicaciones web, APIs y servicios mixtos",
  },
  compute: {
    label: "CPU intensivo",
    cpu: 32,
    ram: 64,
    note: "Procesamiento, CI y cargas paralelas",
  },
  memory: {
    label: "Memoria intensiva",
    cpu: 16,
    ram: 128,
    note: "JVM, cachés, analítica y datos",
  },
};

const nf = new Intl.NumberFormat("es-DO", { maximumFractionDigits: 1 });
const percent = new Intl.NumberFormat("es-DO", { maximumFractionDigits: 0 });

function formatInteger(value: number) {
  return nf.format(Math.round(value));
}

function formatCompactPercent(value: number) {
  return `${percent.format(Math.max(0, value))}%`;
}

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat("es-DO", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

function TabButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      className={active ? "tab active" : "tab"}
      type="button"
      onClick={onClick}
      aria-pressed={active}
    >
      {children}
    </button>
  );
}

function StatCard({
  label,
  value,
  helper,
  tone = "neutral",
}: {
  label: string;
  value: string;
  helper: string;
  tone?: "neutral" | "orange" | "mint";
}) {
  return (
    <article className={`stat-card ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{helper}</small>
    </article>
  );
}

export default function Home() {
  const [view, setView] = useState<View>("planner");
  const [apps, setApps] = useState(20);
  const [replicas, setReplicas] = useState(2);
  const [cpu, setCpu] = useState(0.5);
  const [ram, setRam] = useState(1);
  const [storage, setStorage] = useState(500);
  const [growth, setGrowth] = useState(30);
  const [headroom, setHeadroom] = useState(25);
  const [ha, setHa] = useState(true);
  const [profile, setProfile] = useState<Profile>("general");
  const [clusterSnapshot, setClusterSnapshot] = useState<ClusterSnapshot | null>(
    null,
  );
  const [clusterStatus, setClusterStatus] = useState<
    "idle" | "loading" | "live" | "fallback" | "error"
  >("idle");
  const [clusterError, setClusterError] = useState<string | null>(null);
  const [clusterNonce, setClusterNonce] = useState(0);

  const planner = useMemo(() => {
    const selectedProfile = profiles[profile];
    const pods = apps * replicas;
    const multiplier = (1 + growth / 100) * (1 + headroom / 100);
    const reqCpu = pods * cpu * multiplier;
    const reqRam = pods * ram * multiplier;
    const usableCpu = selectedProfile.cpu * 0.78;
    const usableRam = selectedProfile.ram * 0.75;
    const capacity = Math.max(
      1,
      Math.ceil(Math.max(reqCpu / usableCpu, reqRam / usableRam)),
    );
    const workers = ha ? Math.max(3, capacity + 1) : Math.max(2, capacity);
    const physical = Math.ceil(storage * (1 + growth / 100) * (ha ? 3 : 2) * 1.2);

    return {
      pods,
      reqCpu,
      reqRam,
      workers,
      physical,
      totalCpu: workers * selectedProfile.cpu + (ha ? 12 : 4),
      totalRam: workers * selectedProfile.ram + (ha ? 48 : 16),
      cpuLoad: Math.round((reqCpu / (workers * usableCpu)) * 100),
      ramLoad: Math.round((reqRam / (workers * usableRam)) * 100),
    };
  }, [apps, replicas, cpu, ram, storage, growth, headroom, ha, profile]);

  const reset = () => {
    setApps(20);
    setReplicas(2);
    setCpu(0.5);
    setRam(1);
    setStorage(500);
    setGrowth(30);
    setHeadroom(25);
    setHa(true);
    setProfile("general");
  };

  useEffect(() => {
    if (view !== "cluster") return;
    const timer = setInterval(() => {
      setClusterNonce((value) => value + 1);
    }, 20_000);
    return () => clearInterval(timer);
  }, [view]);

  useEffect(() => {
    if (view !== "cluster") return;
    const controller = new AbortController();

    async function loadCluster() {
      setClusterStatus((current) => (current === "idle" ? "loading" : current));
      setClusterError(null);
      try {
        const response = await fetch(`/api/cluster?limit=8`, {
          signal: controller.signal,
          cache: "no-store",
        });
        if (!response.ok) {
          throw new Error(`Cluster API responded with ${response.status}`);
        }
        const snapshot = (await response.json()) as ClusterSnapshot;
        setClusterSnapshot(snapshot);
        setClusterStatus(snapshot.live ? "live" : "fallback");
      } catch (error) {
        if (controller.signal.aborted) return;
        setClusterStatus("error");
        setClusterError(
          error instanceof Error ? error.message : "No se pudieron leer las métricas",
        );
      }
    }

    setClusterStatus("loading");
    loadCluster();
    return () => controller.abort();
  }, [view, clusterNonce]);

  const refreshCluster = () => {
    setClusterNonce((value) => value + 1);
    if (view !== "cluster") setView("cluster");
  };

  const Field = ({
    label,
    value,
    setValue,
    min,
    max,
    step = 1,
    suffix,
  }: {
    label: string;
    value: number;
    setValue: (n: number) => void;
    min: number;
    max: number;
    step?: number;
    suffix: string;
  }) => (
    <label className="field">
      <span>{label}</span>
      <div className="input-wrap">
        <input
          aria-label={label}
          type="number"
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={(event) =>
            setValue(
              Math.min(max, Math.max(min, Number(event.target.value))),
            )
          }
        />
        <b>{suffix}</b>
      </div>
    </label>
  );

  const plannerView = (
    <>
      <section className="hero hero-planner" id="inicio">
        <div className="eyebrow">
          <span />
          PLANEACIÓN DE CAPACIDAD
        </div>
        <h1>
          Dimensiona tu clúster.
          <br />
          <em>Sin adivinar.</em>
        </h1>
        <p>
          Convierte la demanda de tus aplicaciones en una topología Kubernetes
          on-premise defendible, preparada para crecer y tolerar fallos.
        </p>
        <div className="hero-stats">
          <span>
            <b>CPU</b> basada en requests
          </span>
          <span>
            <b>HA</b> fallo de un nodo
          </span>
          <span>
            <b>STORAGE</b> réplica incluida
          </span>
        </div>
      </section>

      <section className="calculator">
        <div className="panel inputs-panel">
          <div className="section-heading">
            <span>01</span>
            <div>
              <h2>Define la demanda</h2>
              <p>Usa requests reales o una estimación conservadora.</p>
            </div>
          </div>
          <div className="form-grid">
            <Field
              label="Aplicaciones"
              value={apps}
              setValue={setApps}
              min={1}
              max={500}
              suffix="apps"
            />
            <Field
              label="Réplicas promedio"
              value={replicas}
              setValue={setReplicas}
              min={1}
              max={20}
              suffix="por app"
            />
            <Field
              label="CPU request promedio"
              value={cpu}
              setValue={setCpu}
              min={0.1}
              max={16}
              step={0.1}
              suffix="vCPU"
            />
            <Field
              label="RAM request promedio"
              value={ram}
              setValue={setRam}
              min={0.1}
              max={64}
              step={0.1}
              suffix="GiB"
            />
            <Field
              label="Datos útiles"
              value={storage}
              setValue={setStorage}
              min={10}
              max={100000}
              step={10}
              suffix="GiB"
            />
            <Field
              label="Crecimiento proyectado"
              value={growth}
              setValue={setGrowth}
              min={0}
              max={200}
              step={5}
              suffix="12 meses"
            />
          </div>

          <div className="divider" />

          <div className="section-heading compact">
            <span>02</span>
            <div>
              <h2>Selecciona la estrategia</h2>
            </div>
          </div>
          <div className="profiles" role="radiogroup">
            {(Object.keys(profiles) as Profile[]).map((key) => (
              <button
                key={key}
                className={profile === key ? "profile active" : "profile"}
                type="button"
                onClick={() => setProfile(key)}
                role="radio"
                aria-checked={profile === key}
              >
                <span className="radio" />
                <b>{profiles[key].label}</b>
                <small>
                  {profiles[key].cpu} vCPU · {profiles[key].ram} GiB
                </small>
                <p>{profiles[key].note}</p>
              </button>
            ))}
          </div>

          <div className="toggles">
            <label>
              <input
                type="checkbox"
                checked={ha}
                onChange={(event) => setHa(event.target.checked)}
              />
              <span />
              <div>
                <b>Alta disponibilidad</b>
                <small>3 control planes + capacidad N+1</small>
              </div>
            </label>
            <label className="range">
              <div>
                <b>Margen operativo</b>
                <small>Para picos y despliegues</small>
              </div>
              <strong>{headroom}%</strong>
              <input
                aria-label="Margen operativo"
                type="range"
                min="10"
                max="50"
                step="5"
                value={headroom}
                onChange={(event) => setHeadroom(Number(event.target.value))}
              />
            </label>
          </div>
        </div>

        <aside className="panel results-panel" aria-live="polite">
          <div className="result-title">
            <span>RECOMENDACIÓN</span>
            <i>Actualización instantánea</i>
          </div>
          <div className="node-count">
            <strong>{planner.workers}</strong>
            <div>
              <b>nodos worker</b>
              <small>
                {profiles[profile].cpu} vCPU · {profiles[profile].ram} GiB cada uno
              </small>
            </div>
          </div>
          <div className="topology">
            <h3>Topología sugerida</h3>
            <div className="topology-row">
              <div className="node-icons">
                {Array.from({ length: ha ? 3 : 1 }).map((_, index) => (
                  <span className="node control" key={index}>
                    C
                  </span>
                ))}
              </div>
              <p>
                <b>{ha ? 3 : 1} × Control plane</b>
                <small>4 vCPU · 16 GiB · SSD</small>
              </p>
            </div>
            <div className="topology-row">
              <div className="node-icons">
                {Array.from({ length: Math.min(planner.workers, 5) }).map((_, index) => (
                  <span className="node worker" key={index}>
                    W
                  </span>
                ))}
              </div>
              <p>
                <b>{planner.workers} × Workers</b>
                <small>
                  {profiles[profile].cpu} vCPU · {profiles[profile].ram} GiB
                </small>
              </p>
            </div>
          </div>
          <div className="capacity">
            <div>
              <span>
                CPU estimada <b>{nf.format(planner.reqCpu)} vCPU</b>
              </span>
              <div className="bar">
                <i style={{ width: `${Math.min(planner.cpuLoad, 100)}%` }} />
              </div>
              <small>{planner.cpuLoad}% de capacidad utilizable</small>
            </div>
            <div>
              <span>
                RAM estimada <b>{nf.format(planner.reqRam)} GiB</b>
              </span>
              <div className="bar">
                <i style={{ width: `${Math.min(planner.ramLoad, 100)}%` }} />
              </div>
              <small>{planner.ramLoad}% de capacidad utilizable</small>
            </div>
          </div>
          <div className="totals">
            <div>
              <small>CAPACIDAD BRUTA</small>
              <b>{planner.totalCpu} vCPU</b>
              <span>{planner.totalRam} GiB RAM</span>
            </div>
            <div>
              <small>ALMACENAMIENTO FÍSICO</small>
              <b>{nf.format(planner.physical / 1024)} TiB</b>
              <span>{ha ? "3 réplicas" : "2 réplicas"} + 20% libre</span>
            </div>
          </div>
          <div className="callout">
            <b>✓ Diseño {ha ? "tolerante" : "económico"}</b>
            <p>
              {ha
                ? "Conserva capacidad operativa ante la pérdida de un worker y mantiene quorum del control plane."
                : "Sin quorum HA. Recomendado solamente para laboratorios o desarrollo."}
            </p>
          </div>
        </aside>
      </section>

      <section className="method" id="metodo">
        <div className="eyebrow">
          <span />
          CÓMO CALCULAMOS
        </div>
        <h2>
          Capacidad que puedes usar,
          <br />
          no la que dice la etiqueta.
        </h2>
        <div className="method-grid">
          <article>
            <b>01</b>
            <h3>Demanda base</h3>
            <p>
              Multiplicamos aplicaciones, réplicas y requests promedio. El
              resultado refleja pods activos, no límites teóricos.
            </p>
          </article>
          <article>
            <b>02</b>
            <h3>Reserva y margen</h3>
            <p>
              Descontamos recursos para el sistema y añadimos crecimiento más
              margen para picos, rollouts y mantenimiento.
            </p>
          </article>
          <article>
            <b>03</b>
            <h3>Tolerancia N+1</h3>
            <p>
              En alta disponibilidad agregamos capacidad para perder un worker
              sin comprometer los requests calculados.
            </p>
          </article>
        </div>
      </section>

      <section className="assumptions" id="supuestos">
        <div>
          <h2>Supuestos del modelo</h2>
          <p>Una estimación transparente es más útil que una cifra falsa de precisión.</p>
        </div>
        <ul>
          <li>22% de CPU reservado por nodo</li>
          <li>25% de RAM reservada por nodo</li>
          <li>Storage con 20% de espacio libre</li>
          <li>Control plane en nodos dedicados</li>
          <li>Requests representativos</li>
          <li>No incluye GPU ni red</li>
        </ul>
      </section>

      <footer>
        <div className="brand">
          <span className="brand-mark">K</span>
          <span>KubeSize</span>
        </div>
        <p>
          Estimación inicial para planeación. Valida con pruebas de carga,
          observabilidad y requisitos del fabricante.
        </p>
        <a href="#inicio">Volver arriba ↑</a>
      </footer>
    </>
  );

  const clusterView = (
    <>
      <section className="hero hero-cluster" id="cluster">
        <div className="eyebrow">
          <span />
          TELEMETRÍA DEL CLUSTER
        </div>
        <h1>
          Recursos reales del clúster.
          <br />
          <em>Sin maquillar.</em>
        </h1>
        <p>
          CPU, RAM y pods más pesados leídos desde el metrics-server del clúster
          donde vive este proyecto.
        </p>
        <div className="hero-stats">
          <span>
            <b>{clusterSnapshot ? formatTimestamp(clusterSnapshot.collectedAt) : "--"}</b>
            última lectura
          </span>
          <span>
            <b>{clusterSnapshot?.source ?? "metrics-server"}</b>
            fuente activa
          </span>
          <span>
            <b>{clusterSnapshot?.live ? "LIVE" : "STANDBY"}</b>
            estado de datos
          </span>
        </div>
      </section>

      <section className="cluster-dashboard">
        <div className="dashboard-banner">
          <div>
            <p className="banner-label">Visión operativa</p>
            <h2>Quién consume más, dónde se concentra la presión y qué nodo sufre.</h2>
          </div>
          <button className="refresh-button" type="button" onClick={refreshCluster}>
            {clusterStatus === "loading" ? "Refrescando..." : "Refrescar métricas"}
          </button>
        </div>

        {clusterError ? (
          <div className="empty-state warning">
            <b>No pude leer métricas reales ahora mismo.</b>
            <p>{clusterError}</p>
            <small>
              El tablero queda listo para k3s con el ServiceAccount y el
              metrics-server habilitados. Si el entorno no expone la API, verás
              este mensaje en lugar de un dato falso.
            </small>
          </div>
        ) : null}

        <div className="stat-grid">
          <StatCard
            label="Nodos"
            value={String(clusterSnapshot?.totals.nodes ?? 0)}
            helper="Capacidad vista por metrics-server"
            tone="mint"
          />
          <StatCard
            label="Pods medidos"
            value={String(clusterSnapshot?.totals.pods ?? 0)}
            helper="Ordenados por consumo combinado"
            tone="orange"
          />
          <StatCard
            label="CPU usada"
            value={formatCpuMillicores(
              clusterSnapshot?.totals.cpuUsageMillicores ?? 0,
            )}
            helper={`${formatCompactPercent(clusterSnapshot?.totals.cpuPercent ?? 0)} de capacidad allocatable`}
          />
          <StatCard
            label="RAM usada"
            value={formatMemoryMiB(clusterSnapshot?.totals.memoryUsageMiB ?? 0)}
            helper={`${formatCompactPercent(clusterSnapshot?.totals.memoryPercent ?? 0)} de capacidad allocatable`}
          />
        </div>

        <div className="dashboard-grid">
          <section className="dashboard-panel">
            <div className="panel-header">
              <div>
                <span className="panel-kicker">Nodos</span>
                <h3>Presión por nodo</h3>
              </div>
              <small>CPU y memoria sobre allocatable</small>
            </div>
            <div className="node-list">
              {(clusterSnapshot?.nodes ?? []).map((node) => (
                <article className="node-card" key={node.name}>
                  <div className="node-card-top">
                    <strong>{node.name}</strong>
                    <span>
                      {formatCompactPercent(node.cpuPercent)} CPU ·{" "}
                      {formatCompactPercent(node.memoryPercent)} RAM
                    </span>
                  </div>
                  <div className="mini-bar">
                    <i style={{ width: `${Math.min(node.cpuPercent, 100)}%` }} />
                  </div>
                  <div className="node-stats">
                    <span>
                      {formatCpuMillicores(node.cpuMillicores)} /{" "}
                      {formatCpuMillicores(node.cpuAllocatableMillicores)}
                    </span>
                    <span>
                      {formatMemoryMiB(node.memoryMiB)} /{" "}
                      {formatMemoryMiB(node.memoryAllocatableMiB)}
                    </span>
                  </div>
                </article>
              ))}
              {clusterSnapshot?.nodes.length ? null : (
                <div className="empty-state">
                  <b>No hay nodos visibles.</b>
                  <p>En cuanto la API responda, este panel se llena automáticamente.</p>
                </div>
              )}
            </div>
          </section>

          <section className="dashboard-panel">
            <div className="panel-header">
              <div>
                <span className="panel-kicker">Pods calientes</span>
                <h3>Los que más pesan ahora</h3>
              </div>
              <small>Ordenados por consumo real</small>
            </div>
            <div className="pod-table">
              {(clusterSnapshot?.pods ?? []).map((pod, index) => (
                <article key={`${pod.namespace}/${pod.name}`} className="pod-row">
                  <span className="pod-rank">{index + 1}</span>
                  <div className="pod-meta">
                    <strong>{pod.name}</strong>
                    <small>
                      {pod.namespace} · {pod.node}
                    </small>
                  </div>
                  <div className="pod-usage">
                    <b>{formatCpuMillicores(pod.cpuMillicores)}</b>
                    <span>{formatMemoryMiB(pod.memoryMiB)}</span>
                  </div>
                </article>
              ))}
              {clusterSnapshot?.pods.length ? null : (
                <div className="empty-state">
                  <b>No hay pods medidos todavía.</b>
                  <p>
                    El tablero solo lista workloads que metrics-server ya logró
                    observar.
                  </p>
                </div>
              )}
            </div>
          </section>
        </div>

        <section className="dashboard-panel wide">
          <div className="panel-header">
            <div>
              <span className="panel-kicker">Namespaces</span>
              <h3>Concentración por espacio de nombres</h3>
            </div>
            <small>Útil para ver presión por dominio funcional</small>
          </div>
          <div className="namespace-grid">
            {(clusterSnapshot?.namespaces ?? []).map((entry) => (
              <article className="namespace-card" key={entry.namespace}>
                <strong>{entry.namespace}</strong>
                <span>{entry.pods} pods</span>
                <small>
                  {formatCpuMillicores(entry.cpuMillicores)} ·{" "}
                  {formatMemoryMiB(entry.memoryMiB)}
                </small>
              </article>
            ))}
            {clusterSnapshot?.namespaces.length ? null : (
              <div className="empty-state">
                <b>Sin datos por namespace.</b>
                <p>Se calcularán automáticamente con la siguiente lectura.</p>
              </div>
            )}
          </div>
        </section>

        <footer className="cluster-footer">
          <div className="brand">
            <span className="brand-mark">K</span>
            <span>Cluster View</span>
          </div>
          <p>
            Lectura directa del metrics-server del clúster. El pod necesita
            ServiceAccount con acceso a la API de Kubernetes.
          </p>
          <a href="#cluster">Volver arriba ↑</a>
        </footer>
      </section>
    </>
  );

  return (
    <main className={view === "cluster" ? "shell shell-cluster" : "shell shell-planner"}>
      <header className="topbar">
        <a className="brand" href="#inicio">
          <span className="brand-mark">K</span>
          <span>
            KubeSize <small>ON-PREM</small>
          </span>
        </a>
        <nav className="tabbar" aria-label="Secciones principales">
          <TabButton active={view === "planner"} onClick={() => setView("planner")}>
            Dimensionador
          </TabButton>
          <TabButton active={view === "cluster"} onClick={() => setView("cluster")}>
            Cluster en vivo
          </TabButton>
        </nav>
        <button
          className="top-action"
          type="button"
          onClick={view === "planner" ? reset : refreshCluster}
        >
          {view === "planner" ? "Restablecer" : "Actualizar"}
        </button>
      </header>

      {view === "planner" ? plannerView : clusterView}
    </main>
  );
}
