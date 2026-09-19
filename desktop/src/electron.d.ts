// desktop/src/electron.d.ts
export {};

declare global {
  interface ElectronAPI {
    printDocument: (options: { htmlContent: string }) => Promise<{ success: boolean; error?: string }>;
    showNotification: (options: { title: string; body: string }) => Promise<{ success: boolean; error?: string }>;
  }

  interface Window {
    electronAPI?: ElectronAPI;
  }
}