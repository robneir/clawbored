"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InstallProgressDialog } from "@/components/install-progress-dialog";
import {
  CheckCircle,
  XCircle,
  ExternalLink,
  Download,
  Eye,
  EyeOff,
  Key,
  Loader2,
  AlertCircle,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { MarkdownRenderer } from "@/components/markdown-renderer";

interface SkillInstallOption {
  id: string;
  kind: string;
  label: string;
  bins: string[];
}

interface MissingRequirements {
  bins: string[];
  anyBins: string[];
  env: string[];
  config: string[];
  os: string[];
}

interface SkillDetail {
  name: string;
  description: string;
  emoji: string;
  eligible: boolean;
  disabled: boolean;
  source: string;
  bundled: boolean;
  primaryEnv?: string;
  homepage?: string;
  missing: MissingRequirements;
  requirements: MissingRequirements;
  install: SkillInstallOption[];
  filePath: string;
  baseDir: string;
  skillMdContent: string;
  apiKeyConfigured: boolean;
}

interface SkillDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  skillName: string | null;
  onRefresh?: () => void;
}

export function SkillDetailDialog({
  open,
  onOpenChange,
  skillName,
  onRefresh,
}: SkillDetailDialogProps) {
  const [detail, setDetail] = useState<SkillDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "docs" | "setup">("overview");
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [savingKey, setSavingKey] = useState(false);
  const [installJobId, setInstallJobId] = useState<string | null>(null);
  const [installDialogOpen, setInstallDialogOpen] = useState(false);
  const [installTitle, setInstallTitle] = useState("");
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    if (open && skillName) {
      setActiveTab("overview");
      setApiKey("");
      setConfirmRemove(false);
      fetchDetail(skillName);
    }
  }, [open, skillName]);

  async function fetchDetail(name: string) {
    setLoading(true);
    try {
      const res = await fetch(`/api/skills/${encodeURIComponent(name)}`);
      if (res.ok) {
        setDetail(await res.json());
      }
    } catch {} finally {
      setLoading(false);
    }
  }

  async function handleSaveApiKey(e: React.FormEvent) {
    e.preventDefault();
    if (!apiKey || !skillName) return;

    setSavingKey(true);
    try {
      const res = await fetch(`/api/skills/${encodeURIComponent(skillName)}/configure`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Failed" }));
        throw new Error(data.error || "Failed to save API key");
      }
      toast.success("API key saved");
      setApiKey("");
      // Refresh detail
      if (skillName) fetchDetail(skillName);
      onRefresh?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save API key");
    } finally {
      setSavingKey(false);
    }
  }

  async function handleInstall(installOption: SkillInstallOption) {
    if (!skillName) return;

    try {
      const res = await fetch(`/api/skills/${encodeURIComponent(skillName)}/install`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ installId: installOption.id }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Failed" }));
        throw new Error(data.error || "Failed to start install");
      }
      const { jobId } = await res.json();
      setInstallTitle(installOption.label);
      setInstallJobId(jobId);
      setInstallDialogOpen(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to start install");
    }
  }

  function handleInstallComplete() {
    if (skillName) fetchDetail(skillName);
    onRefresh?.();
  }

  async function handleRemove() {
    if (!skillName) return;
    setRemoving(true);
    try {
      const res = await fetch(`/api/skills/${encodeURIComponent(skillName)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Failed" }));
        throw new Error(data.error || "Failed to remove skill");
      }
      toast.success(`Removed ${skillName}`);
      onOpenChange(false);
      onRefresh?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove skill");
    } finally {
      setRemoving(false);
      setConfirmRemove(false);
    }
  }

  const tabs = [
    { id: "overview" as const, label: "Overview" },
    { id: "docs" as const, label: "Documentation" },
    { id: "setup" as const, label: "Setup" },
  ];

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className="sm:max-w-2xl max-h-[85vh] overflow-hidden flex flex-col"
          style={{
            backgroundColor: "var(--mc-bg)",
            borderColor: "var(--mc-border)",
          }}
        >
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <DialogTitle className="sr-only">Loading skill details</DialogTitle>
              <div
                className="w-6 h-6 border-2 rounded-full animate-spin"
                style={{ borderColor: "var(--mc-border)", borderTopColor: "var(--mc-muted)" }}
              />
            </div>
          ) : detail ? (
            <>
              {/* Header */}
              <DialogHeader>
                <div className="flex items-center gap-3">
                  <span className="text-3xl">{detail.emoji || "🔧"}</span>
                  <div className="flex-1 min-w-0">
                    <DialogTitle className="flex items-center gap-2" style={{ color: "var(--mc-text)" }}>
                      {detail.name}
                      {detail.eligible ? (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-normal">
                          Ready
                        </span>
                      ) : (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 font-normal">
                          Missing Requirements
                        </span>
                      )}
                    </DialogTitle>
                    <p className="text-xs mt-1" style={{ color: "var(--mc-muted)" }}>
                      {detail.source}{detail.homepage && (
                        <>
                          {" · "}
                          <a
                            href={detail.homepage}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 underline underline-offset-2"
                            style={{ color: "var(--mc-accent)" }}
                          >
                            Homepage <ExternalLink className="w-3 h-3" />
                          </a>
                        </>
                      )}
                    </p>
                  </div>
                </div>
              </DialogHeader>

              {/* Tabs */}
              <div className="flex gap-1 -mx-1" style={{ borderBottom: "1px solid var(--mc-border)" }}>
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className="px-4 py-2.5 text-sm font-medium transition-all"
                    style={{
                      color: activeTab === tab.id ? "var(--mc-text)" : "var(--mc-muted)",
                      borderBottom: activeTab === tab.id ? "2px solid var(--mc-accent)" : "2px solid transparent",
                    }}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Tab content */}
              <div className="flex-1 overflow-y-auto min-h-0 py-2">
                {activeTab === "overview" && (
                  <div className="space-y-4">
                    {/* Description */}
                    <div
                      className="p-4 rounded-xl text-sm leading-relaxed"
                      style={{
                        backgroundColor: "var(--mc-surface)",
                        border: "1px solid var(--mc-border)",
                        color: "var(--mc-text)",
                        opacity: 0.85,
                      }}
                    >
                      {detail.description}
                    </div>

                    {/* Requirements */}
                    <div>
                      <h4 className="text-xs font-medium uppercase tracking-wider mb-3" style={{ color: "var(--mc-muted)" }}>
                        Requirements
                      </h4>
                      <div className="space-y-2">
                        {/* Binaries */}
                        {detail.requirements.bins.length > 0 && (
                          <div
                            className="p-3 rounded-xl"
                            style={{ backgroundColor: "var(--mc-surface)", border: "1px solid var(--mc-border)" }}
                          >
                            <span className="text-[11px] uppercase tracking-wider font-medium" style={{ color: "var(--mc-muted)", opacity: 0.7 }}>
                              Binaries
                            </span>
                            <div className="mt-2 space-y-1.5">
                              {detail.requirements.bins.map((bin) => {
                                const isMissing = detail.missing.bins.includes(bin);
                                return (
                                  <div key={bin} className="flex items-center gap-2 text-sm">
                                    {isMissing ? (
                                      <XCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
                                    ) : (
                                      <CheckCircle className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                                    )}
                                    <span className="font-mono text-xs" style={{ color: isMissing ? "var(--mc-muted)" : "var(--mc-text)" }}>
                                      {bin}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* anyBins */}
                        {detail.requirements.anyBins.length > 0 && (
                          <div
                            className="p-3 rounded-xl"
                            style={{ backgroundColor: "var(--mc-surface)", border: "1px solid var(--mc-border)" }}
                          >
                            <span className="text-[11px] uppercase tracking-wider font-medium" style={{ color: "var(--mc-muted)", opacity: 0.7 }}>
                              Any of these binaries
                            </span>
                            <div className="mt-2 space-y-1.5">
                              {detail.requirements.anyBins.map((bin) => {
                                const isMissing = detail.missing.anyBins.includes(bin);
                                return (
                                  <div key={bin} className="flex items-center gap-2 text-sm">
                                    {isMissing ? (
                                      <XCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
                                    ) : (
                                      <CheckCircle className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                                    )}
                                    <span className="font-mono text-xs" style={{ color: isMissing ? "var(--mc-muted)" : "var(--mc-text)" }}>
                                      {bin}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* Environment variables */}
                        {detail.requirements.env.length > 0 && (
                          <div
                            className="p-3 rounded-xl"
                            style={{ backgroundColor: "var(--mc-surface)", border: "1px solid var(--mc-border)" }}
                          >
                            <span className="text-[11px] uppercase tracking-wider font-medium" style={{ color: "var(--mc-muted)", opacity: 0.7 }}>
                              Environment Variables
                            </span>
                            <div className="mt-2 space-y-1.5">
                              {detail.requirements.env.map((env) => {
                                const isMissing = detail.missing.env.includes(env);
                                return (
                                  <div key={env} className="flex items-center gap-2 text-sm">
                                    {isMissing ? (
                                      <XCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
                                    ) : (
                                      <CheckCircle className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                                    )}
                                    <span className="font-mono text-xs" style={{ color: isMissing ? "var(--mc-muted)" : "var(--mc-text)" }}>
                                      {env}
                                    </span>
                                    {isMissing && detail.apiKeyConfigured && env === detail.primaryEnv && (
                                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400">
                                        configured in openclaw.json
                                      </span>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* Config requirements */}
                        {detail.requirements.config.length > 0 && (
                          <div
                            className="p-3 rounded-xl"
                            style={{ backgroundColor: "var(--mc-surface)", border: "1px solid var(--mc-border)" }}
                          >
                            <span className="text-[11px] uppercase tracking-wider font-medium" style={{ color: "var(--mc-muted)", opacity: 0.7 }}>
                              Config
                            </span>
                            <div className="mt-2 space-y-1.5">
                              {detail.requirements.config.map((cfg) => {
                                const isMissing = detail.missing.config.includes(cfg);
                                return (
                                  <div key={cfg} className="flex items-center gap-2 text-sm">
                                    {isMissing ? (
                                      <XCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
                                    ) : (
                                      <CheckCircle className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                                    )}
                                    <span className="font-mono text-xs" style={{ color: isMissing ? "var(--mc-muted)" : "var(--mc-text)" }}>
                                      {cfg}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* No requirements */}
                        {detail.requirements.bins.length === 0 &&
                         detail.requirements.anyBins.length === 0 &&
                         detail.requirements.env.length === 0 &&
                         detail.requirements.config.length === 0 && (
                          <div className="text-sm" style={{ color: "var(--mc-muted)" }}>
                            No external requirements — this skill is always available.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === "docs" && (
                  <div
                    className="rounded-xl p-4 overflow-x-auto"
                    style={{
                      backgroundColor: "var(--mc-surface)",
                      border: "1px solid var(--mc-border)",
                    }}
                  >
                    {detail.skillMdContent ? (
                      <MarkdownRenderer content={detail.skillMdContent} className="text-sm" />
                    ) : (
                      <p className="text-sm" style={{ color: "var(--mc-muted)" }}>
                        No documentation available.
                      </p>
                    )}
                  </div>
                )}

                {activeTab === "setup" && (
                  <div className="space-y-5">
                    {/* API Key config */}
                    {detail.primaryEnv && (
                      <div
                        className="p-4 rounded-xl"
                        style={{ backgroundColor: "var(--mc-surface)", border: "1px solid var(--mc-border)" }}
                      >
                        <div className="flex items-center gap-2 mb-3">
                          <Key className="w-4 h-4" style={{ color: "var(--mc-accent)" }} />
                          <h4 className="text-sm font-medium">API Key</h4>
                          {detail.apiKeyConfigured && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                              Configured
                            </span>
                          )}
                        </div>
                        <p className="text-xs mb-3" style={{ color: "var(--mc-muted)" }}>
                          Set <span className="font-mono">{detail.primaryEnv}</span> for this skill.
                          Saved to <span className="font-mono">openclaw.json</span>.
                        </p>
                        <form onSubmit={handleSaveApiKey} className="flex gap-2">
                          <div className="relative flex-1">
                            <Input
                              type={showKey ? "text" : "password"}
                              placeholder={detail.apiKeyConfigured ? "••••••• (update key)" : "Enter API key..."}
                              value={apiKey}
                              onChange={(e) => setApiKey(e.target.value)}
                              className="rounded-xl h-9 text-xs font-mono pr-8"
                              style={{
                                backgroundColor: "var(--mc-bg)",
                                borderColor: "var(--mc-border)",
                                color: "var(--mc-text)",
                              }}
                            />
                            <button
                              type="button"
                              onClick={() => setShowKey(!showKey)}
                              className="absolute right-2.5 top-1/2 -translate-y-1/2"
                              style={{ color: "var(--mc-muted)" }}
                            >
                              {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                          <Button
                            type="submit"
                            disabled={!apiKey || savingKey}
                            className="rounded-xl h-9 px-4 text-xs text-white"
                            style={{ backgroundColor: "var(--mc-accent)" }}
                          >
                            {savingKey ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Save"}
                          </Button>
                        </form>
                      </div>
                    )}

                    {/* Install options */}
                    {detail.install.length > 0 && (
                      <div>
                        <h4 className="text-xs font-medium uppercase tracking-wider mb-3" style={{ color: "var(--mc-muted)" }}>
                          Install Missing Dependencies
                        </h4>
                        <div className="space-y-2">
                          {detail.install.map((opt) => (
                            <div
                              key={opt.id}
                              className="flex items-center justify-between p-3 rounded-xl"
                              style={{ backgroundColor: "var(--mc-surface)", border: "1px solid var(--mc-border)" }}
                            >
                              <div>
                                <span className="text-sm font-medium" style={{ color: "var(--mc-text)" }}>
                                  {opt.label}
                                </span>
                                <span
                                  className="ml-2 text-[10px] px-1.5 py-0.5 rounded font-mono"
                                  style={{ backgroundColor: "var(--mc-bg)", color: "var(--mc-muted)" }}
                                >
                                  {opt.kind}
                                </span>
                              </div>
                              <Button
                                size="sm"
                                onClick={() => handleInstall(opt)}
                                className="rounded-xl h-8 px-3 text-xs gap-1.5 text-white"
                                style={{ backgroundColor: "var(--mc-accent)" }}
                              >
                                <Download className="w-3 h-3" />
                                Install
                              </Button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* No setup needed */}
                    {!detail.primaryEnv && detail.install.length === 0 && (
                      <div
                        className="flex items-center gap-3 p-4 rounded-xl"
                        style={{ backgroundColor: "var(--mc-surface)", border: "1px solid var(--mc-border)" }}
                      >
                        {detail.eligible ? (
                          <>
                            <CheckCircle className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                            <div>
                              <p className="text-sm font-medium" style={{ color: "var(--mc-text)" }}>
                                All set!
                              </p>
                              <p className="text-xs mt-0.5" style={{ color: "var(--mc-muted)" }}>
                                This skill is ready to use with no additional configuration.
                              </p>
                            </div>
                          </>
                        ) : (
                          <>
                            <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0" />
                            <div>
                              <p className="text-sm font-medium" style={{ color: "var(--mc-text)" }}>
                                Manual setup required
                              </p>
                              <p className="text-xs mt-0.5" style={{ color: "var(--mc-muted)" }}>
                                This skill has requirements that need to be installed manually.
                                Check the Overview tab for details.
                              </p>
                            </div>
                          </>
                        )}
                      </div>
                    )}

                    {/* Remove skill (non-bundled only) */}
                    {!detail.bundled && (
                      <div
                        className="p-4 rounded-xl mt-4"
                        style={{ border: "1px solid rgba(239,68,68,0.2)", backgroundColor: "rgba(239,68,68,0.05)" }}
                      >
                        <h4 className="text-sm font-medium mb-1 text-red-400">
                          Remove Skill
                        </h4>
                        <p className="text-xs mb-3" style={{ color: "var(--mc-muted)" }}>
                          This will delete the skill directory and any associated configuration.
                        </p>
                        {confirmRemove ? (
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              onClick={handleRemove}
                              disabled={removing}
                              className="rounded-xl h-8 px-4 text-xs gap-1.5 text-white bg-red-600 hover:bg-red-700"
                            >
                              {removing ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <Trash2 className="w-3 h-3" />
                              )}
                              Confirm Remove
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setConfirmRemove(false)}
                              disabled={removing}
                              className="rounded-xl h-8 px-3 text-xs"
                              style={{ color: "var(--mc-muted)" }}
                            >
                              Cancel
                            </Button>
                          </div>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setConfirmRemove(true)}
                            className="rounded-xl h-8 px-3 text-xs gap-1.5 text-red-400 hover:text-red-300"
                            style={{ border: "1px solid rgba(239,68,68,0.3)" }}
                          >
                            <Trash2 className="w-3 h-3" />
                            Remove this skill
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="py-8 text-center text-sm" style={{ color: "var(--mc-muted)" }}>
              <DialogTitle className="sr-only">Skill not found</DialogTitle>
              Skill not found
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Install progress dialog */}
      <InstallProgressDialog
        open={installDialogOpen}
        onOpenChange={setInstallDialogOpen}
        jobId={installJobId}
        title={installTitle}
        onComplete={handleInstallComplete}
      />
    </>
  );
}
