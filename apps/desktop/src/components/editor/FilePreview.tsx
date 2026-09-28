import type { FilePreview as Preview } from "../../types/workspace";
import { FileIcon, ImageIcon } from "../../icons";
const size=(n:number)=>n<1024?`${n} B`:n<1048576?`${(n/1024).toFixed(1)} KB`:`${(n/1048576).toFixed(1)} MB`;
export function FilePreview({name,preview}:{name:string;preview:Preview}){
 if(preview.kind==="image"&&preview.dataUrl)return <div className="file-preview"><div className="image-stage"><img src={preview.dataUrl} alt={name}/></div><div className="preview-meta"><ImageIcon/><strong>{name}</strong><span>{preview.mime} · {size(preview.size)}</span></div></div>;
 return <div className="binary-preview"><FileIcon name={name}/><h2>{name}</h2><p>{preview.mime}</p><span>{size(preview.size)}</span><small>This file is binary and is not editable as text.</small></div>
}