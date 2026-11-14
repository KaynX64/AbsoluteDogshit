// desktop/src/electron.d.ts
export {};

declare global {
  interface ElectronAPI {
    /**
     * Window chrome resolved by the main process. `customTitleBar` is true
     * when the app draws its own translucent title strip (Windows 11 22H2+); in
     * that case the native caption is hidden and no OS title text exists.
     */
    windowChrome: { title: string; customTitleBar: boolean; titleBarHeight: number };
    onFullScreenChange: (cb: (isFullScreen: boolean) => void) => () => void;

    printDocument: (options: { htmlContent: string }) => Promise<{ success: boolean; error?: string }>;
    showNotification: (options: { title: string; body: string }) => Promise<{ success: boolean; error?: string }>;

    // Offline SQLite Client Storage API
    offlineQueueMutation: (mutation: any) => Promise<{ success: boolean; error?: string }>;
    offlineGetPendingMutations: () => Promise<any[]>;
    offlineMarkSynced: (params: { client_mutation_id: string; server_record_id?: number | null }) => Promise<{ success: boolean }>;
    offlineCacheBootstrap: (data: { patients?: any[]; emrRecords?: any[] }) => Promise<{ success: boolean }>;
    offlineGetEmrHistory: (patientUserId: number) => Promise<any[]>;
    offlineSearchPatients: (query: string) => Promise<any[]>;
    offlineMarkFailed: (params: { client_mutation_id: string; sync_status?: string; error_message?: string }) => Promise<{ success: boolean }>;

        onUpdateStatus: (cb: (s: {
      state: 'checking' | 'available' | 'none' | 'downloading' | 'downloaded' | 'error';
      version?: string; percent?: number; message?: string;
    }) => void) => () => void;
    installUpdate: () => Promise<void>;
    getAppVersion: () => Promise<string>;

  }

  interface Window {
    electronAPI?: ElectronAPI;
  }
}