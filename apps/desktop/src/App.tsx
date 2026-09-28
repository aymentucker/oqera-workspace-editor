import { useEffect, useMemo, useState } from "react";
import { OqeraIcon, ProjectIcon, SearchIcon, GitIcon, IntelligenceIcon, TerminalIcon, SettingsIcon, CloseIcon, NewFileIcon, NewFolderIcon, RefreshIcon } from "./icons";
import { FileTree, type ExplorerAction } from "./components/explorer/FileTree";
import { CodeEditor } from "./components/editor/CodeEditor";
import { FilePreview } from "./components/editor/FilePreview";
import { TerminalPanel } from "./components/terminal/TerminalPanel";
import { CommandPalette } from "./components/command/CommandPalette";
import { oqera } from "./lib/oqera";
import type { EditorTab, FileNode, FilePreview as PreviewData, Workspace } from "./types/workspace";

type Locale = "en" | "ar";
type EntryDialog = { mode: "newFile" | "newFolder" | "rename"; parent: string; node?: FileNode; value: string } | null;
const copy = {
  en: { project:"PROJECT", explorer:"Explorer", search:"Search", git:"Source Control", intelligence:"Intelligence", runtime:"Runtime", terminal:"TERMINAL", problems:"PROBLEMS", output:"OUTPUT", tests:"TESTS", empty:"Open a project to start building.", open:"Open Project", settings:"Settings", opening:"Opening…" },
  ar: { project:"المشروع", explorer:"المستكشف", search:"البحث", git:"التحكم بالمصدر", intelligence:"الذكاء", runtime:"التشغيل", terminal:"الطرفية", problems:"المشكلات", output:"المخرجات", tests:"الاختبارات", empty:"افتح مشروعًا لبدء العمل.", open:"فتح مشروع", settings:"الإعدادات", opening:"جارٍ الفتح…" },
} as const;

const joinPath = (parent: string, name: string) => parent ? `${parent}/${name}` : name;
const parentPath = (path: string) => path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
const isPathOrChild = (path: string, base: string) => path === base || path.startsWith(base + "/");

