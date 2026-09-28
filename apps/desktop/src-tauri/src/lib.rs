use base64::{engine::general_purpose::STANDARD, Engine as _};
use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use serde::Serialize;
use std::{collections::HashMap, fs, io::{Read, Write}, path::{Component, Path, PathBuf}, sync::{atomic::{AtomicU32, Ordering}, Mutex}};
use tauri::{ipc::Channel, State};

#[derive(Default)]
struct WorkspaceState(Mutex<Option<PathBuf>>);
#[derive(Default)]
struct TerminalState { next: AtomicU32, writers: Mutex<HashMap<u32, Box<dyn Write + Send>>> }

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct WorkspacePayload { name: String, root: String, entries: Vec<FileNode> }
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct FileNode { name: String, path: String, kind: &'static str, children: Option<Vec<FileNode>> }
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct FilePreview { kind: &'static str, mime: String, size: u64, data_url: Option<String> }
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SearchHit { path: String, line: usize, preview: String }

const IGNORED: &[&str] = &[".git","node_modules","target","dist",".next",".turbo"];

fn tree(root:&Path, dir:&Path)->Result<Vec<FileNode>,String>{
 let mut nodes=Vec::new();
 for entry in fs::read_dir(dir).map_err(|e|e.to_string())?{
  let entry=entry.map_err(|e|e.to_string())?; let path=entry.path(); let name=entry.file_name().to_string_lossy().to_string();
  if IGNORED.contains(&name.as_str()){continue} let meta=entry.file_type().map_err(|e|e.to_string())?; if meta.is_symlink(){continue}
  let relative=path.strip_prefix(root).map_err(|e|e.to_string())?.to_string_lossy().to_string();
  if meta.is_dir(){nodes.push(FileNode{name,path:relative,kind:"directory",children:Some(tree(root,&path)?)})}
  else if meta.is_file(){nodes.push(FileNode{name,path:relative,kind:"file",children:None})}
 }
 nodes.sort_by(|a,b|match(a.kind,b.kind){("directory","file")=>std::cmp::Ordering::Less,("file","directory")=>std::cmp::Ordering::Greater,_=>a.name.to_lowercase().cmp(&b.name.to_lowercase())}); Ok(nodes)
}
fn root_path(state:&WorkspaceState)->Result<PathBuf,String>{state.0.lock().map_err(|_|"Workspace state unavailable".to_string())?.as_ref().cloned().ok_or_else(||"No workspace is open".into())}
fn validate_relative(relative:&str)->Result<(),String>{let p=Path::new(relative);if p.is_absolute()||p.components().any(|c|matches!(c,Component::ParentDir|Component::RootDir|Component::Prefix(_))){Err("Invalid workspace path".into())}else{Ok(())}}
fn existing_path(state:&WorkspaceState,relative:&str)->Result<PathBuf,String>{validate_relative(relative)?;let root=root_path(state)?.canonicalize().map_err(|e|e.to_string())?;let p=root.join(relative).canonicalize().map_err(|e|e.to_string())?;if !p.starts_with(&root){return Err("Path is outside the open workspace".into())}Ok(p)}
fn new_path(state:&WorkspaceState,relative:&str)->Result<PathBuf,String>{validate_relative(relative)?;let root=root_path(state)?.canonicalize().map_err(|e|e.to_string())?;let p=root.join(relative);let parent=p.parent().ok_or("Invalid path")?.canonicalize().map_err(|e|e.to_string())?;if !parent.starts_with(&root){return Err("Path is outside the open workspace".into())}Ok(p)}
fn payload(state:&WorkspaceState)->Result<WorkspacePayload,String>{let root=root_path(state)?.canonicalize().map_err(|e|e.to_string())?;let name=root.file_name().map(|n|n.to_string_lossy().to_string()).unwrap_or_else(||"Workspace".into());Ok(WorkspacePayload{name,root:root.to_string_lossy().to_string(),entries:tree(&root,&root)?})}
fn persist_workspace(root:&Path){if let Some(home)=std::env::var_os("HOME"){let _=fs::write(PathBuf::from(home).join(".oqera-last-workspace"),root.to_string_lossy().as_bytes());}}
fn mime_for(path:&Path)->&'static str{match path.extension().and_then(|x|x.to_str()).unwrap_or("").to_lowercase().as_str(){"png"=>"image/png","jpg"|"jpeg"=>"image/jpeg","gif"=>"image/gif","webp"=>"image/webp","svg"=>"image/svg+xml","bmp"=>"image/bmp","ico"=>"image/x-icon","pdf"=>"application/pdf","zip"=>"application/zip","woff"=>"font/woff","woff2"=>"font/woff2","ttf"=>"font/ttf","otf"=>"font/otf",_=>"application/octet-stream"}}

#[tauri::command] fn open_workspace(state:State<WorkspaceState>)->Result<Option<WorkspacePayload>,String>{let Some(root)=rfd::FileDialog::new().pick_folder() else{return Ok(None)};let root=root.canonicalize().map_err(|e|e.to_string())?;*state.0.lock().map_err(|_|"Workspace state unavailable".to_string())?=Some(root.clone());persist_workspace(&root);payload(&state).map(Some)}
#[tauri::command] fn restore_workspace(state:State<WorkspaceState>)->Result<Option<WorkspacePayload>,String>{let Some(home)=std::env::var_os("HOME") else{return Ok(None)};let marker=PathBuf::from(home).join(".oqera-last-workspace");let Ok(raw)=fs::read_to_string(marker) else{return Ok(None)};let root=PathBuf::from(raw.trim());if !root.is_dir(){return Ok(None)}let root=root.canonicalize().map_err(|e|e.to_string())?;*state.0.lock().map_err(|_|"Workspace state unavailable".to_string())?=Some(root);payload(&state).map(Some)}
#[tauri::command] fn refresh_workspace(state:State<WorkspaceState>)->Result<WorkspacePayload,String>{payload(&state)}
#[tauri::command] fn read_workspace_file(path:String,state:State<WorkspaceState>)->Result<String,String>{let p=existing_path(&state,&path)?;let bytes=fs::read(p).map_err(|e|e.to_string())?;if bytes.len()>5*1024*1024{return Err("File is larger than the 5 MB editor limit".into())}if bytes.iter().take(8192).any(|b|*b==0){return Err("Binary file".into())}String::from_utf8(bytes).map_err(|_|"Binary file".into())}
#[tauri::command] fn inspect_workspace_file(path:String,state:State<WorkspaceState>)->Result<FilePreview,String>{let p=existing_path(&state,&path)?;let meta=fs::metadata(&p).map_err(|e|e.to_string())?;let mime=mime_for(&p).to_string();let is_image=mime.starts_with("image/");if is_image&&meta.len()<=10*1024*1024{let bytes=fs::read(&p).map_err(|e|e.to_string())?;return Ok(FilePreview{kind:"image",mime:mime.clone(),size:meta.len(),data_url:Some(format!("data:{};base64,{}",mime,STANDARD.encode(bytes)))})}let mut file=fs::File::open(&p).map_err(|e|e.to_string())?;let mut head=vec![0;8192];let n=file.read(&mut head).map_err(|e|e.to_string())?;head.truncate(n);let binary=head.iter().any(|b|*b==0)||std::str::from_utf8(&head).is_err();Ok(FilePreview{kind:if binary{"binary"}else{"text"},mime,size:meta.len(),data_url:None})}
#[tauri::command] fn save_workspace_file(path:String,content:String,state:State<WorkspaceState>)->Result<(),String>{let p=existing_path(&state,&path)?;if !p.is_file(){return Err("Only files can be saved".into())}fs::write(p,content).map_err(|e|e.to_string())}
#[tauri::command] fn create_workspace_file(path:String,state:State<WorkspaceState>)->Result<(),String>{let p=new_path(&state,&path)?;if p.exists(){return Err("A file or folder with that name already exists".into())}fs::File::create(p).map(|_|()).map_err(|e|e.to_string())}
#[tauri::command] fn create_workspace_folder(path:String,state:State<WorkspaceState>)->Result<(),String>{let p=new_path(&state,&path)?;if p.exists(){return Err("A file or folder with that name already exists".into())}fs::create_dir(p).map_err(|e|e.to_string())}
#[tauri::command] fn rename_workspace_entry(path:String,new_name:String,state:State<WorkspaceState>)->Result<String,String>{if new_name.trim().is_empty()||new_name.contains('/')||new_name.contains('\\')||new_name=="."||new_name==".."{return Err("Invalid name".into())}let src=existing_path(&state,&path)?;let dst=src.parent().ok_or("Cannot rename workspace root")?.join(new_name.trim());if dst.exists(){return Err("A file or folder with that name already exists".into())}fs::rename(&src,&dst).map_err(|e|e.to_string())?;let root=root_path(&state)?.canonicalize().map_err(|e|e.to_string())?;dst.strip_prefix(root).map(|p|p.to_string_lossy().to_string()).map_err(|e|e.to_string())}
#[tauri::command] fn delete_workspace_entry(path:String,state:State<WorkspaceState>)->Result<(),String>{let p=existing_path(&state,&path)?;if p.is_dir(){fs::remove_dir_all(p).map_err(|e|e.to_string())}else{fs::remove_file(p).map_err(|e|e.to_string())}}
#[tauri::command] fn search_workspace(query:String,state:State<WorkspaceState>)->Result<Vec<SearchHit>,String>{if query.trim().is_empty(){return Ok(vec![])}let root=root_path(&state)?;let mut hits=Vec::new();fn walk(root:&Path,dir:&Path,q:&str,hits:&mut Vec<SearchHit>){if hits.len()>=200{return}let Ok(entries)=fs::read_dir(dir)else{return};for e in entries.flatten(){let p=e.path();let name=e.file_name().to_string_lossy().to_string();if IGNORED.contains(&name.as_str()){continue}let Ok(ft)=e.file_type()else{continue};if ft.is_dir(){walk(root,&p,q,hits)}else if ft.is_file(){let Ok(bytes)=fs::read(&p)else{continue};if bytes.len()>2*1024*1024||bytes.iter().take(8192).any(|b|*b==0){continue}let Ok(text)=String::from_utf8(bytes)else{continue};for(line_no,line)in text.lines().enumerate(){if line.to_lowercase().contains(q){hits.push(SearchHit{path:p.strip_prefix(root).unwrap_or(&p).to_string_lossy().to_string(),line:line_no+1,preview:line.trim().chars().take(180).collect()});if hits.len()>=200{return}}}}}}walk(&root,&root,&query.to_lowercase(),&mut hits);Ok(hits)}

#[tauri::command]
fn terminal_start(on_data:Channel<String>,workspace:State<WorkspaceState>,terminals:State<TerminalState>)->Result<u32,String>{
 let pty=native_pty_system().openpty(PtySize{rows:24,cols:100,pixel_width:0,pixel_height:0}).map_err(|e|e.to_string())?;
 let shell=std::env::var("SHELL").unwrap_or_else(|_|"/bin/zsh".into());let mut cmd=CommandBuilder::new(shell);if let Ok(root)=root_path(&workspace){cmd.cwd(root)}
 let _child=pty.slave.spawn_command(cmd).map_err(|e|e.to_string())?;let mut reader=pty.master.try_clone_reader().map_err(|e|e.to_string())?;let writer=pty.master.take_writer().map_err(|e|e.to_string())?;
 let id=terminals.next.fetch_add(1,Ordering::Relaxed)+1;terminals.writers.lock().map_err(|_|"Terminal state unavailable".to_string())?.insert(id,writer);
 std::thread::spawn(move||{let mut buf=[0u8;4096];loop{match reader.read(&mut buf){Ok(0)|Err(_)=>break,Ok(n)=>{let _=on_data.send(String::from_utf8_lossy(&buf[..n]).to_string());}}}});Ok(id)
}
#[tauri::command] fn terminal_write(id:u32,data:String,terminals:State<TerminalState>)->Result<(),String>{let mut map=terminals.writers.lock().map_err(|_|"Terminal state unavailable".to_string())?;let w=map.get_mut(&id).ok_or("Terminal session not found")?;w.write_all(data.as_bytes()).and_then(|_|w.flush()).map_err(|e|e.to_string())}

#[cfg_attr(mobile,tauri::mobile_entry_point)]
pub fn run(){tauri::Builder::default().manage(WorkspaceState::default()).manage(TerminalState::default()).plugin(tauri_plugin_opener::init()).invoke_handler(tauri::generate_handler![open_workspace,restore_workspace,refresh_workspace,read_workspace_file,inspect_workspace_file,save_workspace_file,create_workspace_file,create_workspace_folder,rename_workspace_entry,delete_workspace_entry,search_workspace,terminal_start,terminal_write]).run(tauri::generate_context!()).expect("error while running Oqera");}
