import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import TaskSidebar from './components/TaskSidebar';
import ComparisonView from './components/ComparisonView';
import ComparisonLog from './components/ComparisonLog';
import TaskRankings from './components/TaskRankings';
import Editor from './components/Editor';
import IdManager from './components/IdManager';
import { extractTasks, comparisonsToCSV, generateId, sortMarkdownByRankings, deduplicateComparisons } from './utils/markdownUtils';
import { comparisonsApi, healthCheck, rankingsApi, tasksApi } from './utils/apiClient';
import type { Comparison, Task } from './utils/markdownUtils';
import type { RankedTask } from './utils/apiClient';
import './App.css';

function App() {
  const [markdownContent, setMarkdownContent] = useState<string>(() => {
    // Try to load from localStorage first, fallback to default
    const savedMarkdown = localStorage.getItem('markdown-content');
    if (savedMarkdown) {
      return savedMarkdown;
    }
    return `# Welcome to the Todo Sorter App!

# Both list items and plain text work - choose your preferred format!

# List format (with dashes):
- First task to do
- Second task to do
- Another important task
- [x] Example completed task

# Plain text format (no dashes):
Write the report
Call the client
Review the proposal
Buy groceries

# You can mix and match both formats
- Meeting with team
Schedule dentist appointment
- Low priority task`;
  });
  const [activeTab, setActiveTab] = useState<'editor-compare' | 'log'>('editor-compare');
  const [comparisons, setComparisons] = useState<Comparison[]>([]);
  const [apiStatus, setApiStatus] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [isApiConnected, setIsApiConnected] = useState<boolean>(false);
  const [rankedTasks, setRankedTasks] = useState<RankedTask[]>([]);
  const [isLoadingRankings, setIsLoadingRankings] = useState<boolean>(false);
  const [isUpdatingMarkdown, setIsUpdatingMarkdown] = useState<boolean>(false);
  const [previousTasks, setPreviousTasks] = useState<string[]>([]);
  
  // List ID state for authentication-free access control
  const [listId, setListId] = useState<string>(() => {
    // Try to load from localStorage first
    const saved = localStorage.getItem('todo-list-id');
    if (saved && saved.length >= 8) {
      return saved;
    }
    // Generate a new random ID if none exists
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < 24; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  });

  // To track when we last fetched rankings to avoid too many API calls
  const lastRankingFetchRef = useRef<number>(0);
  // To track pending markdown changes
  const markdownDebounceTimeout = useRef<number | null>(null);
  // To track if we're in the middle of a ranking update to prevent editor jumps
  const rankingUpdateInProgress = useRef<boolean>(false);
  // Cache tasks to prevent disappearing during updates
  const cachedTasksRef = useRef<Task[]>([]);

  // Save the listId to localStorage whenever it changes (including initial generation)
  useEffect(() => {
    if (listId && listId.length >= 8) {
      localStorage.setItem('todo-list-id', listId);
      console.log('Saved list ID to localStorage:', listId);
    }
  }, [listId]);

  // Memoized tasks extraction to avoid unnecessary recalculation
  const tasks = useMemo(() => {
    if (rankingUpdateInProgress.current) {
      // If we're updating rankings, return cached tasks to avoid disappearing
      return cachedTasksRef.current;
    }
    const extractedTasks = extractTasks(markdownContent);
    // Cache the extracted tasks
    cachedTasksRef.current = extractedTasks;
    return extractedTasks;
  }, [markdownContent]);

  // Optimized content matching update method with better state management
  const updateMarkdownWithRankingsByContent = useCallback(async (): Promise<boolean> => {
    console.log('Content matching markdown update starting...');
    if (!isApiConnected || rankingUpdateInProgress.current) {
      console.error('API not connected or update in progress');
      return false;
    }
    
    setIsUpdatingMarkdown(true);
    rankingUpdateInProgress.current = true;
    
    try {
      // Get latest rankings from API if we don't have recent ones
      let rankings = rankedTasks;
      if (rankedTasks.length === 0 || Date.now() - lastRankingFetchRef.current > 5000) {
        rankings = await fetchRankings();
      }
      
      if (rankings.length === 0) {
        console.error('No rankings available');
        return false;
      }
      
      // Get current task contents from the editor
      const currentTasks = extractTasks(markdownContent);
      const currentTaskContents = currentTasks.map(task => task.content);
      
      // Create a map of task content to ranking data
      // Only include rankings for tasks that exist in the editor
      const contentRankMap = new Map();
      rankings
        .filter(task => currentTaskContents.includes(task.content))
        .forEach(apiTask => {
          contentRankMap.set(apiTask.content, {
            score: apiTask.score,
            rank: apiTask.rank
          });
        });
      
      // Track if we've made any changes to avoid unnecessary rerenders
      let hasChanges = false;
      
      // Update the markdown directly by matching content
      const lines = markdownContent.split('\n');
      const updatedLines = lines.map(line => {
        const trimmedLine = line.trim();
        
        // Skip empty lines and comments
        if (!trimmedLine || trimmedLine.startsWith('#')) {
          return line;
        }
        
        let content = trimmedLine;
        let completed = false;
        let prefix = '';
        
        // Check for completion markers and preserve them
        if (trimmedLine.startsWith('✓ ')) {
          completed = true;
          content = trimmedLine.substring(2).trim();
          prefix = '✓ ';
        } else if (trimmedLine.startsWith('[x] ')) {
          completed = true;
          content = trimmedLine.substring(4).trim();
          prefix = '[x] ';
        } else if (trimmedLine.startsWith('[ ] ')) {
          completed = false;
          content = trimmedLine.substring(4).trim();
          prefix = '[ ] ';
        }
        
        // Remove existing ranking info if present
        const rankingMatch = content.match(/^(.+?)\s+\|\s+Rank:\s+\d+\s+\|\s+Score:\s+[-\d.]+$/);
        if (rankingMatch) {
          content = rankingMatch[1];
        }
        
        const rankData = contentRankMap.get(content);
        
        if (rankData) {
          // Base task with completion prefix
          const baseTask = `${prefix}${content}`;
          // New task with ranking
          const newLine = `${baseTask} | Rank: ${rankData.rank} | Score: ${rankData.score.toFixed(2)}`;
          
          // Only consider it a change if the line is actually different
          if (newLine !== line) {
            hasChanges = true;
            return newLine;
          }
        } else {
          // This is a task that doesn't have ranking data
          // If it has ranking information, we should remove it
          if (line.includes(' | Rank:')) {
            hasChanges = true;
            return `${prefix}${content}`;
          }
        }
        
        return line;
      });
      
      if (!hasChanges) {
        console.log('No changes needed in markdown');
        return false;
      }
      
      const updatedMarkdown = updatedLines.join('\n');
      
      // Use setTimeout to batch the state update and avoid editor jumps
      setTimeout(() => {
        setMarkdownContent(updatedMarkdown);
        localStorage.setItem('markdown-content', updatedMarkdown);
        setApiStatus('Markdown updated with latest rankings');
      }, 50);
      
      return true;
    } catch (error) {
      console.error('Error in direct update:', error);
      setApiError('Direct update failed: ' + (error.message || 'Unknown error'));
      return false;
    } finally {
      setIsUpdatingMarkdown(false);
      // Allow task extraction again after a short delay
      setTimeout(() => {
        rankingUpdateInProgress.current = false;
      }, 100);
    }
  }, [isApiConnected, rankedTasks, markdownContent]);

  // Update markdown with rankings calls the content method
  const updateMarkdownWithRankings = useCallback(async (): Promise<boolean> => {
    console.log('Starting updateMarkdownWithRankings');
    return updateMarkdownWithRankingsByContent();
  }, [updateMarkdownWithRankingsByContent]);

  // Optimized editor change handler with better debouncing
  const handleEditorChange = useCallback((value: string) => {
    // Skip if we're in the middle of a ranking update to prevent conflicts
    if (rankingUpdateInProgress.current) {
      return;
    }
    
    // Update the content immediately for responsiveness
    setMarkdownContent(value);
    
    // Clear any pending timeout
    if (markdownDebounceTimeout.current) {
      clearTimeout(markdownDebounceTimeout.current);
    }

    // Set a new timeout to save to localStorage after 1000ms of inactivity (increased for smoother typing)
    markdownDebounceTimeout.current = setTimeout(() => {
      localStorage.setItem('markdown-content', value);
      markdownDebounceTimeout.current = null;
    }, 1000) as unknown as number;
  }, []);

  // Optimized fetch rankings with better throttling
  const fetchRankings = useCallback(async () => {
    console.log('fetchRankings called with:', {
      isApiConnected,
      tasksLength: tasks.length,
      comparisonsLength: comparisons.length,
      listId
    });
    
    if (!isApiConnected || tasks.length === 0 || comparisons.length === 0 || !listId) {
      console.log('Skipping fetchRankings due to missing prerequisites');
      return [];
    }
    
    // Throttle API calls to once every 3 seconds (increased for smoother experience)
    const now = Date.now();
    if (now - lastRankingFetchRef.current < 3000) {
      console.log('Throttling ranking fetch, last fetch was', (now - lastRankingFetchRef.current) / 1000, 'seconds ago');
      return rankedTasks; // Return existing rankings instead of fetching
    }
    
    setIsLoadingRankings(true);
    lastRankingFetchRef.current = now;
    
    try {
      console.log('Calling rankingsApi.getRankings()');
      const rankings = await rankingsApi.getRankings(listId);
      console.log('Rankings received from API:', rankings);
      
      // Filter rankings to only include tasks that exist in the editor
      const currentTaskContents = tasks.map(task => task.content);
      const filteredRankings = rankings.filter(rankedTask => 
        currentTaskContents.includes(rankedTask.content)
      );
      
      setRankedTasks(filteredRankings);
      return filteredRankings;
    } catch (error) {
      console.error('Failed to fetch rankings from API:', error);
      setApiError('Failed to fetch rankings from API');
      return [];
    } finally {
      setIsLoadingRankings(false);
    }
  }, [isApiConnected, tasks.length, comparisons.length, listId, rankedTasks]);

  // Optimized task sync effect with better debouncing
  useEffect(() => {
    // Skip if API is not connected or if we don't have any tasks
    if (!isApiConnected || tasks.length === 0 || rankingUpdateInProgress.current) {
      return;
    }

    // Get current task contents
    const currentTaskContents = tasks.map(task => task.content);
    
    // Check if we have any tasks that aren't in our rankings
    const missingFromRankings = currentTaskContents.some(content => 
      !rankedTasks.some(rankedTask => rankedTask.content === content)
    );
    
    // Check if we have any rankings that aren't in our tasks (should be filtered out)
    const extraInRankings = rankedTasks.some(rankedTask => 
      !currentTaskContents.includes(rankedTask.content)
    );
    
    // If we have inconsistencies, update the rankings with longer delay
    if (missingFromRankings || extraInRankings) {
      console.log('Tasks and rankings are out of sync, refreshing rankings...');
      // Add a longer delay to avoid excessive updates
      const timer = setTimeout(() => {
        fetchRankings();
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [tasks.length, rankedTasks.length, isApiConnected, fetchRankings]);

  // Check API connection on mount
  useEffect(() => {
    const checkApiConnection = async () => {
      try {
        // Check if API is healthy and database is connected
        const isHealthy = await healthCheck();
        setIsApiConnected(isHealthy);
        
        if (isHealthy) {
          setApiStatus('Connected to API with database');
          console.log('API connected with database, loading data from API...');
          
          try {
            // Load data from API
            const apiComparisons = await comparisonsApi.getAllComparisons(listId);
            console.log(`Loaded ${apiComparisons.length} comparisons from API`);
            
            if (apiComparisons.length > 0) {
              setComparisons(apiComparisons);
              
              // Clear localStorage comparisons to prevent confusion with API data
              localStorage.removeItem('comparisons');
              
              // Also fetch rankings with delay to prevent initial jerkiness
              setTimeout(() => {
                fetchRankings();
              }, 500);
            } else {
              console.log('No comparisons found in API, using default data');
            }
          } catch (error) {
            console.error('Failed to load data from API:', error);
            // Fall back to local storage if API fails
            setApiError('Failed to load data from API, using local storage');
            loadFromLocalStorage();
          }
        } else {
          setApiError('Using local storage (no database connection)');
          console.log('No database connection, using local storage');
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
      // Load comparisons from localStorage (markdown is loaded in initial state)
      const savedComparisons = localStorage.getItem('comparisons');
      if (savedComparisons) {
        try {
          const parsedComparisons = JSON.parse(savedComparisons);
          // Convert string dates back to Date objects
          const formattedComparisons = parsedComparisons.map((c: any) => ({
            ...c,
            timestamp: new Date(c.timestamp)
          }));
          
          // Deduplicate comparisons to remove any duplicates
          const deduplicatedComparisons = deduplicateComparisons(formattedComparisons);
          setComparisons(deduplicatedComparisons);
          
          // Update localStorage with deduplicated data
          localStorage.setItem('comparisons', JSON.stringify(deduplicatedComparisons));
        } catch (error) {
          console.error('Failed to parse saved comparisons', error);
        }
      }
    };

    checkApiConnection();
  }, [listId, fetchRankings]);

  // Optimized comparison updates with better delay
  useEffect(() => {
    // Use a reference to track if this effect already ran for this set of comparisons
    const comparisonCount = comparisons.length;
    
    if (isApiConnected && comparisonCount > 0) {
      // Add a longer delay to avoid rapid re-renders
      const timer = setTimeout(() => {
        fetchRankings();
      }, 1000);
      
      return () => clearTimeout(timer);
    }
  }, [comparisons.length, isApiConnected, fetchRankings]);

  // Optimized comparison completion handler
  const handleComparisonComplete = useCallback(async (taskA: Task, taskB: Task, winner: Task) => {
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
        }, listId);
        console.log('Comparison saved to API successfully');
        apiSaveSuccess = true;
        
        // Update local state to reflect the new comparison immediately
        setComparisons(prev => [...prev, newComparison]);
        
      } catch (error) {
        console.error('Failed to save comparison to API:', error);
        setApiError('Failed to save comparison to API, using local storage');
      }
    }
    
    // Only save to localStorage if API is not connected or API save failed
    if (!isApiConnected || !apiSaveSuccess) {
      setComparisons(prev => {
        const updatedComparisons = [...prev, newComparison];
        localStorage.setItem('comparisons', JSON.stringify(updatedComparisons));
        return updatedComparisons;
      });
    }
    
    // After saving comparison, auto-sort the markdown with updated rankings
    if (apiSaveSuccess) {
      console.log('Scheduling automatic markdown sorting after comparison...');
      setTimeout(async () => {
        try {
          // First get the latest rankings
          const latestRankings = await fetchRankings();
          if (latestRankings && latestRankings.length > 0) {
            // Auto-sort the markdown by rankings
            const sortedMarkdown = sortMarkdownByRankings(markdownContent, latestRankings);
            
            // Update the markdown content with the sorted version
            setMarkdownContent(sortedMarkdown);
            localStorage.setItem('markdown-content', sortedMarkdown);
            setApiStatus('Tasks auto-sorted by ranking!');
            console.log('Markdown auto-sorted successfully after comparison');
          } else {
            console.warn('No rankings available for auto-sorting');
          }
        } catch (error) {
          console.error('Failed to auto-sort markdown after comparison:', error);
          setApiError('Failed to auto-sort tasks');
        }
      }, 2000); // Give the API time to process the comparison
    } else {
      // Even without API, we can still save the comparison locally
      setApiStatus('Comparison saved locally');
    }
  }, [tasks, isApiConnected, listId, markdownContent, fetchRankings]);

  // Handle export to CSV
  const handleExportCSV = useCallback(() => {
    const csvContent = comparisonsToCSV(comparisons);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `task-comparisons-${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [comparisons]);

  // Handle export to Markdown
  const handleExportMarkdown = useCallback(() => {
    const blob = new Blob([markdownContent], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `tasks-${new Date().toISOString().split('T')[0]}.md`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [markdownContent]);

  // Optimized task deletion handler with better debouncing
  useEffect(() => {
    // Skip if API is not connected or if we don't have previous tasks data
    if (!isApiConnected || rankingUpdateInProgress.current) {
      // Update the previous tasks array for next comparison
      const currentTaskContents = tasks.map(task => task.content);
      setPreviousTasks(currentTaskContents);
      return;
    }

    const currentTaskContents = tasks.map(task => task.content);
    
    // Compare previous tasks with current tasks only if there's been an actual change
    // to avoid unnecessary deletion API calls
    if (previousTasks.length > 0 && 
        JSON.stringify(previousTasks.sort()) !== JSON.stringify(currentTaskContents.sort())) {
      
      // Find tasks that were in the previous set but not in the current set (they were deleted)
      const deletedTasks = previousTasks.filter(
        prevContent => !currentTaskContents.includes(prevContent)
      );
      
      // If we detected deleted tasks, remove them from the backend with debouncing
      if (deletedTasks.length > 0) {
        console.log(`Detected ${deletedTasks.length} deleted tasks:`, deletedTasks);
        
        // Use timeout to debounce rapid task deletions
        const timer = setTimeout(() => {
          // Delete each removed task from the API
          const deletePromises = deletedTasks.map(async (taskContent) => {
            try {
              const result = await tasksApi.deleteTask(taskContent, listId);
              console.log(`Task "${taskContent}" deletion result:`, result);
              return result;
            } catch (error) {
              console.error(`Failed to delete task "${taskContent}":`, error);
              return false;
            }
          });
          
          // When all deletions are processed, update the rankings
          Promise.all(deletePromises).then(results => {
            if (results.some(result => result)) {
              // At least one task was successfully deleted
              console.log("Successfully deleted tasks, refreshing rankings");
              // Add delay to allow backend to process
              setTimeout(() => {
                fetchRankings();
              }, 1000);
            }
          });
        }, 500); // Debounce task deletions
        
        return () => clearTimeout(timer);
      }
    }
    
    // Update the previous tasks array for next comparison
    // Only update if the content has actually changed
    if (JSON.stringify(previousTasks) !== JSON.stringify(currentTaskContents)) {
      setPreviousTasks(currentTaskContents);
    }
    
    // Only depend on task length changes, not the entire tasks array
    // to avoid unnecessary re-renders and API calls
  }, [tasks.length, isApiConnected, previousTasks, listId, fetchRankings]);

  // Optimized task addition handler with better debouncing
  useEffect(() => {
    // Skip if API is not connected or updating rankings
    if (!isApiConnected || rankingUpdateInProgress.current) {
      return;
    }

    // First, get the current task contents
    const currentTaskContents = tasks.map(task => task.content);
    
    // If we don't have any tasks, or our previous task list is empty, just update the previous list
    if (currentTaskContents.length === 0 || previousTasks.length === 0) {
      setPreviousTasks(currentTaskContents);
      return;
    }
    
    // Find new tasks that were added
    const newTasks = currentTaskContents.filter(
      content => !previousTasks.includes(content)
    );
    
    if (newTasks.length > 0) {
      console.log(`Detected ${newTasks.length} new tasks:`, newTasks);
      
      // Use timeout to debounce rapid task additions
      const timer = setTimeout(() => {
        // Register each new task with the API
        const registerPromises = newTasks.map(async (taskContent) => {
          try {
            const result = await tasksApi.registerTask(taskContent, listId);
            console.log(`Task "${taskContent}" registration result:`, result);
            return result;
          } catch (error) {
            console.error(`Failed to register task "${taskContent}":`, error);
            return false;
          }
        });
        
        // When all registrations are processed, update the rankings
        Promise.all(registerPromises).then(results => {
          if (results.some(result => result)) {
            // At least one task was successfully registered
            console.log("Successfully registered new tasks, refreshing rankings");
            // Add a longer delay to allow the backend to process the registrations
            setTimeout(() => {
              fetchRankings();
            }, 1500);
          }
        });
      }, 500); // Debounce task additions
      
      return () => clearTimeout(timer);
    }
    
    // Now continue with the rest of the function
  }, [tasks.length, isApiConnected, previousTasks, listId, fetchRankings]);

  // Optimized list ID change handler
  const handleListIdChange = useCallback((newListId: string) => {
    setListId(newListId);
    // Clear existing data when switching lists
    setComparisons([]);
    setRankedTasks([]);
    setApiStatus('Switched to new list ID');
    // Reload data for the new list
    if (isApiConnected) {
      setTimeout(() => {
        loadComparisonsFromAPI();
      }, 100);
    }
  }, [isApiConnected]);

  // Optimized comparisons loading
  const loadComparisonsFromAPI = useCallback(async () => {
    if (!isApiConnected || !listId) {
      return;
    }
    
    try {
      console.log('Loading comparisons from API for list:', listId);
      const apiComparisons = await comparisonsApi.getAllComparisons(listId);
      setComparisons(apiComparisons);
      console.log('Loaded', apiComparisons.length, 'comparisons from API');
      
      // Also fetch rankings if we have comparisons with delay
      if (apiComparisons.length > 0) {
        setTimeout(() => {
          fetchRankings();
        }, 500);
      }
    } catch (error) {
      console.error('Failed to load comparisons from API:', error);
      setApiError('Failed to load comparisons from API');
    }
  }, [isApiConnected, listId, fetchRankings]);

  return (
    <div className="flex flex-col min-h-screen w-full bg-gradient-to-br from-indigo-50 to-blue-50 dark:from-gray-900 dark:to-gray-800 text-gray-900 dark:text-gray-100">
      {/* Modern Navbar */}
      <header className="bg-white dark:bg-gray-800 shadow-sm sticky top-0 z-10 backdrop-blur-md bg-opacity-90 dark:bg-opacity-90">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-3">
              <div className="flex-shrink-0">
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center shadow-lg">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                  </svg>
                </div>
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">Comparison Sorter</h1>
            </div>
            
            {/* API Status Indicator - modern badge */}
            {isApiConnected ? (
              <div className="flex items-center space-x-1 px-3 py-1.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800/50">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <span>API Connected</span>
              </div>
            ) : (
              <div className="flex items-center space-x-1 px-3 py-1.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800/50">
                <span className="relative flex h-2 w-2">
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                </span>
                <span>Local Storage Mode</span>
              </div>
            )}
          </div>
        </div>
      </header>
      
      {/* Debug Info (development only) */}
      {process.env.NODE_ENV !== 'production' && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2">
          <details className="mt-2 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden transition-all duration-200">
            <summary className="cursor-pointer font-medium text-sm text-indigo-600 dark:text-indigo-400 px-4 py-3 focus:outline-none hover:bg-gray-50 dark:hover:bg-gray-750">
              Debug Information
            </summary>
            <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 text-xs space-y-3">
              <div>
                <h3 className="font-semibold text-gray-700 dark:text-gray-300">API Status:</h3>
                <pre className="mt-1 bg-white dark:bg-gray-800 p-2 rounded-md border border-gray-200 dark:border-gray-700 overflow-auto text-xs text-gray-600 dark:text-gray-400">
                  {JSON.stringify({ isApiConnected, apiStatus, apiError }, null, 2)}
                </pre>
              </div>
              
              <div>
                <h3 className="font-semibold text-gray-700 dark:text-gray-300">Tasks from Markdown:</h3>
                <pre className="mt-1 bg-white dark:bg-gray-800 p-2 rounded-md border border-gray-200 dark:border-gray-700 overflow-auto text-xs text-gray-600 dark:text-gray-400">
                  {JSON.stringify(tasks, null, 2)}
                </pre>
              </div>
              
              <div>
                <h3 className="font-semibold text-gray-700 dark:text-gray-300">Rankings:</h3>
                <pre className="mt-1 bg-white dark:bg-gray-800 p-2 rounded-md border border-gray-200 dark:border-gray-700 overflow-auto text-xs text-gray-600 dark:text-gray-400">
                  {JSON.stringify(rankedTasks, null, 2)}
                </pre>
              </div>
              
              <div>
                <h3 className="font-semibold text-gray-700 dark:text-gray-300">Comparisons:</h3>
                <pre className="mt-1 bg-white dark:bg-gray-800 p-2 rounded-md border border-gray-200 dark:border-gray-700 overflow-auto text-xs text-gray-600 dark:text-gray-400">
                  {JSON.stringify(comparisons.slice(0, 3), null, 2)}
                  {comparisons.length > 3 && ` ... (${comparisons.length - 3} more)`}
                </pre>
              </div>
            </div>
          </details>
        </div>
      )}
      
      {/* ID Manager */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <IdManager listId={listId} onListIdChange={handleListIdChange} />
      </div>
      
      {/* Main Content */}
      <div className="flex-grow w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left column: Markdown Editor */}
          <div className="space-y-6">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="flex justify-between items-center px-4 py-3 bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700">
                <h2 className="text-base font-medium text-gray-700 dark:text-gray-300">Task List (Auto-Sorted)</h2>
                <div className="flex items-center space-x-3">
                  <div className="text-xs text-gray-500 dark:text-gray-400 italic">Each line is a task. Use - for lists. Auto-sorts by ranking after comparisons.</div>
                  <button
                    onClick={handleExportMarkdown}
                    className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md shadow-sm bg-green-600 text-white hover:bg-green-700 dark:bg-green-700 dark:hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 dark:focus:ring-offset-gray-800 transition-all duration-200"
                  >
                    <svg className="w-3 h-3 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Export .md
                  </button>
                </div>
              </div>
              <div className="h-96">
                <Editor
                  value={markdownContent}
                  onChange={handleEditorChange}
                />
              </div>
            </div>
            
            {/* Quick stats */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4">
              <div className="flex justify-between items-center text-sm">
                <span className="text-gray-600 dark:text-gray-400">
                  Tasks: <span className="font-medium text-gray-900 dark:text-gray-100">{tasks.length}</span>
                </span>
                <span className="text-gray-600 dark:text-gray-400">
                  Comparisons: <span className="font-medium text-gray-900 dark:text-gray-100">{comparisons.length}</span>
                </span>
                <button
                  onClick={handleExportCSV}
                  className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 text-xs font-medium"
                >
                  Export Log
                </button>
              </div>
            </div>
          </div>
          
          {/* Right column: Comparison view */}
          <div className="space-y-6">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="px-4 py-3 bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700">
                <h2 className="text-base font-medium text-gray-700 dark:text-gray-300">
                  Make Comparisons
                  <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">(Click or use 1/2 keys)</span>
                </h2>
              </div>
              <div className="p-6">
                <ComparisonView 
                  tasks={tasks} 
                  comparisons={comparisons}
                  onComparisonComplete={handleComparisonComplete} 
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Modern toast notifications */}
      <div className="fixed bottom-4 right-4 max-w-xs z-50 space-y-2 pointer-events-none">
        {apiStatus && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg border-l-4 border-emerald-500 dark:border-emerald-600 px-4 py-3 transform transition-all duration-300 ease-in-out animate-fade-in-right pointer-events-auto">
            <div className="flex items-start">
              <div className="flex-shrink-0 pt-0.5">
                <svg className="h-5 w-5 text-emerald-500 dark:text-emerald-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm text-gray-800 dark:text-gray-200">{apiStatus}</p>
              </div>
            </div>
          </div>
        )}
        
        {apiError && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg border-l-4 border-amber-500 dark:border-amber-600 px-4 py-3 transform transition-all duration-300 ease-in-out animate-fade-in-right pointer-events-auto">
            <div className="flex items-start">
              <div className="flex-shrink-0 pt-0.5">
                <svg className="h-5 w-5 text-amber-500 dark:text-amber-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm text-gray-800 dark:text-gray-200">{apiError}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
