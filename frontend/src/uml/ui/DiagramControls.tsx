import { useLayoutEffect, useEffect, useMemo, useRef, useState } from "react";
import ReactDOM from "react-dom";
import type { Graph } from "@antv/x6";
import { MiniMap as X6MiniMap } from "@antv/x6-plugin-minimap";
import { Export } from "@antv/x6-plugin-export";
import type { Tool } from "./Sidebar";
import { IconCenter, IconCursor, IconZoomIn, IconZoomOut } from "../icons";
import { Save, Share2, Download, ChevronDown } from "lucide-react";
import toast from "react-hot-toast";

type Props = {
  graph: Graph | null;
  tool: Tool;
  onToolClick: (t: Tool) => void;
  onSave?: () => Promise<void>;
  disabled?: boolean;
  exportName?: string;
  onGetShareLink?: () => Promise<string>;
  canShare?: boolean;
};

/** Crea u obtiene un div persistente en body (no se remueve nunca) */
function ensureRoot(id: string, style?: Partial<CSSStyleDeclaration>) {
  let el = document.getElementById(id) as HTMLDivElement | null;
  if (!el) {
    el = document.createElement("div");
    el.id = id;
    document.body.appendChild(el);
  }
  if (style) Object.assign(el.style, style);
  return el;
}

