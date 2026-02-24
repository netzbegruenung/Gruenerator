export interface ISize {
  width: number;
  height: number;
}

export interface IDisplay {
  from: number;
  to: number;
}

export interface ITrackItem {
  id: string;
  type: string;
  name: string;
  display: IDisplay;
  details: Record<string, any>;
  metadata?: Record<string, any>;
  animations?: Record<string, any>;
}

export interface ITransition {
  id: string;
  type: string;
  kind: string;
  duration: number;
  direction?: string;
  trackItemIds: string[];
}

export interface RenderInputProps {
  trackItemIds: string[];
  trackItemsMap: Record<string, ITrackItem>;
  transitionsMap: Record<string, ITransition>;
  fps: number;
  size: ISize;
  background?: { type: string; value: string };
}

export interface RenderJob {
  id: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  progress: number;
  design: {
    trackItemIds: string[];
    trackItemsMap: Record<string, ITrackItem>;
    transitionsMap: Record<string, ITransition>;
    size: ISize;
    [key: string]: any;
  };
  options: {
    fps: number;
    size: ISize;
    format: string;
  };
  userId: string;
  createdAt: string;
  updatedAt: string;
  presigned_url?: string;
  error?: string;
}
