import ToolTip from '@/components/ToolTip'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { SlidersHorizontal } from 'lucide-react'
import React, { useState } from 'react'
import { PresentationConfig, ToneType, VerbosityType } from '../type'


interface ConfigurationSelectsProps {
    config: PresentationConfig;
    onConfigChange: (key: keyof PresentationConfig, value: any) => void;
}
const AdvanceSettings = ({ config, onConfigChange }: ConfigurationSelectsProps) => {

    const [openAdvanced, setOpenAdvanced] = useState(false);

    const [advancedDraft, setAdvancedDraft] = useState({
        tone: config.tone,
        verbosity: config.verbosity,
        instructions: config.instructions,
        includeTableOfContents: config.includeTableOfContents,
        includeTitleSlide: config.includeTitleSlide,
        webSearch: config.webSearch,
    });

    const handleOpenAdvancedChange = (open: boolean) => {
        if (open) {
            setAdvancedDraft({
                tone: config.tone,
                verbosity: config.verbosity,
                instructions: config.instructions,
                includeTableOfContents: config.includeTableOfContents,
                includeTitleSlide: config.includeTitleSlide,
                webSearch: config.webSearch,
            });
        }
        setOpenAdvanced(open);
    };

    const handleSaveAdvanced = () => {
        onConfigChange("tone", advancedDraft.tone);
        onConfigChange("verbosity", advancedDraft.verbosity);
        onConfigChange("instructions", advancedDraft.instructions);
        onConfigChange("includeTableOfContents", advancedDraft.includeTableOfContents);
        onConfigChange("includeTitleSlide", advancedDraft.includeTitleSlide);
        onConfigChange("webSearch", advancedDraft.webSearch);
        setOpenAdvanced(false);
    };
    return (
        <div className=''>
            <ToolTip content="Advanced settings" className='w-full h-full'>
                <button
                    aria-label="Advanced settings"
                    title="Advanced settings"
                    type="button"
                    onClick={() => handleOpenAdvancedChange(true)}
                    className=" w-full h-full flex items-center px-3 py-1 text-sm  bg-[#F7F6F9] hover:bg-[#F7F6F9] border-[#EDEEEF] focus-visible:ring-[#5141E5] border-none rounded-[48px] font-instrument_sans font-medium"
                >
                    <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
                </button>
            </ToolTip>
            <Dialog open={openAdvanced} onOpenChange={handleOpenAdvancedChange}>
                <DialogContent className="max-w-2xl font-instrument_sans">
                    <DialogHeader>
                        <DialogTitle>Advanced settings</DialogTitle>
                    </DialogHeader>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                        {/* Tone */}
                        <div className="w-full flex flex-col gap-2">
                            <label className="text-sm font-semibold text-gray-700">Tone</label>
                            <p className="text-xs text-gray-500">Controls the writing style (e.g., casual, professional, funny).</p>
                            <Select
                                value={advancedDraft.tone}
                                onValueChange={(value) => setAdvancedDraft((prev) => ({ ...prev, tone: value as ToneType }))}
                            >
                                <SelectTrigger className="w-full font-instrument_sans capitalize font-medium bg-blue-100 border-blue-200 focus-visible:ring-blue-300">
                                    <SelectValue placeholder="Select tone" />
                                </SelectTrigger>
                                <SelectContent className="font-instrument_sans">
                                    {Object.values(ToneType).map((tone) => (
                                        <SelectItem key={tone} value={tone} className="text-sm font-medium capitalize">
                                            {tone}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Verbosity */}
                        <div className="w-full flex flex-col gap-2">
                            <label className="text-sm font-semibold text-gray-700">Verbosity</label>
                            <p className="text-xs text-gray-500">Controls how detailed slide descriptions are: concise, standard, or text-heavy.</p>
                            <Select
                                value={advancedDraft.verbosity}
                                onValueChange={(value) => setAdvancedDraft((prev) => ({ ...prev, verbosity: value as VerbosityType }))}
                            >
                                <SelectTrigger className="w-full font-instrument_sans capitalize font-medium bg-blue-100 border-blue-200 focus-visible:ring-blue-300">
                                    <SelectValue placeholder="Select verbosity" />
                                </SelectTrigger>
                                <SelectContent className="font-instrument_sans">
                                    {Object.values(VerbosityType).map((verbosity) => (
                                        <SelectItem key={verbosity} value={verbosity} className="text-sm font-medium capitalize">
                                            {verbosity}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>



                        {/* Toggles */}
                        <div className="w-full flex flex-col gap-2 p-3 rounded-md bg-blue-100 border-blue-200">
                            <div className="flex items-center justify-between">
                                <label className="text-sm font-semibold text-gray-700">Include table of contents</label>
                                <Switch
                                    checked={advancedDraft.includeTableOfContents}
                                    onCheckedChange={(checked) => setAdvancedDraft((prev) => ({ ...prev, includeTableOfContents: checked }))}
                                />
                            </div>
                            <p className="text-xs text-gray-600">Add an index slide summarizing sections (requires 3+ slides).</p>
                        </div>
                        <div className="w-full flex flex-col gap-2 p-3 rounded-md bg-blue-100 border-blue-200">
                            <div className="flex items-center justify-between">
                                <label className="text-sm font-semibold text-gray-700">Title slide</label>
                                <Switch
                                    checked={advancedDraft.includeTitleSlide}
                                    onCheckedChange={(checked) => setAdvancedDraft((prev) => ({ ...prev, includeTitleSlide: checked }))}
                                />
                            </div>
                            <p className="text-xs text-gray-600">Include a title slide as the first slide.</p>
                        </div>
                        <div className="w-full flex flex-col gap-2 p-3 rounded-md bg-blue-100 border-blue-200">
                            <div className="flex items-center justify-between">
                                <label className="text-sm font-semibold text-gray-700">Web search</label>
                                <Switch
                                    checked={advancedDraft.webSearch}
                                    onCheckedChange={(checked) => setAdvancedDraft((prev) => ({ ...prev, webSearch: checked }))}
                                />
                            </div>
                            <p className="text-xs text-gray-600">Allow the model to consult the web for fresher facts.</p>
                        </div>

                        {/* Instructions */}
                        <div className="w-full sm:col-span-2 flex flex-col gap-2">
                            <label className="text-sm font-semibold text-gray-700">Instructions</label>
                            <p className="text-xs text-gray-500">Optional guidance for the AI. These override defaults except format constraints.</p>
                            <Textarea
                                value={advancedDraft.instructions}
                                rows={4}
                                onChange={(e) => setAdvancedDraft((prev) => ({ ...prev, instructions: e.target.value }))}
                                placeholder="Example: Focus on enterprise buyers, emphasize ROI and security compliance. Keep slides data-driven, avoid jargon, and include a short call-to-action on the final slide."
                                className="py-2 px-3 border-2 font-medium text-sm min-h-[100px] max-h-[200px] border-blue-200 focus-visible:ring-offset-0 focus-visible:ring-blue-300"
                            />
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => handleOpenAdvancedChange(false)}>Cancel</Button>
                        <Button onClick={handleSaveAdvanced} className="bg-[#5141e5] text-white hover:bg-[#5141e5]/90">Save</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}

export default AdvanceSettings
