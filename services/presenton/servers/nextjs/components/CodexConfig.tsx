"use client";
import { useEffect, useRef, useState } from "react";
import {
  Check,
  ChevronsUpDown,
  Loader2,
  LogIn,
  LogOut,
  RefreshCw,
  UserCheck,
} from "lucide-react";
import { Button } from "./ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "./ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface CodexConfigProps {
  codexModel: string;
  onInputChange: (value: string | boolean, field: string) => void;
}

type AuthStatus = "checking" | "unauthenticated" | "polling" | "authenticated";

interface StatusResponse {
  status: string;
  account_id?: string;
  detail?: string;
}

interface CodexModel {
  id: string;
  name: string;
}

const CHATGPT_MODELS: CodexModel[] = [
  { id: "gpt-5.1",               name: "GPT-5.1" },
  { id: "gpt-5.1-codex-max",     name: "GPT-5.1 Codex Max" },
  { id: "gpt-5.2",               name: "GPT-5.2" },
  { id: "gpt-5.2-codex",         name: "GPT-5.2 Codex" },
  { id: "gpt-5.3-codex",         name: "GPT-5.3 Codex" },
  { id: "gpt-5.4-mini",         name: "GPT-5.4 Mini" },
  { id: "gpt-5.4",               name: "GPT-5.4" },
];

const DEFAULT_CODEX_MODEL = "gpt-5.4-mini";

