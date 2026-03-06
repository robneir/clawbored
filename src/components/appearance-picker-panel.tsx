"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Palette, Type, Layout, ArrowRight, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeCard, FontCard, StyleCard } from "@/components/appearance-cards";
import { useTheme } from "@/components/theme-provider";

type SubStep = "colors" | "fonts" | "styles";

const SUB_STEPS: { key: SubStep; label: string; icon: typeof Palette }[] = [
  { key: "colors", label: "Colors", icon: Palette },
  { key: "fonts", label: "Fonts", icon: Type },
  { key: "styles", label: "Styles", icon: Layout },
];

export function AppearancePickerPanel({ onContinue }: { onContinue: () => void }) {
  const {
    currentTheme, setTheme, themes,
    currentFont, setFont, fontPresets,
    currentStyle, setStyle, stylePresets,
  } = useTheme();
  const [subStep, setSubStep] = useState<SubStep>("colors");

  const currentIdx = SUB_STEPS.findIndex((s) => s.key === subStep);

  function handleNext() {
    if (subStep === "colors") setSubStep("fonts");
    else if (subStep === "fonts") setSubStep("styles");
    else onContinue();
  }

  function handleBack() {
    if (subStep === "fonts") setSubStep("colors");
    else if (subStep === "styles") setSubStep("fonts");
  }

  return (
    <div
      className="glass-card w-full max-w-md relative"
      style={{
        backgroundColor: "var(--mc-sidebar)",
        backdropFilter: "blur(40px)",
        boxShadow: "0 25px 60px rgba(0,0,0,0.5)",
      }}
    >
      <div className="p-6 pb-0">
        {/* Header */}
        <h2
          className="text-xl font-semibold mb-1 text-center"
          style={{ color: "var(--mc-text)" }}
        >
          Make It Yours
        </h2>
        <p className="text-xs text-center mb-5" style={{ color: "var(--mc-muted)" }}>
          Choose your theme, font, and style
        </p>

        {/* Sub-step indicator */}
        <div className="flex items-center justify-center gap-2 mb-5">
          {SUB_STEPS.map((s, i) => {
            const done = i < currentIdx;
            const active = i === currentIdx;
            const Icon = s.icon;
            return (
              <div key={s.key} className="flex items-center gap-2">
                {i > 0 && (
                  <div
                    className="w-6 h-px"
                    style={{
                      backgroundColor: done ? "var(--mc-accent)" : "var(--mc-border)",
                    }}
                  />
                )}
                <button
                  onClick={() => {
                    if (done) {
                      setSubStep(s.key);
                    }
                  }}
                  className="flex items-center gap-1.5 transition-all"
                  style={{ cursor: done ? "pointer" : "default" }}
                >
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center transition-all"
                    style={{
                      backgroundColor: done
                        ? "var(--mc-accent)"
                        : active
                        ? "rgba(99, 102, 241, 0.15)"
                        : "var(--mc-surface)",
                      border: active
                        ? "1.5px solid var(--mc-accent)"
                        : "1px solid var(--mc-border)",
                    }}
                  >
                    <Icon
                      className="w-3 h-3"
                      style={{
                        color: done ? "white" : active ? "var(--mc-accent)" : "var(--mc-muted)",
                      }}
                    />
                  </div>
                  <span
                    className="text-[11px] font-medium hidden sm:inline"
                    style={{
                      color: active ? "var(--mc-text)" : done ? "var(--mc-accent)" : "var(--mc-muted)",
                    }}
                  >
                    {s.label}
                  </span>
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Card grid */}
      <div className="px-6 overflow-y-auto" style={{ maxHeight: "45vh" }}>
        <AnimatePresence mode="wait">
          {subStep === "colors" && (
            <motion.div
              key="colors"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
              className="grid grid-cols-3 sm:grid-cols-4 gap-2.5"
            >
              {themes.map((theme, i) => (
                <ThemeCard
                  key={theme.name}
                  theme={theme}
                  isSelected={currentTheme.name === theme.name}
                  onClick={() => setTheme(theme)}
                  index={i}
                />
              ))}
            </motion.div>
          )}
          {subStep === "fonts" && (
            <motion.div
              key="fonts"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
              className="grid grid-cols-3 sm:grid-cols-4 gap-2.5"
            >
              {fontPresets.map((font, i) => (
                <FontCard
                  key={font.name}
                  font={font}
                  isSelected={currentFont.name === font.name}
                  onClick={() => setFont(font)}
                  index={i}
                />
              ))}
            </motion.div>
          )}
          {subStep === "styles" && (
            <motion.div
              key="styles"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
              className="grid grid-cols-3 sm:grid-cols-4 gap-2.5"
            >
              {stylePresets.map((s, i) => (
                <StyleCard
                  key={s.name}
                  style={s}
                  isSelected={currentStyle.name === s.name}
                  onClick={() => setStyle(s)}
                  index={i}
                />
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Footer */}
      <div className="p-6 pt-5">
        <div className="flex items-center gap-2">
          {subStep !== "colors" && (
            <Button
              onClick={handleBack}
              variant="ghost"
              className="rounded-xl h-11 px-4 text-sm font-medium gap-2"
              style={{ color: "var(--mc-muted)", border: "1px solid var(--mc-border)" }}
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </Button>
          )}
          <Button
            onClick={handleNext}
            className="flex-1 rounded-xl h-11 text-sm font-medium gap-2 text-white"
            style={{ backgroundColor: "var(--mc-accent)" }}
          >
            {subStep === "styles" ? "Continue" : "Next"}
            <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
        <p
          className="text-[11px] mt-3 text-center"
          style={{ color: "var(--mc-muted)", opacity: 0.6 }}
        >
          You can change this anytime in Settings
        </p>
      </div>
    </div>
  );
}
