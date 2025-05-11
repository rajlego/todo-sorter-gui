import { useState, useCallback, useEffect } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { markdown } from '@codemirror/lang-markdown';
import TaskSidebar from './components/TaskSidebar';
import ComparisonView from './components/ComparisonView';
import ComparisonLog from './components/ComparisonLog';
import TaskRankings from './components/TaskRankings';
import { extractTasks, comparisonsToCSV, generateId } from './utils/markdownUtils';
import { comparisonsApi, healthCheck } from './utils/apiClient';
import type { Comparison, Task } from './utils/markdownUtils';

function App() {
  const [markdownContent, setMarkdownContent] = useState<string>(
    '# Welcome to the Comparison Sorter App!\n\n## Tasks\n- [ ] First task to do\n- [ ] Second task to do\n- [ ] Another important task\n- [ ] Low priority task\n\nEdit this markdown to add more tasks.'
  );
  const [activeTab, setActiveTab] = useState<'editor-compare' | 'log'>('editor-compare');
  const [comparisons, setComparisons] = useState<Comparison[]>([]);
  const [apiStatus, setApiStatus] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [isApiConnected, setIsApiConnected] = useState<boolean>(false);

  // Extract tasks from markdown
  const tasks = extractTasks(markdownContent);

  // Check API connection on mount
  useEffect(() => {
    const checkApiConnection = async () => {
      try {
        const isHealthy = await healthCheck();
        setIsApiConnected(isHealthy);
        if (isHealthy) {
          setApiStatus('Connected to Railway API');
          
          // If connected, load data from API
          try {
            const apiComparisons = await comparisonsApi.getAllComparisons();
            if (apiComparisons.length > 0) {
              setComparisons(apiComparisons);
            }
          } catch (error) {
            console.error('Failed to load comparisons from API:', error);
            // Fall back to local storage if API fails
            loadFromLocalStorage();
          }
        } else {
          setApiError('Not connected to Railway API, using local storage');
          loadFromLocalStorage();
        }
      } catch (error) {
        console.error('API health check error:', error);
        setApiError('API connection error, using local storage');
        setIsApiConnected(false);
        loadFromLocalStorage();
      }
    };

    const loadFromLocalStorage = () => {
      // Load data from localStorage
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
    };

    checkApiConnection();
  }, []);

  // Handle changes in the editor
  const handleEditorChange = useCallback((value: string) => {
    setMarkdownContent(value);
    localStorage.setItem('markdown-content', value);
    
    // Ideally, we would also send the markdown to the API
    // But for simplicity, we'll just extract tasks locally
  }, []);

  // Handle comparison completion
  const handleComparisonComplete = async (taskA: Task, taskB: Task, winner: Task) => {
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
    
    // If API is connected, send comparison to API
    if (isApiConnected) {
      try {
        await comparisonsApi.addComparison({
          taskA: completeTaskA,
          taskB: completeTaskB,
          winner: completeWinner
        });
      } catch (error) {
        console.error('Failed to save comparison to API:', error);
        setApiError('Failed to save comparison to API, using local storage');
      }
    }
    
    // Always save to local state and localStorage for fallback
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

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto py-4 px-4 sm:px-6 lg:px-8 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-blue-600">Comparison Sorter App</h1>
          
          {/* API Status Indicator */}
          {isApiConnected ? (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
              <svg className="-ml-0.5 mr-1.5 h-2 w-2 text-green-400" fill="currentColor" viewBox="0 0 8 8">
                <circle cx="4" cy="4" r="3" />
              </svg>
              API Connected
            </span>
          ) : (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
              <svg className="-ml-0.5 mr-1.5 h-2 w-2 text-yellow-400" fill="currentColor" viewBox="0 0 8 8">
                <circle cx="4" cy="4" r="3" />
              </svg>
              Using Local Storage
            </span>
          )}
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
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left side: Editor and Tasks */}
            <div className="lg:col-span-6 space-y-6">
              <div className="bg-white shadow rounded-lg overflow-hidden h-[300px]">
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
              <div className="h-[200px]">
                <TaskSidebar markdown={markdownContent} />
              </div>
            </div>
            
            {/* Right side: Comparison View and Rankings */}
            <div className="lg:col-span-6 space-y-6">
              <div>
                <ComparisonView tasks={tasks} onComparisonComplete={handleComparisonComplete} />
              </div>
              <div>
                <TaskRankings tasks={tasks} comparisons={comparisons} />
              </div>
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
            <div className="bg-yellow-100 border border-yellow-400 text-yellow-700 px-4 py-3 rounded shadow-md">
              {apiError}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default App;
