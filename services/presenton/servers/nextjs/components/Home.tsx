"use client";
import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Download, CheckCircle } from "lucide-react";
import { useSelector } from "react-redux";
import { RootState } from "@/store/store";
import { handleSaveLLMConfig } from "@/utils/storeHelpers";
import LLMProviderSelection from "./LLMSelection";
import {
  checkIfSelectedOllamaModelIsPulled,
  pullOllamaModel,
} from "@/utils/providerUtils";
import { LLMConfig } from "@/types/llm_config";
import { trackEvent, MixpanelEvent } from "@/utils/mixpanel";
import { usePathname } from "next/navigation";
import OnBoardingSlidebar from "./OnBoarding/OnBoardingSlidebar";
import OnBoardingHeader from "./OnBoarding/OnBoardingHeader";
import ModeSelectStep from "./OnBoarding/ModeSelectStep";
import PresentonMode from "./OnBoarding/PresentonMode";
import GenerationWithImage from "./OnBoarding/GenerationWithImage";
import FinalStep from "./OnBoarding/FinalStep";

// Button state interface
interface ButtonState {
  isLoading: boolean;
  isDisabled: boolean;
  text: string;
  showProgress: boolean;
  progressPercentage?: number;
  status?: string;
}

const FINAL_STEP_CONFETTI_PIECES = [
  // left: denser at top
  { side: "left", offset: 1, top: 3, width: 28, height: 10, color: "#F59E0B", rotate: 12 },
  { side: "left", offset: 7, top: 5, width: 18, height: 7, color: "#7C3AED", rotate: -10 },
  { side: "left", offset: 12, top: 7, width: 20, height: 7, color: "#14B8A6", rotate: 22 },
  { side: "left", offset: 3, top: 10, width: 22, height: 8, color: "#22C55E", rotate: -18 },
  { side: "left", offset: 9, top: 12, width: 24, height: 8, color: "#E11D48", rotate: 18 },
  { side: "left", offset: 14, top: 15, width: 18, height: 7, color: "#F43F5E", rotate: 23 },
  { side: "left", offset: 5, top: 18, width: 20, height: 7, color: "#0EA5E9", rotate: -12 },
  { side: "left", offset: 11, top: 21, width: 26, height: 9, color: "#2563EB", rotate: 20 },
  { side: "left", offset: 2, top: 24, width: 19, height: 7, color: "#14B8A6", rotate: -16 },
  { side: "left", offset: 8, top: 28, width: 21, height: 8, color: "#FB7185", rotate: 27 },
  { side: "left", offset: 13, top: 32, width: 20, height: 7, color: "#06B6D4", rotate: 16 },
  { side: "left", offset: 3, top: 36, width: 24, height: 9, color: "#EAB308", rotate: -22 },
  { side: "left", offset: 10, top: 41, width: 18, height: 7, color: "#A855F7", rotate: -14 },
  { side: "left", offset: 2, top: 50, width: 30, height: 10, color: "#EC4899", rotate: -28 },
  { side: "left", offset: 13, top: 58, width: 19, height: 7, color: "#22C55E", rotate: 17 },
  { side: "left", offset: 5, top: 66, width: 24, height: 8, color: "#8B5CF6", rotate: 14 },
  { side: "left", offset: 11, top: 74, width: 18, height: 7, color: "#3B82F6", rotate: 12 },
  { side: "left", offset: 4, top: 82, width: 20, height: 7, color: "#14B8A6", rotate: 21 },
  { side: "left", offset: 7, top: 90, width: 24, height: 8, color: "#D946EF", rotate: -26 },

  // right: denser at top
  { side: "right", offset: 1, top: 4, width: 30, height: 10, color: "#F97316", rotate: -14 },
  { side: "right", offset: 8, top: 6, width: 19, height: 7, color: "#0EA5E9", rotate: 12 },
  { side: "right", offset: 13, top: 9, width: 20, height: 7, color: "#22C55E", rotate: -20 },
  { side: "right", offset: 4, top: 12, width: 24, height: 8, color: "#EC4899", rotate: 20 },
  { side: "right", offset: 10, top: 15, width: 22, height: 8, color: "#06B6D4", rotate: -18 },
  { side: "right", offset: 15, top: 18, width: 20, height: 7, color: "#22C55E", rotate: -25 },
  { side: "right", offset: 5, top: 21, width: 18, height: 7, color: "#8B5CF6", rotate: 19 },
  { side: "right", offset: 12, top: 24, width: 21, height: 8, color: "#F43F5E", rotate: 14 },
  { side: "right", offset: 2, top: 28, width: 26, height: 9, color: "#84CC16", rotate: 15 },
  { side: "right", offset: 9, top: 33, width: 21, height: 8, color: "#F97316", rotate: -11 },
  { side: "right", offset: 14, top: 38, width: 20, height: 7, color: "#A855F7", rotate: -19 },
  { side: "right", offset: 4, top: 44, width: 19, height: 7, color: "#F43F5E", rotate: 20 },
  { side: "right", offset: 2, top: 52, width: 28, height: 10, color: "#FACC15", rotate: 25 },
  { side: "right", offset: 12, top: 60, width: 18, height: 7, color: "#14B8A6", rotate: -15 },
  { side: "right", offset: 6, top: 68, width: 24, height: 8, color: "#22C55E", rotate: -17 },
  { side: "right", offset: 1, top: 76, width: 20, height: 7, color: "#A855F7", rotate: 14 },
  { side: "right", offset: 13, top: 84, width: 20, height: 7, color: "#3B82F6", rotate: -24 },
  { side: "right", offset: 5, top: 92, width: 26, height: 9, color: "#EAB308", rotate: 18 },
] as const;

