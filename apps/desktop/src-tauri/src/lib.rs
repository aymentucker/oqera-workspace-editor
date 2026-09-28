use serde::Serialize;
use std::{fs, path::{Path, PathBuf}, sync::Mutex};
use tauri::State;

#[derive(Default)]
struct WorkspaceState(Mutex<Option<PathBuf>>);

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct WorkspacePayload { name: String, root: String, entries: Vec<FileNode> }

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct FileNode { name: String, path: String, kind: &'static str, children: Option<Vec<FileNode>> }

const IGNORED: &[&str] = &[".git", "node_modules", "target", "dist", ".next", ".turbo"];

fn tree(root: &Path, dir: &Path) -> Result<Vec<FileNode>, String> {
    let mut nodes = Vec::new();
    let entries = fs::read_dir(dir).map_err(|e| e.to_string())?;
    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        if IGNORED.contains(&name.as_str()) { continue; }
        let meta = entry.file_type().map_err(|e| e.to_string())?;
        if meta.is_symlink() { continue; }
        let relative = path.strip_prefix(root).map_err(|e| e.to_string())?.to_string_lossy().to_string();
        if meta.is_dir() {
            nodes.push(FileNode { name, path: relative, kind: "directory", children: Some(tree(root, &path)?) });
        } else if meta.is_file() {
            nodes.push(FileNode { name, path: relative, kind: "file", children: None });
        }
    }
    nodes.sort_by(|a,b| match (a.kind,b.kind) { ("directory","file") => std::cmp::Ordering::Less, ("file","directory") => std::cmp::Ordering::Greater, _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()) });
    Ok(nodes)
}

fn safe_path(state: &WorkspaceState, relative: &str) -> Result<PathBuf, String> {
    let guard = state.0.lock().map_err(|_| "Workspace state unavailable".to_string())?;
    let root = guard.as_ref().ok_or("No workspace is open")?;
    let root = root.canonicalize().map_err(|e| e.to_string())?;
    let candidate = root.join(relative).canonicalize().map_err(|e| e.to_string())?;
    if !candidate.starts_with(&root) { return Err("Path is outside the open workspace".into()); }
    Ok(candidate)
}

#[tauri::command]
fn open_workspace(state: State<WorkspaceState>) -> Result<Option<WorkspacePayload>, String> {
    let Some(root) = rfd::FileDialog::new().pick_folder() else { return Ok(None); };
    let root = root.canonicalize().map_err(|e| e.to_string())?;
    let entries = tree(&root, &root)?;
    let name = root.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_else(|| "Workspace".into());
    *state.0.lock().map_err(|_| "Workspace state unavailable".to_string())? = Some(root.clone());
    Ok(Some(WorkspacePayload { name, root: root.to_string_lossy().to_string(), entries }))
}

#[tauri::command]
fn read_workspace_file(path: String, state: State<WorkspaceState>) -> Result<String, String> {
    let path = safe_path(&state, &path)?;
    let bytes = fs::read(path).map_err(|e| e.to_string())?;
    if bytes.len() > 5 * 1024 * 1024 { return Err("File is larger than the 5 MB editor limit".into()); }
    if bytes.iter().take(8192).any(|b| *b == 0) { return Err("Binary files cannot be opened in the text editor".into()); }
    String::from_utf8(bytes).map_err(|_| "This file is not valid UTF-8 text".into())
}

#[tauri::command]
fn save_workspace_file(path: String, content: String, state: State<WorkspaceState>) -> Result<(), String> {
    let path = safe_path(&state, &path)?;
    if !path.is_file() { return Err("Only existing files can be saved in this milestone".into()); }
    fs::write(path, content).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(WorkspaceState::default())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![open_workspace, read_workspace_file, save_workspace_file])
        .run(tauri::generate_context!())
        .expect("error while running Oqera");
}
