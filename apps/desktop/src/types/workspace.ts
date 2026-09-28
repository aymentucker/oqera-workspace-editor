export type FileNode={name:string;path:string;kind:"file"|"directory";children?:FileNode[]};
export type Workspace={name:string;root:string;entries:FileNode[]};
export type EditorTab={path:string;name:string;content:string;savedContent:string};
export type FilePreview={kind:"text"|"image"|"binary";mime:string;size:number;dataUrl?:string|null};
export type SearchHit={path:string;line:number;preview:string};
