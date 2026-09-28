import { invoke } from "@tauri-apps/api/core";
import type { Workspace } from "../types/workspace";
export const oqera={workspace:{open:()=>invoke<Workspace|null>("open_workspace")},fs:{readFile:(path:string)=>invoke<string>("read_workspace_file",{path}),writeFile:(path:string,content:string)=>invoke<void>("save_workspace_file",{path,content})}};
