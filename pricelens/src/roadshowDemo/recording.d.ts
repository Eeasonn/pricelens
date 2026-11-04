export interface RecordingShot {
  id: string;
  scene: string;
  durationMs: number;
  narration: string;
  asset?: string;
}

export declare const RECORDING_SHOTS: RecordingShot[];
export declare function recordingDuration(shots: RecordingShot[]): number;
export declare function validateRecordingShots(shots: RecordingShot[]): { valid: boolean; errors: string[] };
