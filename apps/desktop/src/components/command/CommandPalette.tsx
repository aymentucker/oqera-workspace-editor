import { useEffect, useMemo, useRef, useState } from "react";
import type { FileNode, SearchHit } from "../../types/workspace";
type Item={label:string;detail?:string;action:()=>void};
const flatten=(nodes:FileNode[]):FileNode[]=>nodes.flatMap(n=>n.kind==="file"?[n]:flatten(n.children??[]));
export function CommandPalette({mode,nodes,onClose,onOpen,onSearch,onNewFile,onNewFolder,onRefresh}:{mode:"quick"|"command"|"search";nodes:FileNode[];onClose:()=>void;onOpen:(n:FileNode)=>void;onSearch:(q:string)=>Promise<SearchHit[]>;onNewFile:()=>void;onNewFolder:()=>void;onRefresh:()=>void}){
 const [q,setQ]=useState(""),[hits,setHits]=useState<SearchHit[]>([]);const input=useRef<HTMLInputElement>(null);useEffect(()=>input.current?.focus(),[]);
 useEffect(()=>{if(mode!=="search"||!q.trim()){setHits([]);return}const id=setTimeout(()=>void onSearch(q).then(setHits),180);return()=>clearTimeout(id)},[q,mode,onSearch]);
 const files=useMemo(()=>flatten(nodes).filter(n=>n.path.toLowerCase().includes(q.toLowerCase())).slice(0,60),[nodes,q]);
 const commands:Item[]=[{label:"New File",detail:"Create in project root",action:onNewFile},{label:"New Folder",detail:"Create in project root",action:onNewFolder},{label:"Refresh Explorer",action:onRefresh}].filter(x=>x.label.toLowerCase().includes(q.toLowerCase()));
 const title=mode==="quick"?"Quick Open":mode==="search"?"Search Workspace":"Command Center";
 return <div className="palette-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}><div className="palette"><div className="palette-input"><span>{mode==="quick"?"⌘P":mode==="command"?"⌘K":"⌕"}</span><input ref={input} value={q} onChange={e=>setQ(e.target.value)} placeholder={title} onKeyDown={e=>{if(e.key==="Escape")onClose();if(e.key==="Enter"&&mode==="quick"&&files[0]){onOpen(files[0]);onClose()}}}/></div><div className="palette-results">
 {mode==="quick"?files.map(n=><button key={n.path} onClick={()=>{onOpen(n);onClose()}}><strong>{n.name}</strong><span>{n.path}</span></button>):null}
 {mode==="command"?commands.map(x=><button key={x.label} onClick={()=>{x.action();onClose()}}><strong>{x.label}</strong><span>{x.detail}</span></button>):null}
 {mode==="search"?hits.map((h,i)=><button key={h.path+h.line+i} onClick={()=>{const n=flatten(nodes).find(n=>n.path===h.path);if(n)onOpen(n);onClose()}}><strong>{h.path}:{h.line}</strong><span>{h.preview}</span></button>):null}
 </div></div></div>
}