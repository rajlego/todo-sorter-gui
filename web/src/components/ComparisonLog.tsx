import { useState } from 'react';
import type { Comparison } from '../utils/markdownUtils';

interface ComparisonLogProps {
  comparisons: Comparison[];
  onExport: () => void;
}

const ComparisonLog: React.FC<ComparisonLogProps> = ({ comparisons, onExport }) => {
  return (
    <div className="bg-white rounded-lg shadow p-4">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold">Comparison History</h2>
        <button
          onClick={onExport}
          className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition"
          disabled={comparisons.length === 0}
        >
          Export CSV
        </button>
      </div>

      {comparisons.length === 0 ? (
        <p className="text-gray-500 text-center py-4">No comparisons yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Date
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Task A
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Task B
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Winner
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {comparisons.map((comparison) => (
                <tr key={comparison.id}>
                  <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-500">
                    {comparison.timestamp.toLocaleString()}
                  </td>
                  <td className={`px-4 py-2 whitespace-nowrap text-sm ${comparison.winner.id === comparison.taskA.id ? 'font-bold' : ''}`}>
                    {comparison.taskA.content}
                  </td>
                  <td className={`px-4 py-2 whitespace-nowrap text-sm ${comparison.winner.id === comparison.taskB.id ? 'font-bold' : ''}`}>
                    {comparison.taskB.content}
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap text-sm">
                    {comparison.winner.content}
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