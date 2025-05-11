import React, { useState, useCallback, useEffect } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { markdown } from '@codemirror/lang-markdown';
import TaskSidebar from './components/TaskSidebar';
import ComparisonView from './components/ComparisonView';
import ComparisonLog from './components/ComparisonLog';
import { extractTasks, comparisonsToCSV, generateId } from './utils/markdownUtils';
import type { Comparison, Task } from './utils/markdownUtils';

function App() {
  const [markdownContent, setMarkdownContent] = useState<string>(
    '# Welcome to the Comparison Sorter App!\n\n## Tasks\n- [ ] First task to do\n- [ ] Second task to do\n- [ ] Another important task\n- [ ] Low priority task\n\nEdit this markdown to add more tasks.'
  );
  const [activeTab, setActiveTab] = useState<'editor-compare' | 'log'>('editor-compare');
  const [comparisons, setComparisons] = useState<Comparison[]>([]);
  const [apiStatus, setApiStatus] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);

  // Extract tasks from markdown
  const tasks = extractTasks(markdownContent);

  // Handle changes in the editor
  const handleEditorChange = useCallback((value: string) => {
    setMarkdownContent(value);
    localStorage.setItem('markdown-content', value);
  }, []);

  // Handle comparison completion
  const handleComparisonComplete = (taskA: Task, taskB: Task, winner: Task) => {
    // Make sure we have complete Task objects with line property
    const completeTaskA = tasks.find(t => t.id === taskA.id) || taskA;
    const completeTaskB = tasks.find(t => t.id === taskB.id) || taskB;
    const completeWinner = tasks.find(t => t.id === winner.id) || winner;
    
    const newComparison: Comparison = {
      id: generateId(),
      taskA: completeTaskA,
      taskB: completeTaskB,
      winner: completeWinner,
      timestamp: new Date()
    };
    
    setComparisons(prev => {
      const updatedComparisons = [...prev, newComparison];
      localStorage.setItem('comparisons', JSON.stringify(updatedComparisons));
      return updatedComparisons;
    });
  };

  // Handle export to CSV
  const handleExportCSV = () => {
    const csvContent = comparisonsToCSV(comparisons);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `task-comparisons-${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Load data from localStorage on mount
  useEffect(() => {
    const savedMarkdown = localStorage.getItem('markdown-content');
    if (savedMarkdown) {
      setMarkdownContent(savedMarkdown);
    }
    
    const savedComparisons = localStorage.getItem('comparisons');
    if (savedComparisons) {
      try {
        const parsedComparisons = JSON.parse(savedComparisons);
        // Convert string dates back to Date objects
        const formattedComparisons = parsedComparisons.map((c: any) => ({
          ...c,
          timestamp: new Date(c.timestamp)
        }));
        setComparisons(formattedComparisons);
      } catch (error) {
        console.error('Failed to parse saved comparisons', error);
      }
    }
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto py-4 px-4 sm:px-6 lg:px-8">
          <h1 className="text-2xl font-bold text-blue-600">Comparison Sorter App</h1>
        </div>
      </header>
      
      {/* Navigation Tabs */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-8">
            <button
              onClick={() => setActiveTab('editor-compare')}
              className={`py-2 px-1 border-b-2 ${
                activeTab === 'editor-compare'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              } transition`}
            >
              Editor & Compare
            </button>
            <button
              onClick={() => setActiveTab('log')}
              className={`py-2 px-1 border-b-2 ${
                activeTab === 'log'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              } transition`}
            >
              Comparison Log
            </button>
          </nav>
        </div>
      </div>
      
      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {activeTab === 'editor-compare' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left side: Editor and Tasks */}
            <div className="space-y-6">
              <div className="bg-white shadow rounded-lg overflow-hidden h-[400px]">
                <div className="h-full">
                  <CodeMirror
                    value={markdownContent}
                    height="100%"
                    extensions={[markdown()]}
                    onChange={handleEditorChange}
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
              </div>
              <div className="h-[250px]">
                <TaskSidebar markdown={markdownContent} />
              </div>
            </div>
            
            {/* Right side: Comparison View */}
            <div>
              <ComparisonView tasks={tasks} onComparisonComplete={handleComparisonComplete} />
            </div>
          </div>
        )}
        
        {activeTab === 'log' && (
          <div className="max-w-4xl mx-auto">
            <ComparisonLog comparisons={comparisons} onExport={handleExportCSV} />
          </div>
        )}
      </main>

      {/* Status Messages */}
      {(apiStatus || apiError) && (
        <div className="fixed bottom-4 right-4 max-w-xs">
          {apiStatus && (
            <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded shadow-md mb-2">
              {apiStatus}
            </div>
          )}
          {apiError && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded shadow-md">
              {apiError}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default App;
