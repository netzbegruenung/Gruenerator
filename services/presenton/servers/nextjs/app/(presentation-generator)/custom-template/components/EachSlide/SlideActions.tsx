'use client'
import React from "react";
import { AlertCircle, CheckCircle, Edit, Loader2, Repeat2, Trash, Code } from "lucide-react";
import ToolTip from "@/components/ToolTip";
import { SlideActionsProps } from "../../types";

export const SlideActions: React.FC<SlideActionsProps> = ({
  slide,
  index,
  isProcessing,
  isEditMode,
  isHtmlEditMode,
  onEditClick,
  onHtmlEditClick,
  onRetry,
  onDelete,
}) => {
  return (
    <div className="flex items-center w-full justify-between gap-2">
      <div>
        {slide.processing ? (
          <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
        ) : slide.processed ? (
          <CheckCircle className="w-6 h-6 text-green-600" />
        ) : slide.error ? (
          <AlertCircle className="w-6 h-6 text-red-600" />
        ) : (
          <div className="w-6 h-6 border-2 border-gray-300 rounded-full" />
        )}
      </div>

      {slide.processed && (
        <div className="flex gap-6">
          {slide.processed && slide.html && !isEditMode && !isHtmlEditMode && (
            <>
              <div>
                <ToolTip content="Folie mit KI bearbeiten">
                  <button
                    onClick={onEditClick}
                    disabled={isProcessing || !slide.processed}
                    className={`px-6 py-2 flex gap-2 text-sm items-center group-hover:scale-105 rounded-lg bg-[#316049] hover:shadow-md transition-all duration-300 cursor-pointer shadow-md ${
                      isProcessing || !slide.processed
                        ? "opacity-50 cursor-not-allowed"
                        : ""
                    }`}
                  >
                    <Edit className="w-4 sm:w-5 h-4 sm:h-5 text-white" />
                    <span className="text-white">Folie bearbeiten</span>
                  </button>
                </ToolTip>
              </div>
              <div>
                <ToolTip content="HTML direkt bearbeiten">
                  <button
                    onClick={onHtmlEditClick}
                    disabled={isProcessing || !slide.processed}
                    className={`px-6 py-2 flex gap-2 text-sm items-center group-hover:scale-105 rounded-lg bg-green-600 hover:bg-green-700 hover:shadow-md transition-all duration-300 cursor-pointer shadow-md ${
                      isProcessing || !slide.processed
                        ? "opacity-50 cursor-not-allowed"
                        : ""
                    }`}
                  >
                    <Code className="w-4 sm:w-5 h-4 sm:h-5 text-white" />
                    <span className="text-white">HTML bearbeiten</span>
                  </button>
                </ToolTip>
              </div>
            </>
          )}
          <div>
            <ToolTip content="Folie neu gestalten">
              <button
                onClick={onRetry}
                disabled={isProcessing || !slide.processed}
                className={`px-6 py-2 flex gap-2 text-sm items-center group-hover:scale-105 rounded-lg bg-[#316049] hover:shadow-md transition-all duration-300 cursor-pointer shadow-md ${
                  isProcessing || !slide.processed
                    ? "opacity-50 cursor-not-allowed"
                    : ""
                }`}
              >
                <Repeat2 className="w-4 sm:w-5 h-4 sm:h-5 text-white" />
                <span className="text-white">Neu erstellen</span>
              </button>
            </ToolTip>
          </div>
          <div>
            <ToolTip content="Folie löschen">
              <button
                disabled={isProcessing}
                onClick={onDelete}
                className={`px-4 py-2 flex gap-2 text-sm items-center group-hover:scale-105 rounded-lg hover:shadow-md transition-all duration-300 cursor-pointer shadow-md ${
                  isProcessing ? "opacity-50 cursor-not-allowed" : ""
                }`}
              >
                <Trash className="w-4 sm:w-5 h-4 sm:h-5 text-red-500" />
              </button>
            </ToolTip>
          </div>
        </div>
      )}
    </div>
  );
}; 