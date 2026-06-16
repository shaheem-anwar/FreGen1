/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef } from "react";
import { AppTheme } from "./ThemeSelector";

interface SoundVisualizerProps {
  analyser: AnalyserNode | null;
  theme: AppTheme;
  isPlaying: boolean;
}

export default function SoundVisualizer({ analyser, theme, isPlaying }: SoundVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Set dimensions responsive to parent
    const width = canvas.width;
    const height = canvas.height;

    const bufferLength = analyser ? analyser.frequencyBinCount : 64;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      animFrameRef.current = requestAnimationFrame(draw);

      if (analyser && isPlaying) {
        analyser.getByteFrequencyData(dataArray);
      } else {
        // Slowly decay existing drawing wave for smooth fallback active curves
        for (let i = 0; i < bufferLength; i++) {
          dataArray[i] = Math.max(0, dataArray[i] * 0.85 - 0.5);
        }
      }

      ctx.clearRect(0, 0, width, height);

      // Choose colors based on active theme choice
      let primaryColor = "#F59E0B"; // bright
      let secondaryColor = "#EF4444";
      if (theme === "dark") {
        primaryColor = "#06B6D4";
        secondaryColor = "#3B82F6";
      } else if (theme === "green-aurora") {
        primaryColor = "#10B981";
        secondaryColor = "#34D399";
      } else if (theme === "violet-doom") {
        primaryColor = "#D946EF";
        secondaryColor = "#8B5CF6";
      }

      const barWidth = (width / bufferLength) * 2.2;
      let barHeight;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        barHeight = (dataArray[i] / 255) * height * 0.95;

        // Gradient coloring
        const grad = ctx.createLinearGradient(0, height, 0, height - barHeight);
        grad.addColorStop(0, primaryColor);
        grad.addColorStop(1, secondaryColor);

        ctx.fillStyle = grad;

        // Custom rounded corners on sound viz blocks for aesthetic styling
        ctx.beginPath();
        ctx.roundRect(x, height - barHeight, barWidth - 1.5, barHeight, [2, 2, 0, 0]);
        ctx.fill();

        x += barWidth + 1;
      }

      // If playing, add a center-pulsing dynamic horizontal scanline representing spectral energy
      if (isPlaying) {
        let avgAmplitude = 0;
        for (let i = 0; i < bufferLength; i++) {
          avgAmplitude += dataArray[i];
        }
        avgAmplitude /= bufferLength;

        ctx.strokeStyle = secondaryColor;
        ctx.lineWidth = 1.5;
        ctx.shadowBlur = 8;
        ctx.shadowColor = primaryColor;
        
        ctx.beginPath();
        ctx.moveTo(0, height / 2);
        ctx.quadraticCurveTo(width / 2, (height / 2) - (avgAmplitude * 0.3), width, height / 2);
        ctx.stroke();

        ctx.shadowBlur = 0; // reset
      }
    };

    draw();

    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [analyser, theme, isPlaying]);

  return (
    <div className="relative w-full h-10 rounded-lg overflow-hidden bg-black/40 border border-white/5 flex items-center justify-center p-0.5">
      <canvas
        ref={canvasRef}
        width={300}
        height={36}
        className="w-full h-full block"
      />
      {!isPlaying && (
        <span className="absolute inset-0 flex items-center justify-center text-[10px] uppercase font-mono tracking-widest opacity-40 select-none">
          Synth Standby
        </span>
      )}
    </div>
  );
}
export { SoundVisualizer };
