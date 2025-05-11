import React, { useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { markdown } from '@codemirror/lang-markdown';

function App() {
  const [markdownContent, setMarkdownContent] = useState<string>(
    '# Welcome to the Comparison Sorter App!\n\n## Tasks\n- [ ] First task to do\n- [ ] Second task to do\n- [ ] Another important task\n\nEdit this markdown to add more tasks.'
  );
  const [apiStatus, setApiStatus] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);

  // Dummy API check function for now
  const checkApi = async () => {
    setApiStatus('API check not implemented yet');
    setApiError(null);
  };

  const onChange = React.useCallback((value: string) => {
    setMarkdownContent(value);
    console.log('CodeMirror onChange:', value);
  }, []);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-4">
      <h1 className="text-4xl font-bold text-blue-600 mb-4">Comparison Sorter App</h1>
      <p className="text-lg text-gray-700 mb-6">React + Vite + Tailwind CSS + CodeMirror</p>
      <div className="w-full max-w-2xl h-96 shadow-lg border border-gray-200 rounded mb-6 overflow-hidden">
        <CodeMirror
          value={markdownContent}
          height="100%"
          extensions={[markdown()]}
          onChange={onChange}
          theme="light"
          basicSetup={{
            lineNumbers: true,
            highlightActiveLine: true,
            highlightSelectionMatches: true,
            autocompletion: true,
            foldGutter: true,
          }}
        />
      </div>
      <button
        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition mb-2"
        onClick={checkApi}
      >
        Test Railway Backend API
      </button>
      {apiStatus && <div className="text-green-600">API Response: {apiStatus}</div>}
      {apiError && <div className="text-red-600">API Error: {apiError}</div>}
    </div>
  );
}

export default App;
