declare module 'mespeak' {
  const meSpeak: {
    loadConfig(value: unknown): void;
    loadVoice(value: unknown): void;
    isConfigLoaded(): boolean;
    isVoiceLoaded(voice: string): boolean;
    speak(text: string, options: { rawdata: 'array'; speed: number; voice: string; pitch: number }): number[] | null;
  };
  export default meSpeak;
}
declare module 'mespeak/src/mespeak_config.json' { const value: unknown; export default value; }
declare module 'mespeak/voices/pt.json' { const value: unknown; export default value; }
