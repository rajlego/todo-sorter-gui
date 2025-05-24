import React, { useEffect, useState } from 'react';
import type { Task, Comparison } from '../utils/markdownUtils';
import { rankingsApi } from '../utils/apiClient';
import type { RankedTask } from '../utils/apiClient';

interface TaskRankingsProps {
  tasks: Task[];
  comparisons: Comparison[];
  listId: string;
}

const TaskRankings: React.FC<TaskRankingsProps> = ({ tasks, comparisons, listId }) => {
  const [rankedTasks, setRankedTasks] = useState<RankedTask[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch rankings from the API when tasks or comparisons change
  useEffect(() => {
    const fetchRankings = async () => {
      // If no tasks, reset rankings and return
      if (tasks.length === 0) {
        setRankedTasks([]);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        // If we have comparisons, fetch from API
        if (comparisons.length > 0) {
          const rankings = await rankingsApi.getRankings(listId);
          
          // Get all current task contents
          const taskContents = tasks.map(task => task.content);
          
          // Filter API rankings to only include tasks that exist in the editor
          const apiRankedTasks = rankings.filter(rankedTask => 
            taskContents.includes(rankedTask.content)
          );
          
          // Find tasks that don't have API rankings yet
          const rankedTaskContents = apiRankedTasks.map(task => task.content);
          const unrankedTasks = tasks.filter(task => 
            !rankedTaskContents.includes(task.content)
          );
          
          // Create default rankings for unranked tasks (score 0)
          const defaultRankedTasks = unrankedTasks.map(task => ({
            id: task.id,
            content: task.content,
            completed: task.completed,
            line: task.line,
            score: 0,
            rank: 0 // Will be reassigned below
          }));
          
          // Combine API rankings with default rankings
          const allTasks = [...apiRankedTasks, ...defaultRankedTasks];
          
          // Sort all tasks by score descending and reassign ranks
          const rerankedTasks = allTasks
            .sort((a, b) => a.score > b.score ? -1 : 1) // Sort by score descending
            .map((task, idx) => ({
              ...task,
              rank: idx + 1 // Re-assign ranks (1-based)
            }));
          
          setRankedTasks(rerankedTasks);
        } else {
          // If no comparisons yet, show tasks with default ranks and scores
          const defaultRankedTasks = tasks.map((task, index) => ({
            id: task.id,
            content: task.content,
            completed: task.completed,
            line: task.line,
            score: 0,
            rank: index + 1
          }));
          setRankedTasks(defaultRankedTasks);
        }
      } catch (err) {
        console.error('Failed to fetch rankings:', err);
        setError('Failed to fetch rankings. Using local sorting as fallback.');
        
        // Fallback to our local calculation if the API call fails
        const localRankedTasks = tasks.map((task, index) => ({
          id: task.id,
          content: task.content,
          completed: task.completed,
          line: task.line,
          score: 0,
          rank: index + 1
        }));
        setRankedTasks(localRankedTasks);
      } finally {
        setLoading(false);
      }
    };

    fetchRankings();
  }, [tasks, comparisons, listId]);

  // Show loading state
  if (loading) {
    return (
      <div className="flex justify-center items-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-indigo-500 dark:border-indigo-400"></div>
        <span className="ml-3 text-gray-600 dark:text-gray-400">Loading rankings...</span>
      </div>
    );
  }

  // Show error state with fallback ranking
  if (error) {
    return (
      <div className="p-6 rounded-lg bg-red-50 dark:bg-red-900/20 text-center">
        <svg className="mx-auto h-10 w-10 text-red-500 dark:text-red-400 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <h3 className="text-lg font-medium text-red-800 dark:text-red-300 mb-2">Failed to load rankings</h3>
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        
        {rankedTasks.length > 0 && (
          <div className="mt-6 overflow-y-auto max-h-[400px]">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-800/50">
                <tr>
                  <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Rank
                  </th>
                  <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Task
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {rankedTasks.map((task) => (
                  <tr key={task.id} className="hover:bg-gray-50 dark:hover:bg-gray-750">
                    <td className="px-3 py-3 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100">
                      {task.rank}
                    </td>
                    <td className="px-3 py-3 text-sm text-gray-900 dark:text-gray-100">
                      <span className={task.completed ? 'line-through text-gray-500 dark:text-gray-500' : ''}>
                        {task.content}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  // Show empty state when no tasks or comparisons
  if (tasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <div className="w-16 h-16 mb-4 text-gray-300 dark:text-gray-600">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
        </div>
        <h3 className="text-lg font-medium text-gray-700 dark:text-gray-300 mb-1">No Tasks Yet</h3>
        <p className="text-gray-500 dark:text-gray-400 max-w-sm">
          Add tasks in the editor to start ranking them.
        </p>
      </div>
    );
  }

  // Show rankings (now handles both with and without comparisons)
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-medium text-gray-800 dark:text-gray-200">Rankings</h3>
        
        {comparisons.length === 0 ? (
          <div className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-2 py-1 rounded">
            No comparisons yet - make comparisons to improve rankings
          </div>
        ) : (
          <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
            <div className="flex items-center">
              <span className="inline-block w-3 h-3 rounded-full bg-emerald-400 dark:bg-emerald-500 mr-1"></span>
              <span>High</span>
            </div>
            <div className="flex items-center">
              <span className="inline-block w-3 h-3 rounded-full bg-amber-400 dark:bg-amber-500 mr-1"></span>
              <span>Medium</span>
            </div>
            <div className="flex items-center">
              <span className="inline-block w-3 h-3 rounded-full bg-red-400 dark:bg-red-500 mr-1"></span>
              <span>Low</span>
            </div>
          </div>
        )}
      </div>
      
      <div className="overflow-y-auto max-h-[400px] -mr-4 pr-4">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-800/50 sticky top-0 z-10">
            <tr>
              <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-16">
                Rank
              </th>
              <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Task
              </th>
              <th scope="col" className="px-3 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-24">
                Score
              </th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-transparent divide-y divide-gray-200 dark:divide-gray-700">
            {rankedTasks.map((task) => {
              // Determine score color based on relative position
              const scoreColorClass = 
                task.rank <= Math.ceil(rankedTasks.length / 3)
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400'
                  : task.rank <= Math.ceil(rankedTasks.length * 2 / 3)
                    ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400'
                    : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
              
              return (
                <tr key={task.id} className="hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors">
                  <td className="px-3 py-3 whitespace-nowrap">
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 font-medium text-sm">
                      {task.rank}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-sm text-gray-900 dark:text-gray-100">
                    <span className={task.completed ? 'line-through text-gray-500 dark:text-gray-500' : ''}>
                      {task.content}
                    </span>
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap text-right">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${scoreColorClass}`}>
                      {task.score.toFixed(2)}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default TaskRankings; 