import { contextBridge, ipcRenderer } from 'electron';

const desktop = {
  ping: (): Promise<string> => ipcRenderer.invoke('app:ping'),
};

contextBridge.exposeInMainWorld('desktop', desktop);
