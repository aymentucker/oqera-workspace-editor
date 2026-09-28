import { useEffect, useState } from "react";
import type { FileNode } from "../../types/workspace";
import { ChevronIcon, FileIcon, FolderIcon } from "../../icons";

export type ExplorerAction = "newFile" | "newFolder" | "rename" | "delete";

export function FileTree({
  nodes,
  onOpen,
  onAction,
}: {
  nodes: FileNode[];
  onOpen: (node: FileNode) => void;
  onAction: (action: ExplorerAction, node: FileNode) => void;
}) {
  return <div className="file-tree" onContextMenu={(e) => e.preventDefault()}>{nodes.map((n) => <TreeNode key={n.path} node={n} depth={0} onOpen={onOpen} onAction={onAction} />)}</div>;
}

function TreeNode({ node, depth, onOpen, onAction }: { node: FileNode; depth: number; onOpen: (n: FileNode) => void; onAction: (action: ExplorerAction, node: FileNode) => void }) {
  const [open, setOpen] = useState(depth < 1);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const folder = node.kind === "directory";

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener("pointerdown", close);
    window.addEventListener("blur", close);
    return () => { window.removeEventListener("pointerdown", close); window.removeEventListener("blur", close); };
  }, [menu]);

  return <>
    <button
      className="tree-row"
      style={{ paddingInlineStart: 8 + depth * 14 }}
      onClick={() => folder ? setOpen(!open) : onOpen(node)}
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setMenu({ x: e.clientX, y: e.clientY }); }}
      title={node.path}
    >
      {folder ? <span className={"chevron " + (open ? "open" : "")}><ChevronIcon /></span> : <span className="chevron-spacer" />}
      {folder ? <FolderIcon open={open} /> : <FileIcon name={node.name} />}
      <span className="tree-name">{node.name}</span>
    </button>
    {folder && open && node.children ? <TreeNodeList nodes={node.children} depth={depth + 1} onOpen={onOpen} onAction={onAction} /> : null}
    {menu ? <div className="context-menu" style={{ left: menu.x, top: menu.y }} onPointerDown={(e) => e.stopPropagation()}>
      {folder ? <><button onClick={() => { setMenu(null); onAction("newFile", node); }}>New File</button><button onClick={() => { setMenu(null); onAction("newFolder", node); }}>New Folder</button><div className="context-separator" /></> : null}
      <button onClick={() => { setMenu(null); onAction("rename", node); }}>Rename</button>
      <button className="danger" onClick={() => { setMenu(null); onAction("delete", node); }}>Delete</button>
    </div> : null}
  </>;
}

function TreeNodeList({ nodes, depth, onOpen, onAction }: { nodes: FileNode[]; depth: number; onOpen: (n: FileNode) => void; onAction: (action: ExplorerAction, node: FileNode) => void }) {
  return <>{nodes.map((n) => <TreeNode key={n.path} node={n} depth={depth} onOpen={onOpen} onAction={onAction} />)}</>;
}
