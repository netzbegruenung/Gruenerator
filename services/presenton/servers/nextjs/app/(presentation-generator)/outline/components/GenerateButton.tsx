import React from "react";
import { usePathname } from "next/navigation";
import { trackEvent, MixpanelEvent } from "@/utils/mixpanel";
import { Button } from "@/components/ui/button";
import { LoadingState, Template } from "../types/index";
import { TemplateLayoutsWithSettings } from "@/app/presentation-templates/utils";
import { ChevronRight } from "lucide-react";

interface GenerateButtonProps {
  loadingState: LoadingState;
  streamState: { isStreaming: boolean; isLoading: boolean };
  selectedTemplate: TemplateLayoutsWithSettings | string | null;
  onSubmit: () => void;
  outlineCount: number;
}

const GenerateButton: React.FC<GenerateButtonProps> = ({
  loadingState,
  streamState,
  selectedTemplate,
  outlineCount,
  onSubmit,
}) => {
  const pathname = usePathname();

  const isDisabled =
    loadingState.isLoading || streamState.isLoading || streamState.isStreaming;

  const getButtonText = () => {
    if (loadingState.isLoading) return loadingState.message;
    if (streamState.isLoading || streamState.isStreaming) return "Loading...";
    if (!selectedTemplate) return "Select a Template";
    return "Generate Presentation";
  };

  return (
    <Button
      disabled={isDisabled}
      onClick={() => {
        if (!streamState.isLoading && !streamState.isStreaming) {
          if (!selectedTemplate) {
            trackEvent(MixpanelEvent.Outline_Select_Template_Button_Clicked, {
              pathname,
            });
          } else {
            trackEvent(
              MixpanelEvent.Outline_Generate_Presentation_Button_Clicked,
              { pathname }
            );
          }
        }
        onSubmit();
      }}
      className=" w-full flex items-center gap-0.5 rounded-[58px] text-sm py-3 px-5 font-instrument_sans font-semibold  text-[#101323] disabled:opacity-50 disabled:cursor-not-allowed font-syne"
      style={{
        background: "linear-gradient(270deg, #D5CAFC 2.4%, #E3D2EB 27.88%, #F4DCD3 69.23%, #FDE4C2 100%)",
      }}
    >

      {getButtonText()}
      <ChevronRight className="w-4 h-4" />
    </Button>
  );
};

export default GenerateButton;
