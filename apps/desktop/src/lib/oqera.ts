import { Channel, invoke } from "@tauri-apps/api/core";
import type { FilePreview, SearchHit, Workspace } from "../types/workspace";

export const oqera={
 workspace:{
  open:()=>invoke<Workspace|null>("open_workspace"),
  restore:()=>invoke<Workspace|null>("restore_workspace"),
  refresh:()=>invoke<Workspace>("refresh_workspace"),
  search:(query:string)=>invoke<SearchHit[]>("search_workspace",{query}),
 },
 fs:{
  readFile:(path:string)=>invoke<string>("read_workspace_file",{path}),
  inspect:(path:string)=>invoke<FilePreview>("inspect_workspace_file",{path}),
  writeFile:(path:string,content:string)=>invoke<void>("save_workspace_file",{path,content}),
  createFile:(path:string)=>invoke<void>("create_workspace_file",{path}),
  createFolder:(path:string)=>invoke<void>("create_workspace_folder",{path}),
  rename:(path:string,newName:string)=>invoke<string>("rename_workspace_entry",{path,newName}),
  delete:(path:string)=>invoke<void>("delete_workspace_entry",{path}),
 },
 terminal:{
  start:(onData:(data:string)=>void)=>{const channel=new Channel<string>();channel.onmessage=onData;return invoke<number>("terminal_start",{onData:channel})},
  write:(id:number,data:string)=>invoke<void>("terminal_write",{id,data}),
 }
};
