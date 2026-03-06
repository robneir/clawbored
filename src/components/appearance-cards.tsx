"use client";

import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { type Theme, type FontPreset, type StylePreset } from "@/lib/themes";

// ── Theme Card ──────────────────────────────────────────────

export function ThemeCard({
  theme,
  isSelected,
  onClick,
  index,
}: {
  theme: Theme;
  isSelected: boolean;
  onClick: () => void;
  index: number;
}) {
  return (
    <motion.button
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, duration: 0.3 }}
      onClick={onClick}
      className="group relative flex flex-col items-center gap-2 outline-none focus-visible:ring-2 focus-visible:ring-white/20 rounded-xl"
    >
      <div
        className="relative w-full aspect-[5/3] rounded-xl overflow-hidden border-2 transition-all duration-200"
        style={{
          backgroundColor: theme.bg,
          borderColor: isSelected ? theme.accent : "transparent",
        }}
      >
        <div
          className="absolute top-0 left-0 right-0 h-[6px]"
          style={{ backgroundColor: theme.accent }}
        />
        <div className="absolute top-[14px] left-3 right-3 space-y-[6px]">
          <div className="h-[4px] rounded-full w-3/4" style={{ backgroundColor: theme.text, opacity: 0.6 }} />
          <div className="h-[4px] rounded-full w-1/2" style={{ backgroundColor: theme.text, opacity: 0.3 }} />
          <div className="h-[4px] rounded-full w-2/3" style={{ backgroundColor: theme.text, opacity: 0.15 }} />
        </div>
        <div
          className="absolute bottom-2 left-3 right-3 h-[14px] rounded-md"
          style={{ backgroundColor: theme.surface, border: `1px solid ${theme.border}` }}
        />
        <div
          className="absolute top-[14px] right-3 w-[6px] h-[6px] rounded-full"
          style={{ backgroundColor: theme.text, opacity: 0.8 }}
        />
        {isSelected && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute inset-0 flex items-center justify-center"
            style={{ backgroundColor: "rgba(0,0,0,0.35)" }}
          >
            <div className="w-7 h-7 rounded-full flex items-center justify-center" style={{ backgroundColor: theme.accent }}>
              <Check className="w-4 h-4" style={{ color: theme.bg }} />
            </div>
          </motion.div>
        )}
      </div>
      <span
        className="text-xs font-medium transition-colors duration-200"
        style={{ color: isSelected ? "var(--mc-text)" : "var(--mc-muted)" }}
      >
        {theme.label}
      </span>
    </motion.button>
  );
}

// ── Font Card ───────────────────────────────────────────────

export function FontCard({
  font,
  isSelected,
  onClick,
  index,
}: {
  font: FontPreset;
  isSelected: boolean;
  onClick: () => void;
  index: number;
}) {
  return (
    <motion.button
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, duration: 0.3 }}
      onClick={onClick}
      className="group relative flex flex-col items-center gap-2 outline-none focus-visible:ring-2 focus-visible:ring-white/20 rounded-xl"
    >
      <div
        className="relative w-full aspect-[5/3] rounded-xl overflow-hidden border-2 transition-all duration-200 flex items-center justify-center"
        style={{
          backgroundColor: "var(--mc-surface)",
          borderColor: isSelected ? "var(--mc-accent)" : "var(--mc-border)",
        }}
      >
        <span
          className="text-lg font-semibold"
          style={{ fontFamily: font.bodyFont, color: "var(--mc-text)" }}
        >
          Aa
        </span>
        {isSelected && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute top-1.5 right-1.5"
          >
            <div
              className="w-5 h-5 rounded-full flex items-center justify-center"
              style={{ backgroundColor: "var(--mc-accent)" }}
            >
              <Check className="w-3 h-3 text-white" />
            </div>
          </motion.div>
        )}
      </div>
      <span
        className="text-xs font-medium transition-colors duration-200"
        style={{ color: isSelected ? "var(--mc-text)" : "var(--mc-muted)" }}
      >
        {font.label}
      </span>
    </motion.button>
  );
}

// ── Style Card ──────────────────────────────────────────────

export function StyleCard({
  style,
  isSelected,
  onClick,
  index,
}: {
  style: StylePreset;
  isSelected: boolean;
  onClick: () => void;
  index: number;
}) {
  return (
    <motion.button
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, duration: 0.3 }}
      onClick={onClick}
      className="group relative flex flex-col items-center gap-2 outline-none focus-visible:ring-2 focus-visible:ring-white/20 rounded-xl"
    >
      <div
        className="relative w-full aspect-[5/3] overflow-hidden border-2 transition-all duration-200 p-2 flex flex-col gap-1"
        style={{
          backgroundColor: "var(--mc-surface)",
          borderColor: isSelected ? "var(--mc-accent)" : "var(--mc-border)",
          borderRadius: style.radius,
        }}
      >
        <div
          className="flex-1 w-full"
          style={{
            backgroundColor: "var(--mc-bg)",
            border: `1px solid var(--mc-border)`,
            borderRadius: `calc(${style.radius} * 0.6)`,
            backdropFilter: style.glassBlur !== "0px" ? `blur(${style.glassBlur})` : "none",
          }}
        />
        <div className="flex gap-1">
          <div
            className="flex-1 h-2"
            style={{
              backgroundColor: "var(--mc-accent)",
              borderRadius: `calc(${style.radius} * 0.4)`,
              opacity: 0.6,
            }}
          />
          <div
            className="flex-1 h-2"
            style={{
              backgroundColor: "var(--mc-border)",
              borderRadius: `calc(${style.radius} * 0.4)`,
            }}
          />
        </div>
        {isSelected && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute top-1.5 right-1.5"
          >
            <div
              className="w-5 h-5 rounded-full flex items-center justify-center"
              style={{ backgroundColor: "var(--mc-accent)" }}
            >
              <Check className="w-3 h-3 text-white" />
            </div>
          </motion.div>
        )}
      </div>
      <span
        className="text-xs font-medium transition-colors duration-200"
        style={{ color: isSelected ? "var(--mc-text)" : "var(--mc-muted)" }}
      >
        {style.label}
      </span>
    </motion.button>
  );
}
