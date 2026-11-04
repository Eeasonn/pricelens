export interface RecordingShot {
  id: string;
  scene: string;
  durationMs: number;
  narration: string;
  transition?: string;
  asset?: string;
}

export declare const RECORDING_PLAN: RecordingShot[];
export declare function recordingDuration(shots: RecordingShot[]): number;
export declare function sectionSource(scene: string): string | null;
export declare function validateRecordingPlan(shots: RecordingShot[]): { valid: boolean; errors: string[] };
