export interface LiveAgent {
  readonly busy: boolean;
  start(): Promise<string>;
  readyToSend(): Promise<boolean>;
  send(text: string, onText: (text: string, itemId: string, final: boolean) => void): Promise<void>;
  close(): Promise<void>;
}
