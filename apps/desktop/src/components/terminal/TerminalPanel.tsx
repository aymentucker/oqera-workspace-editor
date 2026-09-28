import { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { oqera } from "../../lib/oqera";

export function TerminalPanel({workspaceKey}:{workspaceKey:string}){
 const host=useRef<HTMLDivElement>(null);
 const [error,setError]=useState("");
 useEffect(()=>{
  const el=host.current;if(!el)return;
  const term=new Terminal({fontSize:12,fontFamily:'"JetBrains Mono","SFMono-Regular",monospace',cursorBlink:true,convertEol:false,theme:{background:"#0a0c0f",foreground:"#f4f6f8"}});
  const fit=new FitAddon();term.loadAddon(fit);term.open(el);
  let alive=true,id:number|undefined;
  const fitAndResize=()=>{try{fit.fit();if(id)void oqera.terminal.resize(id,term.cols,term.rows)}catch{}};
  requestAnimationFrame(fitAndResize);
  oqera.terminal.start(data=>{if(alive)term.write(data)}).then(sessionId=>{id=sessionId;fitAndResize();term.focus();term.onData(data=>void oqera.terminal.write(sessionId,data))}).catch(e=>setError(String(e)));
  const ro=new ResizeObserver(fitAndResize);ro.observe(el);
  return()=>{alive=false;ro.disconnect();if(id)void oqera.terminal.close(id);term.dispose()};
 },[workspaceKey]);
 return <div className="terminal-host">{error?<div className="terminal-error">{error}</div>:null}<div className="terminal-screen" ref={host}/></div>
}
