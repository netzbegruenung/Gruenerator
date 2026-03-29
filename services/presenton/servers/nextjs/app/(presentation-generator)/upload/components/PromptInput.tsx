import { Textarea } from "@/components/ui/textarea";
import { useState } from "react";

interface PromptInputProps {
  value: string;
  onChange: (value: string) => void;
}

export function PromptInput({ value, onChange }: PromptInputProps) {


  const handleChange = (val: string) => {

    onChange(val);
  };

  return (
    <div className="space-y-2 font-syne">
      <div className="relative">
        <Textarea
          value={value}
          rows={5}
          onChange={(e) => handleChange(e.target.value)}
          placeholder="Beschreibe deine Präsentation"
          data-testid="prompt-input"
          className={`py-4 px-5 border-2 font-medium font-instrument_sans text-base min-h-[150px] max-h-[300px] border-[#316049] focus-visible:ring-offset-0  focus-visible:ring-[#316049] overflow-y-auto  custom_scrollbar  `}
        />
      </div>

    </div>
  );
}