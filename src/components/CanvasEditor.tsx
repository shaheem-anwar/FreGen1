/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from "react";
import { 
  Paintbrush, 
  Trash2, 
  Save, 
  X, 
  RotateCcw, 
  Type as TextIcon, 
  Sliders, 
  Undo,
  CheckCircle,
  Download
} from "lucide-react";
import { AppTheme } from "./ThemeSelector";

interface CanvasEditorProps {
  imageUrl: string;
  originalPrompt: string;
  theme: AppTheme;
  onSave: (editedDataUri: string) => void;
  onClose: () => void;
}

export default function CanvasEditor({ 
  imageUrl, 
  originalPrompt, 
  theme, 
  onSave, 
  onClose 
}: CanvasEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  
  // Filter sliders state
  const [brightness, setBrightness] = useState<number>(100);
  const [contrast, setContrast] = useState<number>(100);
  const [saturation, setSaturation] = useState<number>(100);
  const [grayscale, setGrayscale] = useState<number>(0);
  const [invert, setInvert] = useState<number>(0);
  const [blur, setBlur] = useState<number>(0);
  const [hueRotate, setHueRotate] = useState<number>(0);

  // Brush paint options
  const [isDrawing, setIsDrawing] = useState<boolean>(false);
  const [brushColor, setBrushColor] = useState<string>("#10B981");
  const [brushSize, setBrushSize] = useState<number>(8);
  const [isEraser, setIsEraser] = useState<boolean>(false);

  // Custom text stamp tool
  const [textStamp, setTextStamp] = useState<string>("");
  const [textSize, setTextSize] = useState<number>(24);
  const [textColor, setTextColor] = useState<string>("#FFFFFF");
  const [textX, setTextX] = useState<number>(50);
  const [textY, setTextY] = useState<number>(100);
  
  // History cache for undo mechanics
  const [history, setHistory] = useState<string[]>([]);
  const [originalBacking, setOriginalBacking] = useState<HTMLImageElement | null>(null);

  // Initialize canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      // Fit sizing logically inside maximum frame limits
      const maxDim = 800;
      let w = img.width;
      let h = img.height;

      if (w > maxDim || h > maxDim) {
        if (w > h) {
          h = Math.round((h * maxDim) / w);
          w = maxDim;
        } else {
          w = Math.round((w * maxDim) / h);
          h = maxDim;
        }
      }

      canvas.width = w;
      canvas.height = h;

      ctx.drawImage(img, 0, 0, w, h);
      setOriginalBacking(img);
      saveState();
    };
    img.src = imageUrl;
  }, [imageUrl]);

  const saveState = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setHistory((prev) => [...prev, canvas.toDataURL()]);
  };

  const handleUndo = () => {
    if (history.length <= 1) return;
    const previousStates = [...history];
    previousStates.pop(); // Pop current
    const targetState = previousStates[previousStates.length - 1];

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !targetState) return;

    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      setHistory(previousStates);
    };
    img.src = targetState;
  };

  // Run dynamic filter re-render of base image before layout painting overlays
  const applyFiltersAndRefresh = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !originalBacking) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Setup Context Filter standard
    ctx.filter = `
      brightness(${brightness}%)
      contrast(${contrast}%)
      saturate(${saturation}%)
      grayscale(${grayscale}%)
      invert(${invert}%)
      blur(${blur}px)
      hue-rotate(${hueRotate}deg)
    `;

    ctx.drawImage(originalBacking, 0, 0, canvas.width, canvas.height);
    ctx.filter = "none"; // Reset filter for drawing overlays
    saveState();
  };

  // Track cursor offsets for dynamic coordinate painting
  const getMouseCoords = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    
    // Scale appropriately based on bounding rect differences
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    };
  };

  const startDraw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const coords = getMouseCoords(e);
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx) return;

    ctx.beginPath();
    ctx.moveTo(coords.x, coords.y);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = isEraser ? "#000000" : brushColor;
    
    // Handle eraser alpha blending or pure subtractive destination-out
    if (isEraser) {
      ctx.globalCompositeOperation = "destination-out";
      ctx.lineWidth = brushSize * 2;
    } else {
      ctx.globalCompositeOperation = "source-over";
      ctx.lineWidth = brushSize;
    }

    setIsDrawing(true);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const coords = getMouseCoords(e);
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx) return;

    ctx.lineTo(coords.x, coords.y);
    ctx.stroke();
  };

  const endDraw = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    
    // Reset global composite back to standard drawing state
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (ctx) {
      ctx.globalCompositeOperation = "source-over";
    }
    saveState();
  };

  // Text layer baking
  const bakeTextStamp = () => {
    if (!textStamp.trim()) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    ctx.fillStyle = textColor;
    ctx.font = `bold ${textSize}px sans-serif`;
    ctx.lineWidth = 4;
    ctx.strokeStyle = "rgba(0,0,0,0.85)";
    ctx.strokeText(textStamp, textX, textY);
    ctx.fillText(textStamp, textX, textY);
    
    setTextStamp(""); // Clear text prompt
    saveState();
  };

  const handleClearDrawingAll = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !originalBacking) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(originalBacking, 0, 0, canvas.width, canvas.height);
    saveState();
    setHistory([]);
  };

  const handleExportSave = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL("image/png");
    onSave(dataUrl);
  };

  const handleDownloadOffline = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL("image/png");
    const link = document.createElement("a");
    link.download = `nvidia_edit_${Date.now()}.png`;
    link.href = dataUrl;
    link.click();
  };

  // Determine container styling matching theme parameters
  const isDark = theme !== "bright";
  const shellBg = isDark ? "bg-[#0b0c10]/95 text-slate-100" : "bg-[#FAF9F6]/95 text-slate-800";
  const borderCol = isDark ? "border-slate-800" : "border-amber-200/50";
  const cardCol = isDark ? "bg-[#161a22]" : "bg-white";

  return (
    <div className={`fixed inset-0 z-50 flex flex-col md:flex-row backdrop-blur-2xl p-4 md:p-6 select-none overflow-y-auto ${shellBg}`}>
      {/* Workspace Sidebar Left - Tools Panel */}
      <div className={`w-full md:w-80 flex flex-col gap-4 p-4 rounded-2xl border ${cardCol} ${borderCol} shrink-0 mb-4 md:mb-0`}>
        <div className="flex items-center justify-between border-b pb-3 border-slate-700/30">
          <div>
            <h3 className="font-bold text-sm tracking-wide uppercase font-mono text-emerald-500">
              Creative Lab
            </h3>
            <p className="text-[10px] opacity-70">
              NVIDIA NIM Post-Processor
            </p>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-black/10 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Tab 1: Colors & Brushes */}
        <div className="flex flex-col gap-3">
          <span className="text-[10px] font-bold tracking-widest uppercase font-mono text-indigo-400">
            🎨 Digital Paint Brush
          </span>
          
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsEraser(false)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                !isEraser 
                  ? "bg-indigo-600 text-white border-indigo-400" 
                  : "bg-black/5 hover:bg-black/10 text-slate-400 border-transparent"
              }`}
            >
              <Paintbrush size={13} />
              <span>Draw</span>
            </button>
            <button
              onClick={() => setIsEraser(true)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                isEraser 
                  ? "bg-amber-600 text-white border-amber-400" 
                  : "bg-black/5 hover:bg-black/10 text-slate-400 border-transparent"
              }`}
            >
              <Trash2 size={13} />
              <span>Eraser</span>
            </button>
          </div>

          {!isEraser && (
            <div className="flex flex-col gap-1.5">
              <span className="text-[10px] opacity-80">Brush Color:</span>
              <div className="flex flex-wrap gap-1.5">
                {["#EF4444", "#F59E0B", "#10B981", "#3B82F6", "#8B5CF6", "#EC4899", "#FFFFFF", "#000000"].map((col) => (
                  <button
                    key={col}
                    onClick={() => setBrushColor(col)}
                    className={`w-6 h-6 rounded-full border transition-transform ${
                      brushColor === col ? "scale-125 ring-2 ring-indigo-500" : "hover:scale-110"
                    }`}
                    style={{ backgroundColor: col }}
                  />
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between text-xs opacity-80">
              <span>Brush Size:</span>
              <span className="font-mono">{brushSize}px</span>
            </div>
            <input
              type="range"
              min="2"
              max="50"
              value={brushSize}
              onChange={(e) => setBrushSize(Number(e.target.value))}
              className="w-full accent-indigo-500"
            />
          </div>
        </div>

        {/* Tab 2: Visual CSS Filters */}
        <div className="flex flex-col gap-3 border-t pt-3 border-slate-700/30">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold tracking-widest uppercase font-mono text-emerald-400 flex items-center gap-1">
              <Sliders size={11} />
              <span>Pixel FX Filter Suite</span>
            </span>
            <button
              onClick={applyFiltersAndRefresh}
              className="text-[10px] flex items-center gap-1 font-semibold text-emerald-400 hover:underline"
              title="Apply sliders to primary canvas backing"
            >
              <RotateCcw size={10} />
              <span>Bake Sliders</span>
            </button>
          </div>

          {/* Slider collection */}
          <div className="flex flex-col gap-2 overflow-y-auto max-h-48 pr-1">
            {[
              { label: "Brightness", val: brightness, set: setBrightness, min: 20, max: 200, unit: "%" },
              { label: "Contrast", val: contrast, set: setContrast, min: 20, max: 200, unit: "%" },
              { label: "Saturation", val: saturation, set: setSaturation, min: 0, max: 200, unit: "%" },
              { label: "Grayscale", val: grayscale, set: setGrayscale, min: 0, max: 100, unit: "%" },
              { label: "Invert Color", val: invert, set: setInvert, min: 0, max: 100, unit: "%" },
              { label: "Hue Rotation", val: hueRotate, set: setHueRotate, min: 0, max: 360, unit: "°" },
              { label: "Blur FX", val: blur, set: setBlur, min: 0, max: 15, unit: "px" }
            ].map((slider) => (
              <div key={slider.label} className="flex flex-col gap-1">
                <div className="flex items-center justify-between text-[11px] opacity-80">
                  <span>{slider.label}:</span>
                  <span className="font-mono">{slider.val}{slider.unit}</span>
                </div>
                <input
                  type="range"
                  min={slider.min}
                  max={slider.max}
                  value={slider.val}
                  onChange={(e) => slider.set(Number(e.target.value))}
                  className="w-full accent-emerald-500 scale-90"
                />
              </div>
            ))}
          </div>
        </div>

        {/* Tab 3: Text Stamp Overlay */}
        <div className="flex flex-col gap-2.5 border-t pt-3 border-slate-700/30">
          <span className="text-[10px] font-bold tracking-widest uppercase font-mono text-fuchsia-400 flex items-center gap-1">
            <TextIcon size={12} />
            <span>Stamp Typography</span>
          </span>
          <input
            type="text"
            placeholder="Type word overlay..."
            value={textStamp}
            onChange={(e) => setTextStamp(e.target.value)}
            className="w-full text-xs px-3 py-1.5 rounded-lg bg-black/20 border border-white/10 focus:outline-none focus:ring-1 focus:ring-fuchsia-500"
          />

          {textStamp && (
            <div className="flex flex-col gap-2 p-2 bg-black/10 rounded-lg">
              <div className="grid grid-cols-2 gap-1.5 text-[10px]">
                <label className="flex flex-col">
                  <span>Size:</span>
                  <input
                    type="number"
                    value={textSize}
                    onChange={(e) => setTextSize(Number(e.target.value))}
                    className="bg-black/30 p-1 rounded font-mono"
                  />
                </label>
                <label className="flex flex-col">
                  <span>Color:</span>
                  <input
                    type="color"
                    value={textColor}
                    onChange={(e) => setTextColor(e.target.value)}
                    className="w-full h-6 rounded cursor-pointer"
                  />
                </label>
              </div>

              <div className="grid grid-cols-2 gap-1.5 text-[10px]">
                <label className="flex flex-col">
                  <span>Offset X:</span>
                  <input
                    type="range"
                    min="10"
                    max="500"
                    value={textX}
                    onChange={(e) => setTextX(Number(e.target.value))}
                    className="w-full accent-fuchsia-500"
                  />
                </label>
                <label className="flex flex-col">
                  <span>Offset Y:</span>
                  <input
                    type="range"
                    min="10"
                    max="500"
                    value={textY}
                    onChange={(e) => setTextY(Number(e.target.value))}
                    className="w-full accent-fuchsia-500"
                  />
                </label>
              </div>

              <button
                onClick={bakeTextStamp}
                className="w-full py-1 text-[10px] uppercase font-mono font-bold bg-fuchsia-600 text-white hover:bg-fuchsia-700 rounded-lg"
              >
                Apply Typography Layer
              </button>
            </div>
          )}
        </div>

        {/* Global actions: Undo & Clear */}
        <div className="flex items-center gap-2 border-t pt-3 mt-auto border-slate-700/30">
          <button
            onClick={handleUndo}
            disabled={history.length <= 1}
            className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs bg-slate-700/30 hover:bg-slate-700/60 disabled:opacity-40 transition-colors"
            title="Step backward one layer"
          >
            <Undo size={13} />
            <span>Undo</span>
          </button>
          <button
            onClick={handleClearDrawingAll}
            className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs bg-red-600/20 hover:bg-red-600/30 text-rose-300 transition-colors"
            title="Clear all overlays"
          >
            <Trash2 size={13} />
            <span>Clear FX</span>
          </button>
        </div>
      </div>

      {/* Editor Center Stage (Canvas Window) */}
      <div className="flex-1 flex flex-col items-center justify-center p-2 md:p-6 overflow-hidden relative">
        <div className="text-center mb-3">
          <span className="text-[10px] select-none uppercase font-mono px-2 py-0.5 rounded-full bg-indigo-500/15 border border-indigo-500/20 text-indigo-400">
            Interactive Layer Sandbox
          </span>
          <p className="text-xs opacity-60 italic mt-1 max-w-sm overflow-hidden text-ellipsis whitespace-nowrap">
            "{originalPrompt}"
          </p>
        </div>

        {/* Interactive canvas boundary */}
        <div className="relative shadow-[0_20px_50px_rgba(0,0,0,0.5)] rounded-2xl overflow-hidden max-w-full max-h-[80%] border border-white/10">
          <canvas
            ref={canvasRef}
            onMouseDown={startDraw}
            onMouseMove={draw}
            onMouseUp={endDraw}
            onMouseLeave={endDraw}
            className="cursor-crosshair block max-w-full max-h-[65vh] object-contain select-none"
          />
        </div>

        {/* Bottom export bar */}
        <div className="mt-4 flex flex-wrap items-center gap-2.5">
          <button
            onClick={handleDownloadOffline}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl bg-slate-800 text-slate-200 border border-slate-700 hover:bg-slate-700 transition"
          >
            <Download size={14} />
            <span>Download PNG</span>
          </button>

          <button
            onClick={handleExportSave}
            className="flex items-center gap-1.5 px-5 py-2 text-xs font-bold rounded-xl bg-gradient-to-r from-emerald-500 to-indigo-600 hover:from-emerald-400 hover:to-indigo-500 text-white shadow-lg transition-transform hover:-translate-y-0.5 active:translate-y-0"
          >
            <Save size={14} />
            <span>Bake Artwork to Gallery</span>
          </button>
        </div>
      </div>
    </div>
  );
}
export { Sliders };