export default function DiagramControls({
  graph,
  tool,
  onToolClick,
  onSave,
  disabled = false,
  exportName = "diagram",
  onGetShareLink,
}: Props) {
  // ---- Estado mínimo de UI ----
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [sharing, setSharing] = useState(false);

  const exportMenuRef = useRef<HTMLDivElement>(null);

  // Cerrar menú al click afuera (seguro)
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        exportMenuRef.current &&
        !exportMenuRef.current.contains(e.target as Node)
      ) {
        setShowExportMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Instalar Export una sola vez por graph
  useLayoutEffect(() => {
    if (!graph) return;
    if (!(graph as any).__exportInstalled) {
      graph.use(new Export());
      (graph as any).__exportInstalled = true;
    }
  }, [graph]);

  // ========= Raíz persistente para TOOLBAR en <body> =========
  const toolbarRoot = useMemo(() => {
    if (typeof document === "undefined") return null;
    return ensureRoot("diagram-toolbar-root", {
      position: "fixed",
      left: "50%",
      top: "1rem",
      transform: "translateX(-50%)",
      zIndex: "60",
      pointerEvents: "none", // el contenedor no captura eventos
    });
  }, []);

  // ========= MiniMap FUERA de React en raíz persistente =========
  const minimapRoot = useMemo(() => {
    if (typeof document === "undefined") return null;
    return ensureRoot("x6-minimap-root", {
      position: "fixed",
      right: "1rem",
      bottom: "1rem",
      zIndex: "50",
      background: "rgba(255,255,255,0.9)",
      border: "1px solid #e5e7eb",
      borderRadius: "0.75rem",
      boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
      padding: "0.5rem",
      pointerEvents: "auto",
    });
  }, []);

  const minimapInstanceRef = useRef<X6MiniMap | null>(null);

  useLayoutEffect(() => {
    if (!graph || !minimapRoot) return;

    // Limpia contenido (NO remover root)
    minimapRoot.innerHTML = "";

    // Contenedor no-React para el plugin
    const inner = document.createElement("div");
    Object.assign(inner.style, {
      width: "200px",
      height: "140px",
      padding: "8px",
    } as CSSStyleDeclaration);
    minimapRoot.appendChild(inner);

    const mm = new X6MiniMap({
      container: inner,
      width: 200,
      height: 140,
      padding: 8,
    });
    graph.use(mm);
    minimapInstanceRef.current = mm;

    // Cleanup: dispose plugin, limpiar contenido (root persiste)
    return () => {
      try {
        minimapInstanceRef.current?.dispose?.();
      } catch {}
      minimapInstanceRef.current = null;
      minimapRoot.innerHTML = "";
    };
  }, [graph, minimapRoot]);

  // ===== Acciones =====
  const toolbarDisabled = disabled || !graph;
  const zoomIn = () => graph?.zoom(0.1);
  const zoomOut = () => graph?.zoom(-0.1);
  const center = () => graph?.centerContent();

  const exportPNG = async () => {
    setShowExportMenu(false);
    if (!graph) return;
    try {
      const nodes = graph.getNodes();
      if (nodes.length === 0) {
        toast.error("No hay contenido para exportar");
        return;
      }
      toast.loading("Generando PNG...", { id: "export-png" });
      const { default: html2canvas } = await import("html2canvas");
      const container = graph.container as HTMLElement;
      const canvas = await html2canvas(container, {
        background: "#ffffff",
        useCORS: true,
        allowTaint: true,
      });
      canvas.toBlob(
        (blob) => {
          if (!blob)
            return toast.error("Error al generar PNG", { id: "export-png" });
          const url = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.download = `${exportName}.png`;
          link.href = url;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
          toast.success("PNG exportado correctamente ✅", { id: "export-png" });
        },
        "image/png",
        1.0
      );
    } catch (err) {
      console.error("Error al exportar PNG:", err);
      toast.error("Error al exportar PNG", { id: "export-png" });
    }
  };

  const exportPDF = async () => {
    setShowExportMenu(false);
    if (!graph) return;
    try {
      const nodes = graph.getNodes();
      if (nodes.length === 0) {
        toast.error("No hay contenido para exportar");
        return;
      }
      toast.loading("Generando PDF...", { id: "export-pdf" });
      const { default: html2canvas } = await import("html2canvas");
      const { default: jsPDF } = await import("jspdf");
      const container = graph.container as HTMLElement;
      const canvas = await html2canvas(container, {
        background: "#ffffff",
        useCORS: true,
        allowTaint: true,
      });
      const pdf = new jsPDF({
        orientation: "landscape",
        unit: "mm",
        format: "a4",
      });
      const imgData = canvas.toDataURL("image/png", 1.0);
      const pdfWidth = 297;
      const pdfHeight = 210;
      const canvasAspect = canvas.width / canvas.height;
      const pdfAspect = pdfWidth / pdfHeight;
      let finalWidth = pdfWidth;
      let finalHeight = pdfHeight;
      if (canvasAspect > pdfAspect) finalHeight = pdfWidth / canvasAspect;
      else finalWidth = pdfHeight * canvasAspect;
      const offsetX = (pdfWidth - finalWidth) / 2;
      const offsetY = (pdfHeight - finalHeight) / 2;
      pdf.addImage(imgData, "PNG", offsetX, offsetY, finalWidth, finalHeight);
      pdf.save(`${exportName}.pdf`);
      toast.success("PDF exportado correctamente ✅", { id: "export-pdf" });
    } catch (err) {
      console.error("Error al exportar PDF:", err);
      toast.error("Error al exportar PDF", { id: "export-pdf" });
    }
  };

  const handleSave = async () => {
    if (!onSave) return;
    try {
      await onSave();
      toast.success("Diagrama guardado correctamente");
    } catch (e) {
      console.error("Error al guardar", e);
      toast.error("Error al guardar");
    }
  };

  const handleShare = async () => {
    if (sharing || !onGetShareLink) return;
    try {
      setSharing(true);
      const url = await onGetShareLink();
      if (typeof url === "string" && url.length > 0) {
        try {
          await navigator.clipboard.writeText(url);
          toast.success("Enlace copiado al portapapeles 🔗");
        } catch {
          window.prompt("Copia el enlace:", url);
          toast.success("Enlace generado. Cópialo desde el cuadro.");
        }
      } else {
        toast.error("No se pudo generar el enlace de compartir.");
      }
    } catch (err) {
      console.error("Compartir enlace error:", err);
      toast.error("Error al generar el enlace de compartir.");
    } finally {
      setSharing(false);
    }
  };

  // ===== Toolbar UI (portal) =====
  const toolbar = (
    <div
      role="toolbar"
      key="diagram-toolbar"
      style={{ pointerEvents: "auto" }} // reactivamos eventos en el hijo
      className="rounded-2xl border border-gray-200 bg-white/90 px-2 py-1 shadow backdrop-blur"
    >
      <div className="flex items-center gap-1">
        {/* Cursor */}
        <button
          onClick={() => onToolClick("cursor")}
          disabled={toolbarDisabled}
          className={
            "rounded-xl px-3 py-2 text-sm " +
            (tool === "cursor"
              ? "bg-gray-100 text-gray-900"
              : "text-gray-700 hover:bg-gray-50") +
            (toolbarDisabled ? " opacity-50 cursor-not-allowed" : "")
          }
          title="Cursor"
        >
          <IconCursor className="mr-1 inline h-4 w-4" />
          Cursor
        </button>

        <span className="mx-1 h-6 w-px bg-gray-200" />

        {/* Zoom */}
        <button
          onClick={zoomOut}
          disabled={toolbarDisabled}
          title="Zoom out"
          className="rounded-xl px-2 py-2 text-gray-700 hover:bg-gray-50"
        >
          <IconZoomOut className="h-5 w-5" />
        </button>
        <button
          onClick={zoomIn}
          disabled={toolbarDisabled}
          title="Zoom in"
          className="rounded-xl px-2 py-2 text-gray-700 hover:bg-gray-50"
        >
          <IconZoomIn className="h-5 w-5" />
        </button>
        <button
          onClick={center}
          disabled={toolbarDisabled}
          title="Center"
          className="rounded-xl px-2 py-2 text-gray-700 hover:bg-gray-50"
        >
          <IconCenter className="h-5 w-5" />
        </button>

        {/* Guardar */}
        {onSave && (
          <>
            <span className="mx-1 h-6 w-px bg-gray-200" />
            <button
              onClick={handleSave}
              disabled={toolbarDisabled}
              title="Guardar diagrama"
              className="rounded-xl px-2 py-2 text-gray-700 hover:bg-gray-50"
            >
              <Save className="h-5 w-5" />
            </button>
          </>
        )}

        <span className="mx-1 h-6 w-px bg-gray-200" />

        {/* Exportar */}
        <div className="relative" ref={exportMenuRef}>
          <button
            onClick={() => setShowExportMenu((v) => !v)}
            disabled={toolbarDisabled}
            className="rounded-xl px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-1"
          >
            <Download className="h-4 w-4" />
            Exportar
            <ChevronDown className="h-3 w-3" />
          </button>

          {showExportMenu && !toolbarDisabled && (
            <div className="absolute top-full mt-1 right-0 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[140px] z-20">
              <button
                onClick={exportPNG}
                className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
              >
                <span aria-hidden>🖼️</span>
                Exportar PNG
              </button>
              <button
                onClick={exportPDF}
                className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
              >
                <span aria-hidden>📄</span>
                Exportar PDF
              </button>
            </div>
          )}
        </div>

        {/* Compartir */}
        {onGetShareLink && (
          <>
            <span className="mx-1 h-6 w-px bg-gray-200" />
            <button
              onClick={handleShare}
              disabled={sharing}
              title="Compartir enlace del proyecto"
              className="rounded-xl px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
            >
              <Share2 className="h-5 w-5" />
              {sharing ? "Generando..." : "Compartir"}
            </button>
          </>
        )}
      </div>
    </div>
  );

  if (!toolbarRoot) return null;
  return ReactDOM.createPortal(toolbar, toolbarRoot);
}
