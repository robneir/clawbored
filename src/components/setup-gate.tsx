"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Rocket, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

const features = [
  "Create & manage AI agents",
  "Real-time chat with agents",
  "Scheduled tasks & cron jobs",
];

export function SetupGate() {
  return (
    <div className="flex items-center justify-center h-full">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="text-center max-w-md px-8"
      >
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.1, type: "spring", stiffness: 200, damping: 20 }}
          className="w-20 h-20 rounded-2xl mx-auto mb-8 flex items-center justify-center"
          style={{
            backgroundColor: "rgba(99, 102, 241, 0.08)",
            border: "1px solid rgba(99, 102, 241, 0.15)",
          }}
        >
          <Rocket className="w-10 h-10" style={{ color: "var(--mc-accent)", opacity: 0.8 }} />
        </motion.div>

        <h2 className="font-heading text-2xl font-semibold mb-3">
          Set Up Your Gateway
        </h2>
        <p
          className="text-sm mb-8 leading-relaxed"
          style={{ color: "var(--mc-muted)" }}
        >
          Clawboard needs a gateway to manage your AI agents.
          Connect or create one to unlock the full platform.
        </p>

        <Link href="/deploy">
          <Button
            className="rounded-xl px-8 h-12 text-sm font-medium gap-2 text-white"
            style={{ backgroundColor: "var(--mc-accent)" }}
          >
            <Rocket className="w-4 h-4" />
            Set Up Gateway
            <ArrowRight className="w-4 h-4 ml-1" />
          </Button>
        </Link>

        <div className="mt-10 space-y-3">
          {features.map((feature) => (
            <div
              key={feature}
              className="flex items-center gap-2 text-xs justify-center"
              style={{ color: "var(--mc-muted)", opacity: 0.5 }}
            >
              <div
                className="w-1 h-1 rounded-full"
                style={{ backgroundColor: "var(--mc-muted)" }}
              />
              {feature}
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
