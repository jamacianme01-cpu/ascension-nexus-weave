export type TreeVoiceState = "idle" | "listening" | "speaking";
export interface TreeRecognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: { results: ArrayLike<{ isFinal: boolean; 0?: { transcript: string } }> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  abort(): void;
}
export interface TreeVoiceController {
  speak(text: string): boolean;
  listen(): boolean;
  stop(): void;
  dispose(): void;
}
export function createTreeVoice(options: {
  speech?: Pick<SpeechSynthesis, "speak" | "cancel">;
  Utterance?: new (text: string) => SpeechSynthesisUtterance;
  Recognition?: (new () => TreeRecognition) | undefined;
  onTranscript(text: string): void;
  onState?(state: TreeVoiceState): void;
  onError?(message: string): void;
}): TreeVoiceController;
