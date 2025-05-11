import React, { useEffect, useState } from 'react';
import type { Task, Comparison } from '../utils/markdownUtils';
import { rankingsApi } from '../utils/apiClient';
import type { RankedTask } from '../utils/apiClient';

interface TaskRankingsProps {
  tasks: Task[];
  comparisons: Comparison[];
}

const TaskRankings: React.FC<TaskRankingsProps> = ({ tasks, comparisons }) => {
  const [rankedTasks, setRankedTasks] = useState<RankedTask[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch rankings from the API when tasks or comparisons change
  useEffect(() => {
    const fetchRankings = async () => {
      // Only fetch if we have tasks and comparisons
      if (tasks.length === 0 || comparisons.length === 0) {
        setRankedTasks([]);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const rankings = await rankingsApi.getRankings();
        setRankedTasks(rankings);
      } catch (err) {
        console.error('Failed to fetch rankings:', err);
        setError('Failed to fetch rankings. Using local sorting as fallback.');
        
        // Fallback to our local calculation if the API call fails
        const localRankedTasks = tasks.map((task, index) => ({
          ...task,
          score: 0,
          rank: index + 1
        }));
        setRankedTasks(localRankedTasks);
      } finally {
        setLoading(false);
      }
    };

    fetchRankings();
  }, [tasks, comparisons]);

  // Show loading state
  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6 text-center">
        <h2 className="text-xl font-bold mb-4">Task Rankings</h2>
        <div className="flex justify-center">
          <svg className="animate-spin h-8 w-8 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
        </div>
      </div>
    );
  }

  // Show error state with fallback ranking
  if (error) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-bold mb-4">Task Rankings</h2>
        <div className="text-red-500 text-sm mb-4">{error}</div>
        
        {rankedTasks.length > 0 && (
          <div className="overflow-y-auto max-h-[500px]">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Rank
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Task
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {rankedTasks.map((task) => (
                  <tr key={task.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 whitespace-nowrap text-sm font-medium text-gray-900">
                      {task.rank}
                    </td>
                    <td className="px-3 py-2 text-sm text-gray-900">
                      <span className={task.completed ? 'line-through text-gray-500' : ''}>
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
      <div className="bg-white rounded-lg shadow p-6 text-center">
        <h2 className="text-xl font-bold mb-4">Task Rankings</h2>
        <p className="text-gray-500">No tasks found. Add tasks in the editor.</p>
      </div>
    );
  }

  if (comparisons.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-6 text-center">
        <h2 className="text-xl font-bold mb-4">Task Rankings</h2>
        <p className="text-gray-500">No comparisons yet. Compare tasks to see rankings.</p>
      </div>
    );
  }

  // Show rankings
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-xl font-bold mb-4">Task Rankings</h2>
      
      <div className="overflow-y-auto max-h-[500px]">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Rank
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Task
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Score
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {rankedTasks.map((task) => (
              <tr key={task.id} className="hover:bg-gray-50">
                <td className="px-3 py-2 whitespace-nowrap text-sm font-medium text-gray-900">
                  {task.rank}
                </td>
                <td className="px-3 py-2 text-sm text-gray-900">
                  <span className={task.completed ? 'line-through text-gray-500' : ''}>
                    {task.content}
                  </span>
                </td>
                <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-500">
                  {task.score.toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default TaskRankings; 