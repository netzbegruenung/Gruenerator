interface UseChatInputOptions {
  inputValue?: string;
  onInputChange?: (value: string) => void;
  onSubmit?: (value: string) => void;
  autoSubmitVoice?: boolean;
  enableVoiceRecording?: boolean;
  enableFileUpload?: boolean;
  onVoiceTranscription?: (text: string) => void;
  onFileSelect?: (files: File[]) => void;
}

interface UseChatInputReturn {
  isVoiceRecording: boolean;
  isVoiceProcessing: boolean;
  startRecording: () => void;
  stopRecording: () => void;
  voiceError: string | null;
  fileInputRef: React.RefObject<HTMLInputElement>;
  internalAttachedFiles: File[];
  handleFileUploadClick: () => void;
  handleFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  handleRemoveFile: (index: number) => void;
  clearFiles: () => void;
}

declare function useChatInput(options: UseChatInputOptions): UseChatInputReturn;

export default useChatInput;
