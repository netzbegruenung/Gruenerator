"use client";
import React, { useEffect, useMemo, useCallback, memo } from "react";

import { TemplateLayoutsWithSettings } from "@/app/presentation-templates/utils";
import { templates } from "@/app/presentation-templates";
import { Card } from "@/components/ui/card";
import { TemplateWithData } from "@/app/presentation-templates/utils";
import { CustomTemplates, useCustomTemplateSummaries } from "@/app/hooks/useCustomTemplates";
import { Loader2 } from "lucide-react";
import { CustomTemplateCard } from "./CustomTemplateCard";
import CreateCustomTemplate from "../../(dashboard)/templates/components/CreateCustomTemplate";

// Memoized layout preview for built-in templates
const BuiltInLayoutPreview = memo(({ layout, templateId, index }: {
  layout: TemplateWithData;
  templateId: string;
  index: number;
}) => {
  const LayoutComponent = layout.component;
  return (
    <div
      className="relative bg-gray-100 font-syne border border-gray-200 overflow-hidden aspect-video rounded"
      style={{ contain: 'layout style paint' }}
    >
      <div className="absolute inset-0 bg-transparent z-10" />
      <div
        className="transform scale-[0.12] origin-top-left"
        style={{ width: "833.33%", height: "833.33%" }}
      >
        <LayoutComponent data={layout.sampleData} />
      </div>
    </div>
  );
});
BuiltInLayoutPreview.displayName = 'BuiltInLayoutPreview';

// Memoized built-in template card
const BuiltInTemplateCard = memo(({ template, isSelected, onSelect }: {
  template: TemplateLayoutsWithSettings;
  isSelected: boolean;
  onSelect: (template: TemplateLayoutsWithSettings) => void;
}) => {
  const previewLayouts = useMemo(() => template.layouts.slice(0, 4), [template.layouts]);
  const handleClick = useCallback(() => onSelect(template), [onSelect, template]);

  return (
    <Card
      className={`${isSelected ? 'border-2 border-blue-500' : ''} cursor-pointer relative hover:shadow-lg transition-all duration-200 group overflow-hidden`}
      onClick={handleClick}
    >
      <span className="text-xs font-syne absolute top-2 flex gap-1 capitalize items-center left-2 rounded-[100px] px-2.5 py-1 bg-[#3A3A3AF5] text-white font-semibold z-40">
        {template.layouts.length} {template.layouts.length === 1 ? 'Layout' : 'Layouts'}
      </span>
      <img src="/card_bg.svg" alt="" className="absolute top-0 left-0 w-full h-full object-cover" />
      <div className="p-5">
        <div className="grid grid-cols-2 gap-2">
          {previewLayouts.map((layout: TemplateWithData, index: number) => (
            <BuiltInLayoutPreview
              key={`${template.id}-preview-${index}`}
              layout={layout}
              templateId={template.id}
              index={index}
            />
          ))}
        </div>
      </div>
      <div className="flex items-center justify-between p-5 bg-white border-t border-[#EDEEEF] relative z-40">
        <div>
          <h3 className="text-sm font-bold text-gray-900 capitalize font-syne">
            {template.name}
          </h3>
          <p className="text-xs text-gray-600  line-clamp-2 font-syne">
            {template.description}
          </p>
        </div>
      </div>
    </Card>
  );
});
BuiltInTemplateCard.displayName = 'BuiltInTemplateCard';

interface TemplateSelectionProps {
  selectedTemplate: (TemplateLayoutsWithSettings | string) | null;
  onSelectTemplate: (template: TemplateLayoutsWithSettings | string) => void;
}

const TemplateSelection: React.FC<TemplateSelectionProps> = memo(({
  selectedTemplate,
  onSelectTemplate
}) => {
  useEffect(() => {
    const existingScript = document.querySelector(
      'script[src*="tailwindcss.com"]'
    );
    if (!existingScript) {
      const script = document.createElement("script");
      script.src = "https://cdn.tailwindcss.com";
      script.async = true;
      document.head.appendChild(script);
    }
  }, []);

  const { templates: customTemplates, loading: customLoading } = useCustomTemplateSummaries();

  // Stable callback for custom template selection
  const handleCustomSelect = useCallback(
    (template: TemplateLayoutsWithSettings | string) => onSelectTemplate(template),
    [onSelectTemplate]
  );

  // Stable callback for built-in template selection
  const handleBuiltInSelect = useCallback(
    (template: TemplateLayoutsWithSettings) => onSelectTemplate(template),
    [onSelectTemplate]
  );

  // Derive the selected custom template id only when selectedTemplate changes
  const selectedCustomId = useMemo(
    () => (typeof selectedTemplate === 'string' ? selectedTemplate : null),
    [selectedTemplate]
  );

  // Derive the selected built-in template id only when selectedTemplate changes
  const selectedBuiltInId = useMemo(
    () => (typeof selectedTemplate !== 'string' ? selectedTemplate?.id ?? null : null),
    [selectedTemplate]
  );

  // Memoize the custom templates section
  const customTemplateCards = useMemo(() => {
    if (customLoading) {
      return (
        <div className="flex items-center justify-center py-12 font-syne">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600 font-syne" />
          <span className="ml-3 text-gray-600">Loading custom templates...</span>
        </div>
      );
    }
    if (customTemplates.length === 0) {
      return (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">

          <CreateCustomTemplate />
        </div>
      );
    }
    return (
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {customTemplates.map((template: CustomTemplates) => (
          <CustomTemplateCard
            key={template.id}
            template={template}
            onSelectTemplate={handleCustomSelect}
            selectedTemplate={selectedCustomId}
          />
        ))}
      </div>
    );
  }, [customLoading, customTemplates, handleCustomSelect, selectedCustomId]);

  // Memoize the built-in templates list
  const builtInTemplateCards = useMemo(
    () =>
      templates.map((template: TemplateLayoutsWithSettings) => (
        <BuiltInTemplateCard
          key={template.id}
          template={template}
          isSelected={selectedBuiltInId === template.id}
          onSelect={handleBuiltInSelect}
        />
      )),
    [selectedBuiltInId, handleBuiltInSelect]
  );

  return (
    <div className="space-y-[30px] mb-4">
      {/* Custom AI Templates */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-semibold text-gray-900 font-syne">Custom</h3>
        </div>
        {customTemplateCards}
      </div>
      {/* In Built Templates */}
      <div>
        <h3 className="text-base font-semibold text-gray-900 mb-3 font-syne">In Built</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {builtInTemplateCards}
        </div>
      </div>
    </div>
  );
});
TemplateSelection.displayName = 'TemplateSelection';

export default TemplateSelection;
