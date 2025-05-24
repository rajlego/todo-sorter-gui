import React, { useState, useEffect } from 'react';
import type { Task, Comparison } from '../utils/markdownUtils';
import { 
  selectOptimalPair, 
  calculateComparisonStats, 
  calculateTaskRatings,
  estimateComparisonsNeeded,
  type ComparisonStats 
} from '../utils/asapUtils';

interface ComparisonViewProps {
  tasks: Task[];
  comparisons?: Comparison[];
  onComparisonComplete: (taskA: Task, taskB: Task, winner: Task) => void;
}

const ComparisonView: React.FC<ComparisonViewProps> = ({ tasks, comparisons = [], onComparisonComplete }) => {
  const [currentPair, setCurrentPair] = useState<[Task, Task] | null>(null);
  const [stats, setStats] = useState<ComparisonStats | null>(null);

  // Calculate comparison count from the actual comparisons array
  const comparisonsCount = comparisons.length;

  // Generate optimal pair using ASAP algorithm
  const generateOptimalPair = (taskList: Task[]): [Task, Task] | null => {
    if (taskList.length < 2) return null;
    
    // Use ASAP algorithm to select the most informative pair
    const optimalPair = selectOptimalPair(taskList, comparisons);
    if (optimalPair) {
      return optimalPair;
    }
    
    // Fallback: random pair if ASAP fails
    const randomIndex1 = Math.floor(Math.random() * taskList.length);
    let randomIndex2 = Math.floor(Math.random() * taskList.length);
    while (randomIndex2 === randomIndex1) {
      randomIndex2 = Math.floor(Math.random() * taskList.length);
    }
    return [taskList[randomIndex1], taskList[randomIndex2]];
  };

  // Calculate advanced statistics
  useEffect(() => {
    if (tasks.length >= 2) {
      const comparisonStats = calculateComparisonStats(tasks, comparisons);
      setStats(comparisonStats);
    } else {
      setStats(null);
    }
  }, [tasks, comparisons]);

  // Generate new pair when tasks change or after comparison
  useEffect(() => {
    if (tasks.length >= 2) {
      const newPair = generateOptimalPair(tasks);
      setCurrentPair(newPair);
    } else {
      setCurrentPair(null);
    }
  }, [tasks.length, comparisons.length]);

  // Handle keyboard input
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (currentPair && (event.key === '1' || event.key === '2')) {
        event.preventDefault();
        const winner = event.key === '1' ? currentPair[0] : currentPair[1];
        onComparisonComplete(currentPair[0], currentPair[1], winner);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentPair, onComparisonComplete]);

  const handleComparisonChoice = (winner: Task) => {
    if (currentPair) {
      onComparisonComplete(currentPair[0], currentPair[1], winner);
    }
  };

  // Helper function to get convergence status
  const getConvergenceStatus = () => {
    if (!stats) return { label: 'Initializing', color: 'text-gray-500' };
    
    if (stats.convergence >= 0.9) return { label: 'Excellent', color: 'text-emerald-600' };
    if (stats.convergence >= 0.7) return { label: 'Good', color: 'text-green-600' };
    if (stats.convergence >= 0.5) return { label: 'Fair', color: 'text-amber-600' };
    if (stats.convergence >= 0.3) return { label: 'Poor', color: 'text-orange-600' };
    return { label: 'Very Poor', color: 'text-red-600' };
  };

  // Helper function to get information gain status
  const getInformationGainStatus = () => {
    if (!stats) return { label: 'Calculating', color: 'text-gray-500' };
    
    if (stats.informationGain >= 0.8) return { label: 'Very High', color: 'text-emerald-600' };
    if (stats.informationGain >= 0.6) return { label: 'High', color: 'text-green-600' };
    if (stats.informationGain >= 0.4) return { label: 'Medium', color: 'text-amber-600' };
    if (stats.informationGain >= 0.2) return { label: 'Low', color: 'text-orange-600' };
    return { label: 'Very Low', color: 'text-red-600' };
  };

  const convergenceStatus = getConvergenceStatus();
  const infoGainStatus = getInformationGainStatus();
  const comparisonsNeeded = stats ? estimateComparisonsNeeded(stats, 0.8) : 0;

  return (
    <div className="h-full flex flex-col">
      {/* Advanced Statistics Header */}
      <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
        <h3 className="text-lg font-medium text-gray-800 dark:text-gray-200 mb-3">
          ASAP-Powered Comparison Engine
        </h3>
        
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            {/* Coverage */}
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                {Math.round(stats.coverage * 100)}%
              </div>
              <div className="text-gray-600 dark:text-gray-400">Coverage</div>
              <div className="text-xs text-gray-500">
                {stats.uniquePairs}/{stats.possiblePairs} pairs
              </div>
            </div>
            
            {/* Convergence */}
            <div className="text-center">
              <div className={`text-2xl font-bold ${convergenceStatus.color}`}>
                {Math.round(stats.convergence * 100)}%
              </div>
              <div className="text-gray-600 dark:text-gray-400">Convergence</div>
              <div className={`text-xs ${convergenceStatus.color}`}>
                {convergenceStatus.label}
              </div>
            </div>
            
            {/* Information Gain */}
            <div className="text-center">
              <div className={`text-2xl font-bold ${infoGainStatus.color}`}>
                {stats.informationGain.toFixed(2)}
              </div>
              <div className="text-gray-600 dark:text-gray-400">Info Gain</div>
              <div className={`text-xs ${infoGainStatus.color}`}>
                {infoGainStatus.label}
              </div>
            </div>
            
            {/* Remaining */}
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                {comparisonsNeeded}
              </div>
              <div className="text-gray-600 dark:text-gray-400">Remaining</div>
              <div className="text-xs text-gray-500">
                for 80% convergence
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Comparison Interface */}
      <div className="flex-1 flex flex-col items-center justify-center">
        <div className="w-full max-w-2xl">
          <div className="text-center mb-6">
            <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-2">
              Which task is more important?
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {comparisonsCount === 0 
                ? "Start comparing tasks to build priority rankings" 
                : `Comparison ${comparisonsCount + 1} • Using ASAP algorithm for optimal pair selection`
              }
            </p>
          </div>

          {currentPair ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Task A */}
              <button
                className="group p-6 bg-white dark:bg-gray-800 rounded-lg border-2 border-gray-200 dark:border-gray-700 hover:border-blue-500 dark:hover:border-blue-400 hover:shadow-md transition-all duration-200 text-left relative"
                onClick={() => handleComparisonChoice(currentPair[0])}
              >
                <div className="absolute top-4 right-4 text-2xl font-bold text-blue-600 dark:text-blue-400 opacity-70 group-hover:opacity-100">
                  1
                </div>
                <div className="pr-12">
                  <div className="text-lg font-medium text-gray-800 dark:text-gray-200 mb-2">
                    {currentPair[0].content}
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    Press "1" or click to select
                  </div>
                </div>
              </button>

              {/* Task B */}
              <button
                className="group p-6 bg-white dark:bg-gray-800 rounded-lg border-2 border-gray-200 dark:border-gray-700 hover:border-green-500 dark:hover:border-green-400 hover:shadow-md transition-all duration-200 text-left relative"
                onClick={() => handleComparisonChoice(currentPair[1])}
              >
                <div className="absolute top-4 right-4 text-2xl font-bold text-green-600 dark:text-green-400 opacity-70 group-hover:opacity-100">
                  2
                </div>
                <div className="pr-12">
                  <div className="text-lg font-medium text-gray-800 dark:text-gray-200 mb-2">
                    {currentPair[1].content}
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    Press "2" or click to select
                  </div>
                </div>
              </button>
            </div>
          ) : tasks.length < 2 ? (
            <div className="text-center py-12">
              <div className="text-gray-500 dark:text-gray-400 mb-4">
                <svg className="w-16 h-16 mx-auto opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h3 className="text-lg font-medium text-gray-600 dark:text-gray-300 mb-2">
                Add at least 2 tasks to start comparing
              </h3>
              <p className="text-gray-500 dark:text-gray-400">
                Write your tasks in the markdown editor on the left
              </p>
            </div>
          ) : (
            <div className="text-center py-12">
              <div className="text-gray-500 dark:text-gray-400">
                Generating optimal pair...
              </div>
            </div>
          )}

          {/* Keyboard shortcuts help */}
          {currentPair && (
            <div className="mt-6 text-center text-sm text-gray-500 dark:text-gray-400">
              💡 Tip: Use keyboard shortcuts <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded">1</kbd> or <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded">2</kbd> for faster comparisons
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ComparisonView; 