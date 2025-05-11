import React, { useState } from 'react';
import MonacoEditor from '@monaco-editor/react';
import { fetchHealth } from './api';

function App() {
  const [markdown, setMarkdown] = useState<string>(
    '# Welcome to the Comparison Sorter App!\n\nEdit this markdown and see Monaco Editor in action.'
  );
  const [apiStatus, setApiStatus] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);

  const checkApi = async () => {
    setApiStatus(null);
    setApiError(null);
    try {
      const status = await fetchHealth();
      setApiStatus(status);
    } catch (err: any) {
      setApiError(err.message || 'Unknown error');
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-4">
      <h1 className="text-4xl font-bold text-blue-600 mb-4">Comparison Sorter App</h1>
      <p className="text-lg text-gray-700 mb-6">React + Vite + Tailwind CSS + Monaco Editor</p>
      <div className="w-full max-w-2xl h-96 shadow-lg border border-gray-200 rounded mb-6">
        <MonacoEditor
          height="100%"
          defaultLanguage="markdown"
          value={markdown}
          onChange={value => setMarkdown(value || '')}
          options={{
            minimap: { enabled: false },
            wordWrap: 'on',
            fontSize: 16,
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