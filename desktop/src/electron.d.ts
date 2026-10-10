// desktop/src/electron.d.ts
export {};

declare global {
  interface ElectronAPI {
    printDocument: (options: { htmlContent: string }) => Promise<{ success: boolean; error?: string }>;
    showNotification: (options: { title: string; body: string }) => Promise<{ success: boolean; error?: string }>;

    // Offline SQLite Client Storage API
    offlineQueueMutation: (mutation: any) => Promise<{ success: boolean; error?: string }>;
    offlineGetPendingMutations: () => Promise<any[]>;
    offlineMarkSynced: (params: { client_mutation_id: string; server_record_id?: number | null }) => Promise<{ success: boolean }>;
    offlineCacheBootstrap: (data: { patients?: any[]; emrRecords?: any[] }) => Promise<{ success: boolean }>;
    offlineGetEmrHistory: (patientUserId: number) => Promise<any[]>;
    offlineSearchPatients: (query: string) => Promise<any[]>;

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