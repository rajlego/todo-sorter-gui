import React from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { markdown } from '@codemirror/lang-markdown';

interface EditorProps {
  value: string;
  onChange: (value: string) => void;
}

const Editor: React.FC<EditorProps> = ({ value, onChange }) => {
  return (
    <div className="h-full">
      <CodeMirror
        value={value}
        height="100%"
        extensions={[markdown()]}
        onChange={onChange}
        theme="dark"
        className="h-full"
        basicSetup={{
          lineNumbers: true,
          highlightActiveLine: true,
          highlightSelectionMatches: true,
          autocompletion: true,
          foldGutter: true,
        }}
      />
    </div>
  );
};

export default Editor; 