export function App() {
  const [locale, setLocale] = useState<Locale>("en");
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [tabs, setTabs] = useState<EditorTab[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [closeCandidate, setCloseCandidate] = useState<string | null>(null);
  const [entryDialog, setEntryDialog] = useState<EntryDialog>(null);
  const [deleteCandidate, setDeleteCandidate] = useState<FileNode | null>(null);
  const [preview, setPreview] = useState<{path:string;name:string;data:PreviewData}|null>(null);
  const [palette, setPalette] = useState<"quick"|"command"|"search"|null>(null);

  const t = copy[locale], rtl = locale === "ar";
  const activeTab = useMemo(() => tabs.find((x) => x.path === active) ?? null, [tabs, active]);
  const dirty = activeTab ? activeTab.content !== activeTab.savedContent : false;

  useEffect(() => { void oqera.workspace.restore().then((last) => { if (last) setWorkspace(last); }).catch(() => undefined); }, []);
  useEffect(() => { const key=(e:KeyboardEvent)=>{ if(!(e.metaKey||e.ctrlKey))return; const k=e.key.toLowerCase(); if(k==="p"){e.preventDefault();setPalette("quick")} if(k==="k"){e.preventDefault();setPalette("command")} if(k==="f"&&e.shiftKey){e.preventDefault();setPalette("search")} }; window.addEventListener("keydown",key); return()=>window.removeEventListener("keydown",key); }, []);

  async function openWorkspace() {
    setBusy(true); setError(null);
    try {
      const next = await oqera.workspace.open();
      if (next) { setWorkspace(next); setTabs([]); setActive(null); setPreview(null); }
    } catch (e) { setError(String(e)); } finally { setBusy(false); }
  }

  async function refreshWorkspace() {
    if (!workspace) return;
    setError(null);
    try { setWorkspace(await oqera.workspace.refresh()); } catch (e) { setError(String(e)); }
  }

  async function openFile(node: FileNode) {
    if (node.kind !== "file") return;
    const existing = tabs.find((x) => x.path === node.path);
    if (existing) { setActive(node.path); return; }
    setError(null);
    try {
      const info = await oqera.fs.inspect(node.path);
      if (info.kind !== "text") { setPreview({path:node.path,name:node.name,data:info}); setActive(null); return; }
      const content = await oqera.fs.readFile(node.path);
      setPreview(null);
      setTabs((old) => [...old, { path: node.path, name: node.name, content, savedContent: content }]);
      setActive(node.path);
    } catch (e) { setError(String(e)); }
  }

  async function save(contentOverride?: string) {
    if (!activeTab) return;
    const content = contentOverride ?? activeTab.content;
    if (content === activeTab.savedContent) return;
    setError(null);
    try {
      await oqera.fs.writeFile(activeTab.path, content);
      setTabs((old) => old.map((x) => x.path === activeTab.path ? { ...x, content, savedContent: content } : x));
    } catch (e) { setError(String(e)); }
  }

  function requestClose(path: string) {
    const tab = tabs.find((x) => x.path === path);
    if (tab && tab.content !== tab.savedContent) { setCloseCandidate(path); return; }
    closeTabNow(path);
  }

  function closeTabNow(path: string) {
    const index = tabs.findIndex((x) => x.path === path);
    const next = tabs.filter((x) => x.path !== path);
    setTabs(next);
    if (active === path) setActive(next[Math.min(index, next.length - 1)]?.path ?? null);
    setCloseCandidate(null);
  }

  async function saveAndClose() {
    if (!closeCandidate) return;
    const tab = tabs.find((x) => x.path === closeCandidate);
    if (!tab) { setCloseCandidate(null); return; }
    setError(null);
    try { await oqera.fs.writeFile(tab.path, tab.content); closeTabNow(tab.path); }
    catch (e) { setError(String(e)); }
  }

  function explorerAction(action: ExplorerAction, node: FileNode) {
    if (action === "delete") { setDeleteCandidate(node); return; }
    if (action === "rename") { setEntryDialog({ mode:"rename", parent:parentPath(node.path), node, value:node.name }); return; }
    setEntryDialog({ mode:action, parent:node.path, value:"" });
  }

  async function submitEntryDialog() {
    if (!entryDialog) return;
    const name = entryDialog.value.trim();
    if (!name) return;
    setError(null);
    try {
      if (entryDialog.mode === "newFile") {
        const path = joinPath(entryDialog.parent, name);
        await oqera.fs.createFile(path);
        await refreshWorkspace();
        await openFile({ name, path, kind:"file" });
      } else if (entryDialog.mode === "newFolder") {
        await oqera.fs.createFolder(joinPath(entryDialog.parent, name));
        await refreshWorkspace();
      } else if (entryDialog.node) {
        const oldPath = entryDialog.node.path;
        const newPath = await oqera.fs.rename(oldPath, name);
        setTabs((old) => old.map((tab) => isPathOrChild(tab.path, oldPath) ? { ...tab, path:newPath + tab.path.slice(oldPath.length), name:tab.path === oldPath ? name : tab.name } : tab));
        if (active && isPathOrChild(active, oldPath)) setActive(newPath + active.slice(oldPath.length));
        await refreshWorkspace();
      }
      setEntryDialog(null);
    } catch (e) { setError(String(e)); }
  }

  async function confirmDelete() {
    if (!deleteCandidate) return;
    const path = deleteCandidate.path;
    setError(null);
    try {
      await oqera.fs.delete(path);
      const next = tabs.filter((tab) => !isPathOrChild(tab.path, path));
      setTabs(next);
      if (active && isPathOrChild(active, path)) setActive(next[0]?.path ?? null);
      setDeleteCandidate(null);
      await refreshWorkspace();
    } catch (e) { setError(String(e)); }
  }

  function newAtRoot(mode: "newFile" | "newFolder") { setEntryDialog({ mode, parent:"", value:"" }); }

  return <main className="app" dir={rtl ? "rtl" : "ltr"}>
    <header className="titlebar">
      <div className="brand"><OqeraIcon/><strong>OQERA</strong></div>
      <div className="project-title">{workspace?.name ?? "Oqera Workspace"}{dirty ? " •" : ""}</div>
      <div className="title-actions"><button className="locale" onClick={() => setLocale(rtl ? "en" : "ar")}>{rtl ? "EN" : "عربي"}</button><button className="icon-button" aria-label={t.settings}><SettingsIcon/></button></div>
    </header>

    <section className="workspace">
      <nav className="activitybar"><Tool label={t.explorer}><ProjectIcon/></Tool><Tool label={t.search} onClick={()=>setPalette("search")}><SearchIcon/></Tool><Tool label={t.git}><GitIcon/></Tool><Tool label={t.intelligence}><IntelligenceIcon/></Tool><Tool label={t.runtime}><TerminalIcon/></Tool></nav>
      <aside className="sidebar">
        <div className="panel-heading">
          <span>{workspace?.name.toUpperCase() ?? t.project}</span>
          {workspace ? <div className="explorer-actions"><button onClick={() => newAtRoot("newFile")} title="New File" aria-label="New File"><NewFileIcon/></button><button onClick={() => newAtRoot("newFolder")} title="New Folder" aria-label="New Folder"><NewFolderIcon/></button><button onClick={() => void refreshWorkspace()} title="Refresh" aria-label="Refresh"><RefreshIcon/></button></div> : null}
        </div>
        {workspace ? <FileTree nodes={workspace.entries} onOpen={openFile} onAction={explorerAction}/> : <div className="empty-side"><ProjectIcon/><span>{t.empty}</span><button onClick={openWorkspace} disabled={busy}>{busy ? t.opening : t.open}</button></div>}
      </aside>

      <section className="editor">
        <div className="editor-tabs">{tabs.length ? tabs.map((tab) => {
          const isDirty = tab.content !== tab.savedContent;
          return <button key={tab.path} className={"tab " + (active === tab.path ? "active" : "")} onClick={() => setActive(tab.path)}>
            <span className="tab-name">{tab.name}</span>
            <span className={"tab-close " + (isDirty ? "is-dirty" : "")} onClick={(e) => { e.stopPropagation(); requestClose(tab.path); }}>
              {isDirty ? <span className="dirty-dot">●</span> : null}<CloseIcon/>
            </span>
          </button>;
        }) : <div className="tab active">Welcome</div>}</div>
        {error ? <div className="error-banner">{error}<button onClick={() => setError(null)}>×</button></div> : null}
        {activeTab ? <><div className="breadcrumb" dir="ltr">{workspace?.name} / {activeTab.path}</div><CodeEditor key={activeTab.path} tab={activeTab} onChange={(value) => setTabs((old) => old.map((x) => x.path === activeTab.path ? { ...x, content:value } : x))} onSave={save}/></> : preview ? <><div className="breadcrumb" dir="ltr">{workspace?.name} / {preview.path}</div><FilePreview name={preview.name} preview={preview.data}/></> :
          <div className="welcome"><OqeraIcon size={54}/><h1>Oqera</h1><p>{t.empty}</p><button className="primary" onClick={openWorkspace} disabled={busy}>{busy ? t.opening : t.open}</button><div className="hint"><kbd>⌘</kbd><kbd>K</kbd><span>Command Center</span></div></div>}
      </section>
    </section>

    {closeCandidate ? <Modal onBackdrop={() => setCloseCandidate(null)}>
      <div className="dialog-icon">!</div><div className="dialog-copy"><h2>{rtl ? "حفظ التغييرات؟" : "Save changes?"}</h2><p>{rtl ? `لديك تغييرات غير محفوظة في ${tabs.find((x) => x.path === closeCandidate)?.name ?? ""}.` : `You have unsaved changes in ${tabs.find((x) => x.path === closeCandidate)?.name ?? ""}.`}</p></div>
      <div className="dialog-actions"><button onClick={() => setCloseCandidate(null)}>{rtl ? "إلغاء" : "Cancel"}</button><button className="danger-action" onClick={() => closeTabNow(closeCandidate)}>{rtl ? "عدم الحفظ" : "Don't Save"}</button><button className="primary" onClick={() => void saveAndClose()}>{rtl ? "حفظ" : "Save"}</button></div>
    </Modal> : null}

    {entryDialog ? <Modal onBackdrop={() => setEntryDialog(null)}>
      <div className="dialog-copy dialog-full"><h2>{entryDialog.mode === "rename" ? "Rename" : entryDialog.mode === "newFolder" ? "New Folder" : "New File"}</h2><p dir="ltr">{entryDialog.parent || workspace?.name}</p><input autoFocus value={entryDialog.value} onChange={(e) => setEntryDialog({ ...entryDialog, value:e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") void submitEntryDialog(); if (e.key === "Escape") setEntryDialog(null); }}/></div>
      <div className="dialog-actions"><button onClick={() => setEntryDialog(null)}>Cancel</button><button className="primary" disabled={!entryDialog.value.trim()} onClick={() => void submitEntryDialog()}>{entryDialog.mode === "rename" ? "Rename" : "Create"}</button></div>
    </Modal> : null}

    {deleteCandidate ? <Modal onBackdrop={() => setDeleteCandidate(null)}>
      <div className="dialog-icon danger-icon">!</div><div className="dialog-copy"><h2>Delete {deleteCandidate.kind === "directory" ? "folder" : "file"}?</h2><p>This permanently deletes <strong>{deleteCandidate.name}</strong>{deleteCandidate.kind === "directory" ? " and everything inside it." : "."}</p></div>
      <div className="dialog-actions"><button onClick={() => setDeleteCandidate(null)}>Cancel</button><button className="danger-button" onClick={() => void confirmDelete()}>Delete</button></div>
    </Modal> : null}

    {palette&&workspace?<CommandPalette mode={palette} nodes={workspace.entries} onClose={()=>setPalette(null)} onOpen={openFile} onSearch={oqera.workspace.search} onNewFile={()=>newAtRoot("newFile")} onNewFolder={()=>newAtRoot("newFolder")} onRefresh={()=>void refreshWorkspace()}/>:null}

    <section className="bottom"><div className="bottom-tabs"><span className="active">{t.terminal}</span><span>{t.problems}</span><span>{t.output}</span><span>{t.tests}</span></div>{workspace?<TerminalPanel workspaceKey={workspace.root}/>:<div className="terminal">$ <span className="muted">Open a project to start the terminal.</span></div>}</section>
    <footer className="status"><span>⎇ main</span><span>✓ 0</span>{activeTab ? <span>{dirty ? "● Modified" : "Saved"}</span> : null}<span className="grow"/><span>{activeTab?.path ?? "Oqera 0.2.0"}</span></footer>
  </main>;
}

function Modal({ children, onBackdrop }: { children: React.ReactNode; onBackdrop: () => void }) {
  return <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onBackdrop(); }}><div className="save-dialog" role="dialog" aria-modal="true">{children}</div></div>;
}
function Tool({ label, children, onClick }: { label:string; children:React.ReactNode; onClick?:()=>void }) { return <button className="tool" title={label} aria-label={label} onClick={onClick}>{children}</button>; }
