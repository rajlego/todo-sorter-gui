import { useState } from 'react';
import type { Comparison } from '../utils/markdownUtils';

interface ComparisonLogProps {
  comparisons: Comparison[];
  onExport: () => void;
}

const ComparisonLog: React.FC<ComparisonLogProps> = ({ comparisons, onExport }) => {
  const [selectedComparison, setSelectedComparison] = useState<Comparison | null>(null);

  return (
    <div className="rounded-lg">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100">
          Comparison History
          <span className="ml-2 text-sm font-normal text-gray-500 dark:text-gray-400">
            ({comparisons.length} total)
          </span>
        </h2>
        <button
          onClick={onExport}
          className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-700 dark:hover:bg-indigo-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:focus:ring-offset-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          disabled={comparisons.length === 0}
        >
          <svg className="mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Export CSV
        </button>
      </div>

      {comparisons.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="w-16 h-16 mb-4 text-gray-300 dark:text-gray-600">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <h3 className="mb-1 text-lg font-medium text-gray-700 dark:text-gray-300">No comparisons yet</h3>
          <p className="text-gray-500 dark:text-gray-400 max-w-sm">
            Compare tasks to see your comparison history. This helps track how you prioritized tasks over time.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto -mx-4 sm:-mx-0">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-800/50">
              <tr>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Date
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Task A
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Task B
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Winner
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {comparisons.map((comparison) => (
                <tr 
                  key={comparison.id} 
                  onClick={() => setSelectedComparison(comparison)}
                  className={`hover:bg-gray-50 dark:hover:bg-gray-750 cursor-pointer transition-colors ${
                    selectedComparison?.id === comparison.id ? 'bg-indigo-50 dark:bg-indigo-900/20' : ''
                  }`}
                >
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    {comparison.timestamp.toLocaleString(undefined, { 
                      month: 'short', 
                      day: 'numeric', 
                      hour: '2-digit', 
                      minute: '2-digit'
                    })}
                  </td>
                  <td className={`px-4 py-3 text-sm ${
                    comparison.winner.id === comparison.taskA.id 
                      ? 'font-medium text-indigo-600 dark:text-indigo-400' 
                      : 'text-gray-700 dark:text-gray-300'
                  }`}>
                    {comparison.taskA.content}
                  </td>
                  <td className={`px-4 py-3 text-sm ${
                    comparison.winner.id === comparison.taskB.id 
                      ? 'font-medium text-indigo-600 dark:text-indigo-400' 
                      : 'text-gray-700 dark:text-gray-300'
                  }`}>
                    {comparison.taskB.content}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                      {comparison.winner.content}
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
};

export default ComparisonLog; 