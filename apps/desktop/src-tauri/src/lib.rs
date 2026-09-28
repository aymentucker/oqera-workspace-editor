use serde::Serialize;
use std::{fs, path::{Component, Path, PathBuf}, sync::Mutex};
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
    for entry in fs::read_dir(dir).map_err(|e| e.to_string())? {
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
    nodes.sort_by(|a,b| match (a.kind,b.kind) {
        ("directory","file") => std::cmp::Ordering::Less,
        ("file","directory") => std::cmp::Ordering::Greater,
        _ => a.name.to_lowercase().cmp(&b.name.to_lowercase())
    });
    Ok(nodes)
}

fn root_path(state: &WorkspaceState) -> Result<PathBuf, String> {
    let guard = state.0.lock().map_err(|_| "Workspace state unavailable".to_string())?;
    guard.as_ref().cloned().ok_or_else(|| "No workspace is open".into())
}

fn validate_relative(relative: &str) -> Result<(), String> {
    if relative.trim().is_empty() { return Ok(()); }
    let p = Path::new(relative);
    if p.is_absolute() || p.components().any(|c| matches!(c, Component::ParentDir | Component::RootDir | Component::Prefix(_))) {
        return Err("Invalid workspace path".into());
    }
    Ok(())
}

fn existing_path(state: &WorkspaceState, relative: &str) -> Result<PathBuf, String> {
    validate_relative(relative)?;
    let root = root_path(state)?.canonicalize().map_err(|e| e.to_string())?;
    let candidate = root.join(relative).canonicalize().map_err(|e| e.to_string())?;
    if !candidate.starts_with(&root) { return Err("Path is outside the open workspace".into()); }
    Ok(candidate)
}

fn new_path(state: &WorkspaceState, relative: &str) -> Result<PathBuf, String> {
    validate_relative(relative)?;
    let root = root_path(state)?.canonicalize().map_err(|e| e.to_string())?;
    let candidate = root.join(relative);
    let parent = candidate.parent().ok_or("Invalid path")?.canonicalize().map_err(|e| e.to_string())?;
    if !parent.starts_with(&root) { return Err("Path is outside the open workspace".into()); }
    Ok(candidate)
}

fn workspace_payload(state: &WorkspaceState) -> Result<WorkspacePayload, String> {
    let root = root_path(state)?.canonicalize().map_err(|e| e.to_string())?;
    let name = root.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_else(|| "Workspace".into());
    Ok(WorkspacePayload { name, root: root.to_string_lossy().to_string(), entries: tree(&root, &root)? })
}

#[tauri::command]
fn open_workspace(state: State<WorkspaceState>) -> Result<Option<WorkspacePayload>, String> {
    let Some(root) = rfd::FileDialog::new().pick_folder() else { return Ok(None); };
    let root = root.canonicalize().map_err(|e| e.to_string())?;
    *state.0.lock().map_err(|_| "Workspace state unavailable".to_string())? = Some(root);
    workspace_payload(&state).map(Some)
}

#[tauri::command]
fn refresh_workspace(state: State<WorkspaceState>) -> Result<WorkspacePayload, String> {
    workspace_payload(&state)
}

#[tauri::command]
fn read_workspace_file(path: String, state: State<WorkspaceState>) -> Result<String, String> {
    let path = existing_path(&state, &path)?;
    let bytes = fs::read(path).map_err(|e| e.to_string())?;
    if bytes.len() > 5 * 1024 * 1024 { return Err("File is larger than the 5 MB editor limit".into()); }
    if bytes.iter().take(8192).any(|b| *b == 0) { return Err("Binary files cannot be opened in the text editor".into()); }
    String::from_utf8(bytes).map_err(|_| "This file is not valid UTF-8 text".into())
}

#[tauri::command]
fn save_workspace_file(path: String, content: String, state: State<WorkspaceState>) -> Result<(), String> {
    let path = existing_path(&state, &path)?;
    if !path.is_file() { return Err("Only files can be saved".into()); }
    fs::write(path, content).map_err(|e| e.to_string())
}

#[tauri::command]
fn create_workspace_file(path: String, state: State<WorkspaceState>) -> Result<(), String> {
    let path = new_path(&state, &path)?;
    if path.exists() { return Err("A file or folder with that name already exists".into()); }
    fs::File::create(path).map(|_| ()).map_err(|e| e.to_string())
}

#[tauri::command]
fn create_workspace_folder(path: String, state: State<WorkspaceState>) -> Result<(), String> {
    let path = new_path(&state, &path)?;
    if path.exists() { return Err("A file or folder with that name already exists".into()); }
    fs::create_dir(path).map_err(|e| e.to_string())
}

#[tauri::command]
fn rename_workspace_entry(path: String, new_name: String, state: State<WorkspaceState>) -> Result<String, String> {
    if new_name.trim().is_empty() || new_name.contains('/') || new_name.contains('\\') || new_name == "." || new_name == ".." {
        return Err("Invalid name".into());
    }
    let source = existing_path(&state, &path)?;
    let parent = source.parent().ok_or("Cannot rename workspace root")?;
    let destination = parent.join(new_name.trim());
    if destination.exists() { return Err("A file or folder with that name already exists".into()); }
    fs::rename(&source, &destination).map_err(|e| e.to_string())?;
    let root = root_path(&state)?.canonicalize().map_err(|e| e.to_string())?;
    destination.strip_prefix(root).map(|p| p.to_string_lossy().to_string()).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_workspace_entry(path: String, state: State<WorkspaceState>) -> Result<(), String> {
    let target = existing_path(&state, &path)?;
    if target.is_dir() { fs::remove_dir_all(target).map_err(|e| e.to_string()) } else { fs::remove_file(target).map_err(|e| e.to_string()) }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(WorkspaceState::default())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            open_workspace, refresh_workspace, read_workspace_file, save_workspace_file,
            create_workspace_file, create_workspace_folder, rename_workspace_entry, delete_workspace_entry
        ])
        .run(tauri::generate_context!())
        .expect("error while running Oqera");
}
