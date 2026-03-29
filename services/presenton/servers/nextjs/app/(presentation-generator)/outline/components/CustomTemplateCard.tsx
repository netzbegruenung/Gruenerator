"use client";
import React, { memo } from "react";
import { Card } from "@/components/ui/card";
import { CustomTemplates, useCustomTemplatePreview } from "@/app/hooks/useCustomTemplates";
import { Loader2 } from "lucide-react";
import { CompiledLayout } from "@/app/hooks/compileLayout";

// Memoized preview component to prevent re-renders during scroll
export const LayoutPreview = memo(({ layout, templateId, index }: { layout: CompiledLayout, templateId: string, index: number }) => {
    const LayoutComponent = layout.component;
    return (
        <div
            key={`${templateId}-preview-${index}`}
            className="relative bg-gray-100 border border-gray-200 overflow-hidden aspect-video rounded"
            style={{ contain: 'layout style paint', willChange: 'auto' }}
        >
            <div className="absolute inset-0 bg-transparent z-10" />
            <div
                className="transform scale-[0.2] flex justify-center items-center origin-top-left w-[500%] h-[500%]"
                style={{ transform: 'scale(0.2) translateZ(0)', backfaceVisibility: 'hidden' }}
            >
                <LayoutComponent data={layout.sampleData} />
            </div>
        </div>
    );
});
LayoutPreview.displayName = 'LayoutPreview';

export const CustomTemplateCard = memo(({ template, onSelectTemplate, selectedTemplate }: { template: CustomTemplates, onSelectTemplate: (template: string) => void, selectedTemplate: string | null }) => {

    const { previewLayouts, loading: customLoading, totalLayouts } = useCustomTemplatePreview(template.id);
    const isSelected = selectedTemplate === template.id;

    return (

        <Card
            className={`${isSelected ? 'border-2 border-blue-500' : ''} font-syne cursor-pointer flex flex-col justify-between relative hover:shadow-lg transition-all duration-200 group overflow-hidden`}
            onClick={() => onSelectTemplate(template.id)}
        >

            <img src="/card_bg.svg" alt="" className="absolute top-0 left-0 w-full h-full object-cover" />
            <span className="text-xs font-syne absolute top-2 flex gap-1 capitalize  items-center left-2 rounded-[100px]  px-2.5 py-1 bg-[#3A3A3AF5] text-white font-semibold  z-40">
                Layouts- {totalLayouts}
            </span>
            <div className="p-5">

                {/* Layout previews */}
                <div className="grid grid-cols-2 gap-2">
                    {customLoading ? (
                        // Loading placeholders
                        [...Array(Math.min(4, template.layoutCount))].map((_, index) => (
                            <div
                                key={`${template.id}-loading-${index}`}
                                className="relative bg-gradient-to-br from-purple-50 to-blue-50 border border-gray-200 overflow-hidden aspect-video rounded flex items-center justify-center"
                            >
                                <Loader2 className="w-4 h-4 text-purple-300 animate-spin" />
                            </div>
                        ))
                    ) : previewLayouts.length > 0 && (
                        // Actual layout previews
                        previewLayouts.slice(0, 4).map((layout: CompiledLayout, index: number) => {
                            const LayoutComponent = layout.component;
                            return (
                                <div
                                    key={`${template.id}-preview-${index}`}
                                    className="relative bg-gray-100 border border-gray-200 overflow-hidden aspect-video rounded"
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
                        })
                    )}
                </div>


            </div>
            <div className="flex items-center justify-between p-5 bg-white border-t border-[#EDEEEF] relative z-40  ">
                <h3 className="text-sm font-bold text-gray-900">
                    {template.name}
                </h3>


            </div>
        </Card>
    );
});
CustomTemplateCard.displayName = 'CustomTemplateCard';

