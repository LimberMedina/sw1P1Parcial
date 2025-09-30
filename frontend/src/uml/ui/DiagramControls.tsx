// src/uml/ui/DiagramControls.tsx
import { useEffect, useRef, useState } from "react";
import type { Graph } from "@antv/x6";
import { MiniMap } from "@antv/x6-plugin-minimap";
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

export default function DiagramControls({
  graph,
  tool,
  onToolClick,
  onSave,
  disabled = false,
  exportName = "diagram",
  onGetShareLink,
}: Props) {
  const minimapRef = useRef<HTMLDivElement | null>(null);
  const [sharing, setSharing] = useState(false);

  const [showExportMenu, setShowExportMenu] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        exportMenuRef.current &&
        !exportMenuRef.current.contains(event.target as Node)
      ) {
        setShowExportMenu(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!graph) return;
    if (!(graph as any).__exportInstalled) {
      graph.use(new Export());
      (graph as any).__exportInstalled = true;
    }
  }, [graph]);

  useEffect(() => {
    if (!graph || !minimapRef.current) return;
    if (!(graph as any).__minimapInstalled) {
      graph.use(
        new MiniMap({
          container: minimapRef.current,
          width: 200,
          height: 140,
          padding: 8,
        })
      );
      (graph as any).__minimapInstalled = true;
    }
  }, [graph]);

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

      // Capturar todo el contenedor en lugar del SVG específico
      const container = graph.container as HTMLElement;

      // Capturar todo el contenedor del graph
      const canvas = await html2canvas(container, {
        background: "#ffffff", // ← Cambiar backgroundColor por background

        useCORS: true,
        allowTaint: true,
      });

      // Convertir a blob y descargar
      canvas.toBlob(
        (blob) => {
          if (blob) {
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.download = `${exportName}.png`;
            link.href = url;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

            toast.success("PNG exportado correctamente ✅", {
              id: "export-png",
            });
          } else {
            toast.error("Error al generar PNG", { id: "export-png" });
          }
        },
        "image/png",
        1.0
      );
    } catch (error) {
      console.error("Error al exportar PNG:", error);
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

      // Capturar todo el contenedor en lugar del SVG
      const container = graph.container as HTMLElement;

      // Capturar imagen con mejor calidad
      const canvas = await html2canvas(container, {
        background: "#ffffff",

        useCORS: true,
        allowTaint: true,
      });

      // Crear PDF
      const pdf = new jsPDF({
        orientation: "landscape",
        unit: "mm",
        format: "a4",
      });

      // Convertir canvas a imagen
      const imgData = canvas.toDataURL("image/png", 1.0);

      // Dimensiones A4 landscape
      const pdfWidth = 297;
      const pdfHeight = 210;

      // Calcular dimensiones manteniendo aspecto
      const canvasAspect = canvas.width / canvas.height;
      const pdfAspect = pdfWidth / pdfHeight;

      let finalWidth = pdfWidth;
      let finalHeight = pdfHeight;

      if (canvasAspect > pdfAspect) {
        // La imagen es más ancha, ajustar por ancho
        finalHeight = pdfWidth / canvasAspect;
      } else {
        // La imagen es más alta, ajustar por alto
        finalWidth = pdfHeight * canvasAspect;
      }

      // Centrar la imagen en el PDF
      const offsetX = (pdfWidth - finalWidth) / 2;
      const offsetY = (pdfHeight - finalHeight) / 2;

      // Agregar imagen al PDF
      pdf.addImage(imgData, "PNG", offsetX, offsetY, finalWidth, finalHeight);

      // Descargar PDF
      pdf.save(`${exportName}.pdf`);

      toast.success("PDF exportado correctamente ✅", { id: "export-pdf" });
    } catch (error) {
      console.error("Error al exportar PDF:", error);
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
    // No deshabilitamos el botón; solo prevenimos doble-click rápido.
    if (sharing) return;

    if (!onGetShareLink) {
      toast.error("No hay handler para obtener el enlace de compartir.");
      return;
    }
    try {
      setSharing(true);
      const url = await onGetShareLink();
      if (typeof url === "string" && url.length > 0) {
        // Intento con Clipboard API
        try {
          await navigator.clipboard.writeText(url);
          toast.success("Enlace copiado al portapapeles 🔗");
        } catch {
          // Fallback: prompt
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

  // Solo para los demás botones (zoom/export/guardar)
  const toolbarDisabled = disabled || !graph;

  return (
    <>
      {/* Barra superior */}
      <div className="absolute left-1/2 top-4 z-10 -translate-x-1/2 rounded-2xl border border-gray-200 bg-white/90 px-2 py-1 shadow backdrop-blur">
        <div className="flex items-center gap-1">
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

          <button
            onClick={zoomOut}
            disabled={toolbarDisabled}
            title="Zoom out"
            className={
              "rounded-xl px-2 py-2 text-gray-700 hover:bg-gray-50" +
              (toolbarDisabled ? " opacity-50 cursor-not-allowed" : "")
            }
          >
            <IconZoomOut className="h-5 w-5" />
          </button>
          <button
            onClick={zoomIn}
            disabled={toolbarDisabled}
            title="Zoom in"
            className={
              "rounded-xl px-2 py-2 text-gray-700 hover:bg-gray-50" +
              (toolbarDisabled ? " opacity-50 cursor-not-allowed" : "")
            }
          >
            <IconZoomIn className="h-5 w-5" />
          </button>
          <button
            onClick={center}
            disabled={toolbarDisabled}
            title="Center"
            className={
              "rounded-xl px-2 py-2 text-gray-700 hover:bg-gray-50" +
              (toolbarDisabled ? " opacity-50 cursor-not-allowed" : "")
            }
          >
            <IconCenter className="h-5 w-5" />
          </button>

          {/* Guardar */}
          <button
            onClick={handleSave}
            disabled={toolbarDisabled}
            title="Guardar diagrama"
            className={
              "rounded-xl px-2 py-2 text-gray-700 hover:bg-gray-50" +
              (toolbarDisabled ? " opacity-50 cursor-not-allowed" : "")
            }
          >
            <Save className="h-5 w-5" />
          </button>

          <span className="mx-1 h-6 w-px bg-gray-200" />

          {/* Export con menú desplegable */}
          <div className="relative" ref={exportMenuRef}>
            <button
              onClick={() => setShowExportMenu(!showExportMenu)}
              disabled={toolbarDisabled}
              title="Exportar diagrama"
              className={
                "rounded-xl px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-1" +
                (toolbarDisabled ? " opacity-50 cursor-not-allowed" : "")
              }
            >
              <Download className="h-4 w-4" />
              Exportar
              <ChevronDown className="h-3 w-3" />
            </button>

            {/* Menú desplegable */}
            {showExportMenu && !toolbarDisabled && (
              <div className="absolute top-full mt-1 right-0 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[120px] z-20">
                <button
                  onClick={exportPNG}
                  className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                >
                  <span className="text-blue-500">🖼️</span>
                  Exportar PNG
                </button>
                <button
                  onClick={exportPDF}
                  className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                >
                  <span className="text-red-500">📄</span>
                  Exportar PDF
                </button>
              </div>
            )}
          </div>

          {/* Compartir (SIEMPRE habilitado) */}
          <span className="mx-1 h-6 w-px bg-gray-200" />
          <button
            onClick={handleShare}
            title="Compartir enlace del proyecto"
            className={
              "rounded-xl px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
            }
          >
            <Share2 className="h-5 w-5" />
            {sharing ? "Generando..." : "Compartir"}
          </button>
        </div>
      </div>

      {/* Minimap */}
      <div
        ref={minimapRef}
        className="pointer-events-auto absolute bottom-4 right-4 z-10 rounded-xl border border-gray-200 bg-white/90 p-2 shadow"
      />
    </>
  );
}