export default function CodexConfig({
  codexModel,
  onInputChange,
}: CodexConfigProps) {
  const [authStatus, setAuthStatus] = useState<AuthStatus>("checking");
  const [accountId, setAccountId] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [manualCode, setManualCode] = useState("");
  const [isExchanging, setIsExchanging] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [openModelSelect, setOpenModelSelect] = useState(false);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = () => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  };

  // Check current auth state on mount
  useEffect(() => {
    checkCurrentAuthStatus();
    return () => stopPolling();
  }, []);

  const checkCurrentAuthStatus = async () => {
    try {
      const res = await fetch("/api/v1/ppt/codex/auth/status");
      if (!res.ok) {
        setAuthStatus("unauthenticated");
        return;
      }
      const data: StatusResponse = await res.json();
      if (data.status === "authenticated") {
        setAuthStatus("authenticated");
        setAccountId(data.account_id ?? null);
      } else {
        setAuthStatus("unauthenticated");
      }
    } catch {
      setAuthStatus("unauthenticated");
    }
  };

  const handleSignIn = async () => {
    try {
      const res = await fetch("/api/v1/ppt/codex/auth/initiate", {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed to initiate auth");
      const data = await res.json();
      const { session_id, url } = data;

      setSessionId(session_id);
      setAuthStatus("polling");
      window.open(url, "_blank", "noopener,noreferrer");

      // Start polling the status endpoint every 2s
      pollIntervalRef.current = setInterval(async () => {
        try {
          const pollRes = await fetch(
            `/api/v1/ppt/codex/auth/status/${session_id}`
          );
          if (!pollRes.ok) return;
          const pollData: StatusResponse = await pollRes.json();

          if (pollData.status === "success") {
            stopPolling();
            setAuthStatus("authenticated");
            setAccountId(pollData.account_id ?? null);
            setSessionId(null);
            // Set a sensible default model if none chosen
            if (!codexModel) {
              onInputChange(DEFAULT_CODEX_MODEL, "codex_model");
            }
            toast.success("Signed in to ChatGPT successfully");
          } else if (pollData.status === "failed") {
            stopPolling();
            setAuthStatus("unauthenticated");
            toast.error("Authentication failed. Please try again.");
          }
        } catch {
          // keep polling on transient errors
        }
      }, 2000);
    } catch (err) {
      toast.error("Failed to start sign-in flow");
      setAuthStatus("unauthenticated");
    }
  };

  const handleManualExchange = async () => {
    if (!sessionId || !manualCode.trim()) return;
    setIsExchanging(true);
    try {
      const res = await fetch("/api/v1/ppt/codex/auth/exchange", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, code: manualCode.trim() }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Exchange failed");
      }
      const data = await res.json();
      stopPolling();
      setAuthStatus("authenticated");
      setAccountId(data.account_id);
      setSessionId(null);
      setManualCode("");
      if (!codexModel) {
        onInputChange(DEFAULT_CODEX_MODEL, "codex_model");
      }
      toast.success("Signed in to ChatGPT successfully");
    } catch (err: any) {
      toast.error(err.message || "Code exchange failed");
    } finally {
      setIsExchanging(false);
    }
  };

  const handleCancelPolling = () => {
    stopPolling();
    setSessionId(null);
    setManualCode("");
    setAuthStatus("unauthenticated");
  };

  const handleSignOut = async () => {
    setIsLoggingOut(true);
    try {
      await fetch("/api/v1/ppt/codex/auth/logout", { method: "POST" });
      setAuthStatus("unauthenticated");
      setAccountId(null);
      onInputChange("", "codex_model");
      toast.success("Signed out from ChatGPT");
    } catch {
      toast.error("Sign out failed");
    } finally {
      setIsLoggingOut(false);
    }
  };

  const handleRefreshToken = async () => {
    setIsRefreshing(true);
    try {
      const res = await fetch("/api/v1/ppt/codex/auth/refresh", {
        method: "POST",
      });
      if (!res.ok) throw new Error("Refresh failed");
      const data = await res.json();
      if (data.account_id) setAccountId(data.account_id);
      toast.success("Token refreshed successfully");
    } catch {
      toast.error("Token refresh failed. Please sign in again.");
      setAuthStatus("unauthenticated");
    } finally {
      setIsRefreshing(false);
    }
  };

  // ─── Checking ────────────────────────────────────────────────────────────
  if (authStatus === "checking") {
    return (
      <div className="flex items-center justify-center py-12 gap-3 text-gray-500">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="text-sm">Checking authentication status…</span>
      </div>
    );
  }

  // ─── Polling / waiting ───────────────────────────────────────────────────
  if (authStatus === "polling") {
    return (
      <div className="space-y-6">
        <div className="flex flex-col items-center gap-4 py-8 px-4 bg-blue-50 rounded-xl border border-blue-100">
          <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
          <div className="text-center">
            <p className="text-sm font-medium text-blue-900">
              Waiting for authentication…
            </p>
            <p className="text-xs text-blue-600 mt-1">
              Complete the sign-in in the browser tab that just opened.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleCancelPolling}
            className="text-gray-600"
          >
            Cancel
          </Button>
        </div>

        {/* Manual fallback */}
        <div className="space-y-3">
          <p className="text-sm font-medium text-gray-700">
            Didn&apos;t get redirected automatically?
          </p>
          <p className="text-xs text-gray-500">
            After completing the sign-in, paste the full redirect URL or
            authorization code below.
          </p>
          <input
            type="text"
            placeholder="Paste redirect URL or authorization code…"
            className="w-full px-4 py-2.5 outline-none border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors text-sm"
            value={manualCode}
            onChange={(e) => setManualCode(e.target.value)}
          />
          <Button
            onClick={handleManualExchange}
            disabled={isExchanging || !manualCode.trim()}
            className="w-full"
          >
            {isExchanging ? (
              <div className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Exchanging…
              </div>
            ) : (
              "Submit Code"
            )}
          </Button>
        </div>
      </div>
    );
  }

  // ─── Authenticated ───────────────────────────────────────────────────────
  if (authStatus === "authenticated") {
    return (
      <div className="space-y-6">
        {/* Account info */}
        <div className="flex items-center gap-3 p-4 bg-green-50 rounded-xl border border-green-100">
          <UserCheck className="w-6 h-6 text-green-600 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-green-900">
              Signed in to ChatGPT
            </p>
            {accountId && (
              <p className="text-xs text-green-700 truncate mt-0.5">
                Account: {accountId}
              </p>
            )}
          </div>
          <div className="flex gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefreshToken}
              disabled={isRefreshing}
              title="Refresh access token"
              className="text-gray-600 border-gray-300"
            >
              {isRefreshing ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5" />
              )}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleSignOut}
              disabled={isLoggingOut}
              className="text-red-600 border-red-200 hover:bg-red-50"
            >
              {isLoggingOut ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <LogOut className="w-3.5 h-3.5" />
              )}
              <span className="ml-1.5">Sign out</span>
            </Button>
          </div>
        </div>

        {/* Model selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-3">
            Select ChatGPT Model
          </label>
          <Popover open={openModelSelect} onOpenChange={setOpenModelSelect}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={openModelSelect}
                className="w-full h-12 px-4 py-4 outline-none border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors hover:border-gray-400 justify-between"
              >
                <span className="text-sm font-medium text-gray-900">
                  {codexModel
                    ? (CHATGPT_MODELS.find((m) => m.id === codexModel)?.name ?? codexModel)
                    : "Select a model"}
                </span>
                <ChevronsUpDown className="w-4 h-4 text-gray-500" />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              className="p-0"
              align="start"
              style={{ width: "var(--radix-popover-trigger-width)" }}
            >
              <Command>
                <CommandInput placeholder="Search models…" />
                <CommandList>
                  <CommandEmpty>No model found.</CommandEmpty>
                  <CommandGroup>
                    {CHATGPT_MODELS.map((model) => (
                      <CommandItem
                        key={model.id}
                        value={model.id}
                        onSelect={(value) => {
                          onInputChange(value, "codex_model");
                          setOpenModelSelect(false);
                        }}
                      >
                        <Check
                          className={cn(
                            "mr-2 h-4 w-4",
                            codexModel === model.id ? "opacity-100" : "opacity-0"
                          )}
                        />
                        <span className="text-sm font-medium text-gray-900">
                          {model.name}
                        </span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
          <p className="mt-2 text-xs text-gray-500 flex items-center gap-2">
            <span className="block w-1 h-1 rounded-full bg-gray-400" />
            Model availability depends on your ChatGPT subscription tier.
          </p>
        </div>
      </div>
    );
  }

  // ─── Unauthenticated ─────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <div className="p-4 bg-gray-50 rounded-xl border border-gray-200">
        <h3 className="text-sm font-semibold text-gray-900 mb-1">
          ChatGPT Plus / Pro
        </h3>
        <p className="text-sm text-gray-600">
          Sign in with your OpenAI account to use ChatGPT models directly via
          OAuth — no API key required.
        </p>
      </div>

      <Button
        onClick={handleSignIn}
        className="w-full h-12 gap-2 bg-[#10a37f] hover:bg-[#0e8f6f] text-white"
      >
        <LogIn className="w-4 h-4" />
        Sign in with ChatGPT
      </Button>

      <p className="text-xs text-gray-500 flex items-start gap-2">
        <span className="block w-1 h-1 rounded-full bg-gray-400 mt-1.5 shrink-0" />
        A browser window will open for you to authenticate with your OpenAI
        account. Your credentials are stored locally and never shared.
      </p>
    </div>
  );
}
