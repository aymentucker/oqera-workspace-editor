import { invoke } from "@tauri-apps/api/core";
import type { Workspace } from "../types/workspace";

export const oqera = {
  workspace: {
    open: () => invoke<Workspace | null>("open_workspace"),
    refresh: () => invoke<Workspace>("refresh_workspace"),
  },
  fs: {
    readFile: (path: string) => invoke<string>("read_workspace_file", { path }),
    writeFile: (path: string, content: string) => invoke<void>("save_workspace_file", { path, content }),
    createFile: (path: string) => invoke<void>("create_workspace_file", { path }),
    createFolder: (path: string) => invoke<void>("create_workspace_folder", { path }),
    rename: (path: string, newName: string) => invoke<string>("rename_workspace_entry", { path, newName }),
    delete: (path: string) => invoke<void>("delete_workspace_entry", { path }),
  },
};