const getTaperedSideOffset = (offset: number, top: number) => {
  const taperMultiplier = Math.max(0.72, 1.85 - top * 0.012);
  return Math.min(29, Number((offset * taperMultiplier).toFixed(2)));
};

export default function Home() {
  const router = useRouter();
  const pathname = usePathname();
  const [step, setStep] = useState<number>(1)
  const [selectedMode, setSelectedMode] = useState<string>("presenton")
  const config = useSelector((state: RootState) => state.userConfig);
  const [llmConfig, setLlmConfig] = useState<LLMConfig>(config.llm_config);

  const [downloadingModel, setDownloadingModel] = useState<{
    name: string;
    size: number | null;
    downloaded: number | null;
    status: string;
    done: boolean;
  } | null>(null);
  const [showDownloadModal, setShowDownloadModal] = useState<boolean>(false);
  const [buttonState, setButtonState] = useState<ButtonState>({
    isLoading: false,
    isDisabled: false,
    text: "Save Configuration",
    showProgress: false
  });

  const canChangeKeys = config.can_change_keys;
  const downloadProgress = useMemo(() => {
    if (downloadingModel && downloadingModel.downloaded !== null && downloadingModel.size !== null) {
      return Math.round((downloadingModel.downloaded / downloadingModel.size) * 100);
    }
    return 0;
  }, [downloadingModel?.downloaded, downloadingModel?.size]);

  const handleSaveConfig = async () => {
    trackEvent(MixpanelEvent.Home_SaveConfiguration_Button_Clicked, { pathname });
    try {
      setButtonState(prev => ({
        ...prev,
        isLoading: true,
        isDisabled: true,
        text: "Saving Configuration..."
      }));
      // API: save config
      trackEvent(MixpanelEvent.Home_SaveConfiguration_API_Call);
      // API CALL: save config
      await handleSaveLLMConfig(llmConfig);

      if (llmConfig.LLM === "ollama" && llmConfig.OLLAMA_MODEL) {
        // API: check model pulled
        trackEvent(MixpanelEvent.Home_CheckOllamaModelPulled_API_Call);
        const isPulled = await checkIfSelectedOllamaModelIsPulled(llmConfig.OLLAMA_MODEL);
        if (!isPulled) {
          setShowDownloadModal(true);
          // API: download model
          trackEvent(MixpanelEvent.Home_DownloadOllamaModel_API_Call);
          await handleModelDownload();
        }
      }
      toast.info("Configuration saved successfully");
      setButtonState(prev => ({
        ...prev,
        isLoading: false,
        isDisabled: false,
        text: "Save Configuration"
      }));
      // Track navigation from -> to
      trackEvent(MixpanelEvent.Navigation, { from: pathname, to: "/upload" });
      router.push("/upload");
    } catch (error) {
      toast.info(error instanceof Error ? error.message : "Failed to save configuration");
      setButtonState(prev => ({
        ...prev,
        isLoading: false,
        isDisabled: false,
        text: "Save Configuration"
      }));
    }
  };

  const handleModelDownload = async () => {
    try {
      await pullOllamaModel(llmConfig.OLLAMA_MODEL!, setDownloadingModel);
    }
    finally {
      setDownloadingModel(null);
      setShowDownloadModal(false);
    }
  };


  useEffect(() => {
    if (downloadingModel && downloadingModel.downloaded !== null && downloadingModel.size !== null) {
      const percentage = Math.round(((downloadingModel.downloaded / downloadingModel.size) * 100));
      setButtonState({
        isLoading: true,
        isDisabled: true,
        text: `Downloading Model (${percentage}%)`,
        showProgress: true,
        progressPercentage: percentage,
        status: downloadingModel.status
      });
    }

    if (downloadingModel && downloadingModel.done) {
      setTimeout(() => {
        setShowDownloadModal(false);
        setDownloadingModel(null);
        toast.info("Model downloaded successfully!");
      }, 2000);
    }
  }, [downloadingModel]);

  useEffect(() => {
    if (!canChangeKeys) {
      router.push("/upload");
    }
  }, [canChangeKeys, router]);

  if (!canChangeKeys) {
    return null;
  }

  return (
    // <div className="h-screen bg-gradient-to-b font-instrument_sans from-gray-50 to-white flex flex-col overflow-hidden">
    //   <main className="flex-1 container mx-auto px-4 max-w-3xl overflow-hidden flex flex-col">
    //     {/* Branding Header */}
    //     <div className="text-center mb-2 mt-4 flex-shrink-0">
    //       <div className="flex items-center justify-center gap-3 mb-2">
    //         <img src="/Logo.png" alt="Presenton Logo" className="h-12" />
    //       </div>
    //       <p className="text-gray-600 text-sm">
    //         Open-source AI presentation generator
    //       </p>
    //     </div>

    //     {/* Main Configuration Card */}
    //     <div className="flex-1 overflow-hidden">
    //       <LLMProviderSelection
    //         initialLLMConfig={llmConfig}
    //         onConfigChange={setLlmConfig}
    //         buttonState={buttonState}
    //         setButtonState={setButtonState}
    //       />
    //     </div>
    //   </main>

    //   {/* Download Progress Modal */}
    //   {showDownloadModal && downloadingModel && (
    //     <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
    //       <div className="bg-white/95 backdrop-blur-md rounded-xl shadow-2xl max-w-md w-full p-6 relative">
    //         {/* Modal Content */}
    //         <div className="text-center">
    //           {/* Icon */}
    //           <div className="mb-4">
    //             {downloadingModel.done ? (
    //               <CheckCircle className="w-12 h-12 text-green-600 mx-auto" />
    //             ) : (
    //               <Download className="w-12 h-12 text-blue-600 mx-auto animate-pulse" />
    //             )}
    //           </div>

    //           {/* Title */}
    //           <h3 className="text-lg font-semibold text-gray-900 mb-2">
    //             {downloadingModel.done ? "Download Complete!" : "Downloading Model"}
    //           </h3>

    //           {/* Model Name */}
    //           <p className="text-sm text-gray-600 mb-6">
    //             {llmConfig.OLLAMA_MODEL}
    //           </p>

    //           {/* Progress Bar */}
    //           {downloadProgress > 0 && (
    //             <div className="mb-4">
    //               <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
    //                 <div
    //                   className="bg-blue-600 h-3 rounded-full transition-all duration-300 ease-out"
    //                   style={{ width: `${downloadProgress}%` }}
    //                 />
    //               </div>
    //               <p className="text-sm text-gray-600 mt-2">
    //                 {downloadProgress}% Complete
    //               </p>
    //             </div>
    //           )}

    //           {/* Status */}
    //           {downloadingModel.status && (
    //             <div className="flex items-center justify-center gap-2 mb-4">
    //               <CheckCircle className="w-4 h-4 text-green-600" />
    //               <span className="text-sm font-medium text-green-700 capitalize">
    //                 {downloadingModel.status}
    //               </span>
    //             </div>
    //           )}

    //           {/* Status Message */}
    //           {downloadingModel.status && downloadingModel.status !== "pulled" && (
    //             <div className="text-xs text-gray-500">
    //               {downloadingModel.status === "downloading" && "Downloading model files..."}
    //               {downloadingModel.status === "verifying" && "Verifying model integrity..."}
    //               {downloadingModel.status === "pulling" && "Pulling model from registry..."}
    //             </div>
    //           )}

    //           {/* Download Info */}
    //           {downloadingModel.downloaded && downloadingModel.size && (
    //             <div className="mt-4 p-3 bg-gray-50 rounded-lg">
    //               <div className="flex justify-between text-xs text-gray-600">
    //                 <span>Downloaded: {(downloadingModel.downloaded / 1024 / 1024).toFixed(1)} MB</span>
    //                 <span>Total: {(downloadingModel.size / 1024 / 1024).toFixed(1)} MB</span>
    //               </div>
    //             </div>
    //           )}
    //         </div>
    //       </div>
    //     </div>
    //   )}

    //   {/* Fixed Bottom Button */}
    //   <div className="flex-shrink-0 bg-white border-t border-gray-200 p-4">
    //     <div className="container mx-auto max-w-3xl">
    //       <button
    //         onClick={handleSaveConfig}
    //         disabled={buttonState.isDisabled}
    //         className={`w-full font-semibold py-3 px-4 rounded-lg transition-all duration-500 ${buttonState.isDisabled
    //           ? "bg-gray-400 cursor-not-allowed"
    //           : "bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 focus:ring-4 focus:ring-blue-200"
    //           } text-white`}
    //       >
    //         {buttonState.isLoading ? (
    //           <div className="flex items-center justify-center gap-2">
    //             <Loader2 className="w-4 h-4 animate-spin" />
    //             {buttonState.text}
    //           </div>
    //         ) : (
    //           buttonState.text
    //         )}
    //       </button>
    //     </div>
    //   </div>
    // </div>
    <div className="flex h-screen">
      <OnBoardingSlidebar />
      <main className="w-full pl-20 pr-8 max-w-[1440px] mx-auto relative z-10">
        {step === 3 && (
          <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden>
            {FINAL_STEP_CONFETTI_PIECES.map((piece, index) => (
              <span
                key={`${piece.side}-${index}`}
                className="absolute rounded-[3px]"
                style={{
                  top: `${piece.top}%`,
                  ...(piece.side === "left"
                    ? { left: `${getTaperedSideOffset(piece.offset, piece.top)}%` }
                    : { right: `${getTaperedSideOffset(piece.offset, piece.top)}%` }),
                  width: `${piece.width}px`,
                  height: `${piece.height}px`,
                  backgroundColor: piece.color,
                  transform: `rotate(${piece.rotate}deg)`,
                }}
              />
            ))}
          </div>
        )}
        <OnBoardingHeader currentStep={step} />
        {step === 1 && <ModeSelectStep setStep={setStep} setSelectedMode={setSelectedMode} />}
        {step === 2 && selectedMode === "presenton" && <PresentonMode currentStep={step} setStep={setStep} />}
        {step === 2 && selectedMode === "image" && <GenerationWithImage />}
        {step === 3 && <FinalStep />}
      </main>
    </div>
  );
}
