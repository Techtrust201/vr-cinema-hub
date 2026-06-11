import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
} from "remotion";
import { loadFont } from "@remotion/google-fonts/Inter";

const { fontFamily } = loadFont("normal", {
  weights: ["400", "700", "900"],
  subsets: ["latin"],
});

export const Test360: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, width, height, durationInFrames } = useVideoConfig();

  // Slow horizontal drift of the grid (simulates slight camera rotation around equator)
  const drift = interpolate(frame, [0, durationInFrames], [0, 360]);

  // Title spring-in
  const titleSpring = spring({ frame: frame - 10, fps, config: { damping: 18, stiffness: 120 } });
  const titleY = interpolate(titleSpring, [0, 1], [40, 0]);

  const subSpring = spring({ frame: frame - 25, fps, config: { damping: 20, stiffness: 140 } });
  const subOpacity = interpolate(subSpring, [0, 1], [0, 1]);

  const seconds = (frame / fps).toFixed(1);

  // Equirectangular grid: longitudes every 30°, latitudes every 30°
  const longitudes = Array.from({ length: 12 }, (_, i) => i * 30); // 0..330
  const latitudes = Array.from({ length: 5 }, (_, i) => (i + 1) * 30); // 30,60,90,120,150 (skip poles)

  return (
    <AbsoluteFill
      style={{
        background:
          "linear-gradient(135deg, #0a0a0f 0%, #1a0b2e 35%, #7c3aed 65%, #06b6d4 100%)",
        fontFamily,
        color: "white",
        overflow: "hidden",
      }}
    >
      {/* Equirectangular SVG grid */}
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        style={{ position: "absolute", inset: 0, opacity: 0.5 }}
      >
        {/* Longitudes (vertical lines) — drift horizontally */}
        {longitudes.map((lon) => {
          const x = (((lon + drift) % 360) / 360) * width;
          return (
            <g key={`lon-${lon}`}>
              <line
                x1={x}
                y1={0}
                x2={x}
                y2={height}
                stroke="rgba(255,255,255,0.45)"
                strokeWidth={lon % 90 === 0 ? 3 : 1.5}
              />
              <text
                x={x + 8}
                y={height / 2 - 8}
                fill="rgba(255,255,255,0.7)"
                fontSize={22}
                fontWeight={700}
              >
                {lon}°
              </text>
            </g>
          );
        })}
        {/* Latitudes (horizontal lines) */}
        {latitudes.map((lat) => {
          const y = (lat / 180) * height;
          return (
            <g key={`lat-${lat}`}>
              <line
                x1={0}
                y1={y}
                x2={width}
                y2={y}
                stroke="rgba(255,255,255,0.35)"
                strokeWidth={lat === 90 ? 3 : 1}
                strokeDasharray={lat === 90 ? "none" : "8 6"}
              />
              <text x={16} y={y - 8} fill="rgba(255,255,255,0.6)" fontSize={20}>
                {lat - 90 > 0 ? `-${lat - 90}°` : `+${90 - lat}°`}
              </text>
            </g>
          );
        })}

        {/* Equator marker */}
        <text
          x={width / 2}
          y={height / 2 - 14}
          fill="#06b6d4"
          fontSize={26}
          fontWeight={900}
          textAnchor="middle"
        >
          EQUATOR
        </text>

        {/* Cardinal points on equator */}
        {[
          { label: "FRONT", lon: 0 },
          { label: "RIGHT", lon: 90 },
          { label: "BACK", lon: 180 },
          { label: "LEFT", lon: 270 },
        ].map(({ label, lon }) => {
          const x = (((lon + drift) % 360) / 360) * width;
          return (
            <text
              key={label}
              x={x}
              y={height / 2 + 40}
              fill="#7c3aed"
              fontSize={34}
              fontWeight={900}
              textAnchor="middle"
              stroke="black"
              strokeWidth={1}
            >
              {label}
            </text>
          );
        })}
      </svg>

      {/* Vignette */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.55) 100%)",
        }}
      />

      {/* Centered title block */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 14,
          transform: `translateY(${titleY}px)`,
          opacity: interpolate(titleSpring, [0, 1], [0, 1]),
        }}
      >
        <div
          style={{
            fontSize: 120,
            fontWeight: 900,
            letterSpacing: -4,
            textShadow: "0 6px 30px rgba(124,58,237,0.6)",
          }}
        >
          VR ULTIMATE
        </div>
        <div
          style={{
            fontSize: 36,
            fontWeight: 700,
            letterSpacing: 8,
            color: "#06b6d4",
            opacity: subOpacity,
          }}
        >
          TEST 360° · LOCATION
        </div>
      </div>

      {/* HUD bottom-left: timecode */}
      <div
        style={{
          position: "absolute",
          left: 32,
          bottom: 28,
          padding: "10px 18px",
          background: "rgba(10,10,15,0.7)",
          border: "1px solid rgba(124,58,237,0.6)",
          borderRadius: 8,
          fontSize: 22,
          fontWeight: 700,
          fontFamily: "monospace",
          color: "#06b6d4",
        }}
      >
        ▶ {seconds}s / 10.0s
      </div>

      {/* HUD bottom-right: serial */}
      <div
        style={{
          position: "absolute",
          right: 32,
          bottom: 28,
          padding: "10px 18px",
          background: "rgba(10,10,15,0.7)",
          border: "1px solid rgba(6,182,212,0.6)",
          borderRadius: 8,
          fontSize: 18,
          fontWeight: 700,
          fontFamily: "monospace",
          color: "white",
        }}
      >
        EQUIRECTANGULAR · 2:1 · 2048×1024
      </div>
    </AbsoluteFill>
  );
};