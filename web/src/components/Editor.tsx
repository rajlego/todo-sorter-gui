import React, { useEffect, useState, useMemo, useCallback } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { markdown } from '@codemirror/lang-markdown';

interface EditorProps {
  value: string;
  onChange: (value: string) => void;
}

const Editor: React.FC<EditorProps> = ({ value, onChange }) => {
  const [isDarkMode, setIsDarkMode] = useState(false);

  // Detect system dark mode preference
  useEffect(() => {
    const darkModeQuery = window.matchMedia('(prefers-color-scheme: dark)');
    setIsDarkMode(darkModeQuery.matches);

    const handleChange = (e: MediaQueryListEvent) => {
      setIsDarkMode(e.matches);
    };

    darkModeQuery.addEventListener('change', handleChange);
    return () => darkModeQuery.removeEventListener('change', handleChange);
  }, []);

  // Memoize extensions to prevent unnecessary re-creation
  const extensions = useMemo(() => [markdown()], []);

  // Memoize basic setup configuration
  const basicSetup = useMemo(() => ({
    lineNumbers: true,
    highlightActiveLine: true,
    highlightSelectionMatches: true,
    autocompletion: true,
    foldGutter: true,
    indentOnInput: true,
  }), []);

  // Memoize the onChange handler to prevent unnecessary re-renders
  const handleChange = useCallback((val: string) => {
    onChange(val);
  }, [onChange]);

  return (
    <div className="h-full w-full font-mono rounded-b-lg overflow-hidden">
      <CodeMirror
        value={value}
        height="100%"
        extensions={extensions}
        onChange={handleChange}
        theme={isDarkMode ? 'dark' : 'light'}
        className="h-full"
        basicSetup={basicSetup}
      />
    </div>
  );
};

export default React.memo(Editor); 