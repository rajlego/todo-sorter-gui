import { useState, useCallback, useEffect } from 'react';
import TaskSidebar from './components/TaskSidebar';
import ComparisonView from './components/ComparisonView';
import ComparisonLog from './components/ComparisonLog';
import TaskRankings from './components/TaskRankings';
import Editor from './components/Editor';
import { extractTasks, comparisonsToCSV, generateId } from './utils/markdownUtils';
import { comparisonsApi, healthCheck, tasksApi, rankingsApi } from './utils/apiClient';
import type { Comparison, Task } from './utils/markdownUtils';
import type { RankedTask } from './utils/apiClient';

function App() {
  const [markdownContent, setMarkdownContent] = useState<string>(
    '# Welcome to the Comparison Sorter App!\n\n## Tasks\n- [ ] First task to do\n- [ ] Second task to do\n- [ ] Another important task\n- [ ] Low priority task\n\nEdit this markdown to add more tasks.'
  );
  const [activeTab, setActiveTab] = useState<'editor-compare' | 'log'>('editor-compare');
  const [comparisons, setComparisons] = useState<Comparison[]>([]);
  const [apiStatus, setApiStatus] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [isApiConnected, setIsApiConnected] = useState<boolean>(false);
  const [rankedTasks, setRankedTasks] = useState<RankedTask[]>([]);
  const [isLoadingRankings, setIsLoadingRankings] = useState<boolean>(false);
  const [registeredTasks, setRegisteredTasks] = useState<Set<string>>(new Set());

  // Extract tasks from markdown
  const tasks = extractTasks(markdownContent);
  
  // Get only tasks that are registered with the API
  const getRegisteredTasks = useCallback(() => {
    if (!isApiConnected) return tasks;
    return tasks.filter(task => registeredTasks.has(task.content));
  }, [tasks, registeredTasks, isApiConnected]);

  // Fetch tasks from API and update registeredTasks
  const fetchApiTasks = async () => {
    if (!isApiConnected) return [];
    
    try {
      const apiTasks = await tasksApi.getAllTasks();
      console.log('Fetched tasks from API:', apiTasks);
      
      // Update registeredTasks with task contents
      const taskContents = new Set(apiTasks.map(t => t.content));
      setRegisteredTasks(taskContents);
      
      return apiTasks;
    } catch (error) {
      console.error('Failed to fetch tasks from API:', error);
      return [];
    }
  };

  // Direct content matching update method
  const updateMarkdownWithRankingsByContent = async (): Promise<boolean> => {
    console.log('Content matching markdown update starting...');
    if (!isApiConnected) {
      console.error('API not connected');
      return false;
    }
    
    try {
      // Get latest rankings from API
      const rankings = await fetchRankings();
      if (rankings.length === 0) {
        console.error('No rankings available');
        return false;
      }
      
      // Create a map of task content to ranking data
      const contentRankMap = new Map();
      rankings.forEach(apiTask => {
        contentRankMap.set(apiTask.content, {
          score: apiTask.score,
          rank: apiTask.rank
        });
      });
      
      // Update the markdown directly by matching content
      const lines = markdownContent.split('\n');
      const updatedLines = lines.map(line => {
        // Check if line is a task
        const taskMatch = line.match(/^-\s\[([ x])\]\s(.+?)(?:\s+\|\s+Rank:\s+\d+\s+\|\s+Score:\s+[-\d.]+)?$/);
        if (!taskMatch) return line;
        
        const content = taskMatch[2];
        const rankData = contentRankMap.get(content);
        
        if (rankData) {
          console.log(`Found ranking for "${content}": rank=${rankData.rank}, score=${rankData.score}`);
          // Base task without ranking
          const baseTask = `- [${taskMatch[1]}] ${content}`;
          // Return task with ranking appended
          return `${baseTask} | Rank: ${rankData.rank} | Score: ${rankData.score.toFixed(2)}`;
        }
        
        return line;
      });
      
      const updatedMarkdown = updatedLines.join('\n');
      console.log('Updated markdown sample:', updatedMarkdown.substring(0, 200));
      
      if (updatedMarkdown === markdownContent) {
        console.warn('No changes made to markdown');
        setApiError('No changes made to markdown - could not match tasks with rankings');
        return false;
      }
      
      setMarkdownContent(updatedMarkdown);
      localStorage.setItem('markdown-content', updatedMarkdown);
      setApiStatus('Markdown updated with latest rankings');
      return true;
    } catch (error) {
      console.error('Error in direct update:', error);
      setApiError('Direct update failed: ' + (error.message || 'Unknown error'));
      return false;
    }
  };

  // Update markdown with rankings (now calls the content method)
  const updateMarkdownWithRankings = async (): Promise<boolean> => {
    console.log('Starting updateMarkdownWithRankings');
    return updateMarkdownWithRankingsByContent();
  };

  // Detect and register new tasks with the API
  const detectAndRegisterNewTasks = async (newMarkdown: string) => {
    if (!isApiConnected) return;
    
    // Extract tasks from new markdown
    const currentTasks = extractTasks(newMarkdown);
    console.log('Current tasks in markdown:', currentTasks);
    
    try {
      // Get existing tasks from API
      const apiTasks = await tasksApi.getAllTasks();
      const apiTaskContents = new Set(apiTasks.map(t => t.content));
      console.log('Existing task contents in API:', apiTaskContents);
      
      // Find new tasks by comparing content
      const newTasks = currentTasks.filter(task => !apiTaskContents.has(task.content));
      
      if (newTasks.length > 0) {
        console.log(`Found ${newTasks.length} new tasks to register with API:`, newTasks);
        
        // Register each new task with the API
        for (const task of newTasks) {
          try {
            await tasksApi.addTask({
              content: task.content,
              completed: task.completed,
              line: task.line
            });
            console.log(`Successfully registered new task with API: "${task.content}"`);
            
            // Update registeredTasks
            setRegisteredTasks(prev => new Set([...prev, task.content]));
          } catch (error) {
            console.error(`Failed to register task "${task.content}" with API:`, error);
          }
        }
        
        setApiStatus(`Registered ${newTasks.length} new tasks with API`);
      } else {
        console.log('No new tasks to register with API');
      }
    } catch (error) {
      console.error('Error detecting and registering new tasks:', error);
    }
  };

  // Fetch rankings from API
  const fetchRankings = async () => {
    console.log('fetchRankings called with:', {
      isApiConnected,
      tasksLength: tasks.length,
      comparisonsLength: comparisons.length
    });
    
    if (!isApiConnected || tasks.length === 0 || comparisons.length === 0) {
      console.log('Skipping fetchRankings due to missing prerequisites');
      return [];
    }
    
    setIsLoadingRankings(true);
    try {
      console.log('Calling rankingsApi.getRankings()');
      const rankings = await rankingsApi.getRankings();
      console.log('Rankings received from API:', rankings);
      setRankedTasks(rankings);
      setIsLoadingRankings(false);
      return rankings;
    } catch (error) {
      console.error('Failed to fetch rankings from API:', error);
      setApiError('Failed to fetch rankings from API');
      setIsLoadingRankings(false);
      return [];
    }
  };

  // Sync local tasks to API
  const syncTasksToAPI = async (localTasks: Task[]) => {
    if (!isApiConnected || localTasks.length === 0) return;
    
    try {
      // Get existing tasks from API
      const apiTasks = await tasksApi.getAllTasks();
      const apiTaskContents = new Set(apiTasks.map(t => t.content));
      
      // Register any new tasks with the API
      let newTasksCount = 0;
      for (const task of localTasks) {
        // Skip if this task is already in the API
        if (apiTaskContents.has(task.content)) continue;
        
        try {
          await tasksApi.addTask({
            content: task.content,
            completed: task.completed,
            line: task.line
          });
          apiTaskContents.add(task.content);
          newTasksCount++;
        } catch (error) {
          console.error(`Failed to register task ${task.id} with API:`, error);
        }
      }
      
      // Update registeredTasks
      setRegisteredTasks(apiTaskContents);
      
      if (newTasksCount > 0) {
        setApiStatus(`Synchronized ${newTasksCount} new tasks with API`);
      } else {
        setApiStatus('Tasks synchronized with API');
      }
    } catch (error) {
      console.error('Failed to sync tasks with API:', error);
      setApiError('Failed to sync tasks with API');
    }
  };

  // Check API connection on mount
  useEffect(() => {
    const checkApiConnection = async () => {
      try {
        const isHealthy = await healthCheck();
        setIsApiConnected(isHealthy);
        if (isHealthy) {
          setApiStatus('Connected to Railway API');
          
          try {
            // Get existing tasks from API and update registeredTasks
            const apiTasks = await fetchApiTasks();
            
            // Sync local tasks with API
            await syncTasksToAPI(tasks);
            
            // If connected, load data from API
            const apiComparisons = await comparisonsApi.getAllComparisons();
            if (apiComparisons.length > 0) {
              setComparisons(apiComparisons);
              
              // Also fetch rankings
              fetchRankings();
            }
          } catch (error) {
            console.error('Failed to load data from API:', error);
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

  // Sync tasks whenever markdown content changes and we're connected to API
  useEffect(() => {
    if (isApiConnected) {
      syncTasksToAPI(tasks);
    }
  }, [markdownContent, isApiConnected]);

  // Update rankings when comparisons change
  useEffect(() => {
    if (isApiConnected && comparisons.length > 0) {
      fetchRankings();
    }
  }, [comparisons, isApiConnected]);

  // Handle changes in the editor
  const handleEditorChange = useCallback((value: string) => {
    setMarkdownContent(value);
    localStorage.setItem('markdown-content', value);
    
    // Detect and register any new tasks that were added
    detectAndRegisterNewTasks(value);
  }, [isApiConnected]);

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
    
    // Flag to track if we saved to API successfully
    let apiSaveSuccess = false;
    
    // If API is connected, send comparison to API
    if (isApiConnected) {
      try {
        console.log('Sending comparison to API...');
        await comparisonsApi.addComparison({
          taskA: completeTaskA,
          taskB: completeTaskB,
          winner: completeWinner
        });
        console.log('Comparison saved to API successfully');
        apiSaveSuccess = true;
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
    
    // After saving comparison, update the rankings
    // Only if API save was successful
    if (apiSaveSuccess) {
      // Use a timeout to allow the API to update its rankings
      console.log('Scheduling automatic markdown update...');
      setTimeout(async () => {
        try {
          console.log('Automatically updating markdown with rankings after comparison...');
          const success = await updateMarkdownWithRankingsByContent();
          if (success) {
            console.log('Automatic markdown update successful');
          } else {
            console.warn('Automatic markdown update did not make any changes');
          }
        } catch (updateError) {
          console.error('Failed to auto-update markdown with rankings:', updateError);
        }
      }, 1000); // Use a slightly longer timeout to ensure the backend has processed the comparison
    }
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
      
      {/* Debug Info (development only) */}
      {process.env.NODE_ENV !== 'production' && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2 bg-gray-100 text-xs overflow-x-auto">
          <details>
            <summary className="cursor-pointer font-semibold">Debug Info</summary>
            <div className="mt-2 mb-2">
              <h3 className="font-bold">API Status:</h3>
              <pre className="bg-white p-2 rounded mt-1">
                {JSON.stringify({ isApiConnected, apiStatus, apiError }, null, 2)}
              </pre>
              
              <h3 className="font-bold mt-3">Tasks from Markdown:</h3>
              <pre className="bg-white p-2 rounded mt-1">
                {JSON.stringify(tasks, null, 2)}
              </pre>
              
              <h3 className="font-bold mt-3">Registered Tasks:</h3>
              <pre className="bg-white p-2 rounded mt-1">
                {JSON.stringify(Array.from(registeredTasks), null, 2)}
              </pre>
              
              <h3 className="font-bold mt-3">Rankings:</h3>
              <pre className="bg-white p-2 rounded mt-1">
                {JSON.stringify(rankedTasks, null, 2)}
              </pre>
              
              <h3 className="font-bold mt-3">Comparisons:</h3>
              <pre className="bg-white p-2 rounded mt-1">
                {JSON.stringify(comparisons.slice(0, 3), null, 2)}
                {comparisons.length > 3 && ` ... (${comparisons.length - 3} more)`}
              </pre>
              
              <div className="mt-3 flex gap-2">
                <button
                  onClick={async () => {
                    console.log('Debug - Comparing tasks and rankings...');
                    if (!isApiConnected) return;
                    
                    try {
                      const rankings = await rankingsApi.getRankings();
                      console.log('= Task ID Comparison =');
                      console.log('Tasks from markdown:');
                      tasks.forEach(task => console.log(`  ${task.id}: "${task.content}"`));
                      console.log('Tasks from API:');
                      rankings.forEach(task => console.log(`  ${task.id}: "${task.content}"`));
                      
                      // Look for matches
                      console.log('= Content Matches =');
                      tasks.forEach(t1 => {
                        const match = rankings.find(t2 => t1.content === t2.content);
                        console.log(`Task "${t1.content}" - markdown ID: ${t1.id}, API ID: ${match ? match.id : 'NO MATCH'}`);
                      });
                    } catch (error) {
                      console.error('Error comparing tasks:', error);
                    }
                  }}
                  className="px-2 py-1 bg-blue-500 text-white rounded hover:bg-blue-600"
                >
                  Debug Compare Tasks with API
                </button>
                
                <button
                  onClick={async () => {
                    if (!window.confirm('This will clear the current tasks on the API and re-sync all tasks from the markdown. Continue?')) return;
                    
                    if (!isApiConnected) {
                      console.error('API not connected');
                      return;
                    }
                    
                    try {
                      console.log('Force syncing all tasks...');
                      for (const task of tasks) {
                        await tasksApi.addTask({
                          content: task.content,
                          completed: task.completed,
                          line: task.line
                        });
                        console.log(`Registered task: ${task.content}`);
                      }
                      console.log('Task sync complete');
                      
                      // Update registeredTasks
                      setRegisteredTasks(new Set(tasks.map(t => t.content)));
                      
                      alert('Task sync complete. You may need to refresh the page to see changes.');
                    } catch (error) {
                      console.error('Error syncing tasks:', error);
                    }
                  }}
                  className="px-2 py-1 bg-red-500 text-white rounded hover:bg-red-600"
                >
                  Force Re-Sync All Tasks to API
                </button>
              </div>
            </div>
          </details>
        </div>
      )}
      
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
                  <Editor
                    value={markdownContent}
                    onChange={handleEditorChange}
                  />
                </div>
              </div>
              <div className="h-[200px]">
                <TaskSidebar markdown={markdownContent} />
              </div>
              
              {/* Add button to update markdown with rankings */}
              <div className="flex justify-end space-x-2">
                <button
                  onClick={updateMarkdownWithRankings}
                  disabled={!isApiConnected || isLoadingRankings || comparisons.length === 0}
                  className={`inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white 
                  ${!isApiConnected || isLoadingRankings || comparisons.length === 0 
                    ? 'bg-gray-300 cursor-not-allowed' 
                    : 'bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500'}`}
                >
                  {isLoadingRankings ? (
                    <>
                      <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Loading...
                    </>
                  ) : (
                    'Update Markdown with Rankings'
                  )}
                </button>
                
                {/* Add a direct content-based update button for testing */}
                {process.env.NODE_ENV !== 'production' && (
                  <button
                    onClick={async () => {
                      console.log('Testing direct content matching update...');
                      const success = await updateMarkdownWithRankingsByContent();
                      if (success) {
                        console.log('Direct update successful');
                      } else {
                        console.error('Direct update failed');
                      }
                    }}
                    className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                    disabled={!isApiConnected || isLoadingRankings || comparisons.length === 0}
                  >
                    Direct Content Match Update
                  </button>
                )}
              </div>
            </div>
            
            {/* Right side: Comparison View and Rankings */}
            <div className="lg:col-span-6 space-y-6">
              <div>
                {/* Use only registered tasks for comparison */}
                <ComparisonView 
                  tasks={getRegisteredTasks()} 
                  onComparisonComplete={handleComparisonComplete} 
                />
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
