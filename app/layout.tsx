import type { Metadata } from "next";
import "./globals.css";
const title = "Dimensionador y Cluster Kubernetes On-Premise";
const description =
  "Calcula nodos, CPU, RAM y almacenamiento, y revisa métricas reales del clúster en una sola interfaz.";
export const metadata:Metadata={title,description,metadataBase:new URL("https://dimensionador-kubernetes-on-premise.sites.chatgpt.com"),openGraph:{title,description,type:"website",images:[{url:"/og.png",width:1200,height:630,alt:title}]},twitter:{card:"summary_large_image",title,description,images:["/og.png"]},icons:{icon:"/favicon.svg",shortcut:"/favicon.svg"}};
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){return <html lang="es"><head><meta name="codex-preview" content="development" /></head><body>{children}</body></html>}
