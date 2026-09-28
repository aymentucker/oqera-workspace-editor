import { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { oqera } from "../../lib/oqera";
export function TerminalPanel({workspaceKey}:{workspaceKey:string}){
 const host=useRef<HTMLDivElement>(null),session=useRef<number|null>(null);const [error,setError]=useState("");
 useEffect(()=>{if(!host.current)return;const term=new Terminal({fontSize:12,fontFamily:'"JetBrains Mono","SFMono-Regular",monospace',cursorBlink:true,theme:{background:"#0a0c0f"}});const fit=new FitAddon();term.loadAddon(fit);term.open(host.current);fit.fit();let alive=true;
 oqera.terminal.start(data=>{if(alive)term.write(data)}).then(id=>{session.current=id;term.onData(data=>void oqera.terminal.write(id,data))}).catch(e=>setError(String(e)));
 const ro=new ResizeObserver(()=>fit.fit());ro.observe(host.current);return()=>{alive=false;ro.disconnect();term.dispose()};},[workspaceKey]);
 return <div className="terminal-host">{error?<div className="terminal-error">{error}</div>:null}<div ref={host}/></div>
}