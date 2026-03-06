"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle, AlertCircle, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { useGateway } from "./gateway-provider";
import { GatewayInstallProgress } from "./gateway-install-progress";

type OverlayState = "installing" | "success" | "error" | "hidden";

export function InstallStatusBar() {
  const { gateway, refresh } = useGateway();
  const [overlayState, setOverlayState] = useState<OverlayState>("hidden");
  const [errorMsg, setErrorMsg] = useState("");
  const [profileName, setProfileName] = useState("");
  const activeDeployId = useRef<string | null>(null);

  // Track the deploy ID from gateway context
  useEffect(() => {
    const deployId = gateway?.deployId;
    if (deployId && deployId !== activeDeployId.current) {
      activeDeployId.current = deployId;
      setProfileName(gateway?.displayName || gateway?.profileName || "Gateway");
      setOverlayState("installing");
    } else if (!deployId && activeDeployId.current && overlayState === "installing") {
      // Deploy cleared externally (e.g. completed before SSE connected)
      activeDeployId.current = null;
      setOverlayState("hidden");
    }
  }, [gateway?.deployId, gateway?.displayName, gateway?.profileName, overlayState]);

  const handleComplete = () => {
    setOverlayState("success");
    refresh();
    toast.success(`${profileName} is ready`);
    // Auto-dismiss after 2 seconds
    setTimeout(() => {
      setOverlayState("hidden");
      activeDeployId.current = null;
    }, 2000);
  };

  const handleError = (error: string) => {
    setErrorMsg(error);
    setOverlayState("error");
    activeDeployId.current = null;
    refresh();
  };

  const handleDismiss = () => {
    setOverlayState("hidden");
    activeDeployId.current = null;
    setErrorMsg("");
  };

  return (
    <AnimatePresence>
      {overlayState !== "hidden" && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center"
          style={{ backgroundColor: "var(--mc-bg)" }}
        >
          <AnimatePresence mode="wait">
            {/* Installing */}
            {overlayState === "installing" && activeDeployId.current && (
              <motion.div
                key="installing"
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 1.02, y: -5 }}
                transition={{ duration: 0.35, ease: "easeOut" }}
              >
                <GatewayInstallProgress
                  deployId={activeDeployId.current}
                  profileName={profileName}
                  onComplete={handleComplete}
                  onError={handleError}
                />
              </motion.div>
            )}

            {/* Success */}
            {overlayState === "success" && (
              <motion.div
                key="success"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="text-center"
              >
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 300, damping: 20 }}
                  className="w-16 h-16 rounded-full mx-auto mb-6 flex items-center justify-center bg-emerald-500/10 border border-emerald-500/20"
                >
                  <CheckCircle className="w-8 h-8 text-emerald-400" />
                </motion.div>
                <h2
                  className="text-xl font-semibold mb-2"
                  style={{ color: "var(--mc-text)" }}
                >
                  {profileName} is Ready
                </h2>
                <p className="text-sm" style={{ color: "var(--mc-muted)" }}>
                  Loading your dashboard...
                </p>
              </motion.div>
            )}

            {/* Error */}
            {overlayState === "error" && (
              <motion.div
                key="error"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="text-center max-w-sm mx-auto"
              >
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 300, damping: 20 }}
                  className="w-16 h-16 rounded-full mx-auto mb-6 flex items-center justify-center bg-red-500/10 border border-red-500/20"
                >
                  <AlertCircle className="w-8 h-8 text-red-400" />
                </motion.div>
                <h2
                  className="text-xl font-semibold mb-2"
                  style={{ color: "var(--mc-text)" }}
                >
                  Setup Failed
                </h2>
                {errorMsg && (
                  <p
                    className="text-sm mb-6"
                    style={{ color: "var(--mc-muted)" }}
                  >
                    {errorMsg}
                  </p>
                )}
                <button
                  onClick={handleDismiss}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all text-white"
                  style={{ backgroundColor: "var(--mc-accent)" }}
                >
                  <ArrowRight className="w-3.5 h-3.5" />
                  Continue to Dashboard
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
