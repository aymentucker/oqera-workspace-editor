import Editor from "@monaco-editor/react";
import type { EditorTab } from "../../types/workspace";

export function CodeEditor({
  tab,
  onChange,
  onSave,
}: {
  tab: EditorTab;
  onChange: (value: string) => void;
  onSave: (value: string) => void;
}) {
  return (
    <div className="code-editor" dir="ltr">
      <Editor
        path={tab.path}
        value={tab.content}
        theme="vs-dark"
        onChange={(value) => onChange(value ?? "")}
        onMount={(editor, monaco) => {
          editor.addCommand(
            monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS,
            () => {
              void onSave(editor.getValue());
            },
          );
          editor.focus();
        }}
        options={{
          fontSize: 14,
          fontFamily: '"JetBrains Mono","SFMono-Regular",Consolas,monospace',
          fontLigatures: true,
          lineHeight: 22,
          minimap: { enabled: false },
          smoothScrolling: true,
          scrollBeyondLastLine: false,
          renderWhitespace: "selection",
          padding: { top: 12 },
          automaticLayout: true,
          wordWrap: "off",
          tabSize: 2,
          insertSpaces: true,
        }}
      />
    </div>
  );
}
