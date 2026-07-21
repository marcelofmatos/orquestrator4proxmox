declare module '@novnc/novnc' {
  export default class RFB {
    constructor(target: HTMLElement, url: string, options?: { credentials?: { password?: string; username?: string; target?: string } });
    scaleViewport: boolean;
    disconnect(): void;
    addEventListener(type: string, listener: (e: any) => void): void;
  }
}
