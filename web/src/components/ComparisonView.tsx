import React, { useState, useEffect } from 'react';
import type { Task, Comparison } from '../utils/markdownUtils';
import type { ASAPStats } from '../utils/apiClient';

interface ComparisonViewProps {
  tasks: Task[];
  comparisons?: Comparison[];
  onComparisonComplete: (taskA: Task, taskB: Task, winner: Task) => void;
  asapStats?: ASAPStats | null; // Real ASAP statistics from backend
}

const ComparisonView: React.FC<ComparisonViewProps> = ({ tasks, comparisons = [], onComparisonComplete, asapStats }) => {
  const [currentPair, setCurrentPair] = useState<[Task, Task] | null>(null);

  // Calculate comparison count from the actual comparisons array
  const comparisonsCount = comparisons.length;

  // Generate a smart pair based on ASAP stats or fall back to random
  const generateOptimalPair = (taskList: Task[]): [Task, Task] | null => {
    if (taskList.length < 2) return null;
    
    // If we have ASAP stats with an optimal next pair recommendation, try to use it
    if (asapStats?.optimal_next_pair) {
      const [contentA, contentB] = asapStats.optimal_next_pair;
      const taskA = taskList.find(t => t.content === contentA);
      const taskB = taskList.find(t => t.content === contentB);
      
      if (taskA && taskB) {
        return [taskA, taskB];
      }
    }
    
    // Fallback: random pair selection
    const randomIndex1 = Math.floor(Math.random() * taskList.length);
    let randomIndex2 = Math.floor(Math.random() * taskList.length);
    while (randomIndex2 === randomIndex1) {
      randomIndex2 = Math.floor(Math.random() * taskList.length);
    }
    return [taskList[randomIndex1], taskList[randomIndex2]];
  };

  // Generate new pair when tasks change or after comparison
  useEffect(() => {
    if (tasks.length >= 2) {
      const newPair = generateOptimalPair(tasks);
      setCurrentPair(newPair);
    } else {
      setCurrentPair(null);
    }
  }, [tasks.length, comparisons.length, asapStats?.optimal_next_pair]);

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

  // Helper function to get convergence status using real ASAP values
  const getConvergenceStatus = () => {
    if (!asapStats) return { label: 'Calculating...', color: 'text-gray-500' };
    
    const convergence = asapStats.convergence;
    if (convergence >= 0.9) return { label: 'Excellent', color: 'text-emerald-600' };
    if (convergence >= 0.7) return { label: 'Good', color: 'text-green-600' };
    if (convergence >= 0.5) return { label: 'Fair', color: 'text-amber-600' };
    if (convergence >= 0.3) return { label: 'Poor', color: 'text-orange-600' };
    return { label: 'Very Poor', color: 'text-red-600' };
  };

  // Helper function to get information gain status using real ASAP values
  const getInformationGainStatus = () => {
    if (!asapStats) return { label: 'Calculating...', color: 'text-gray-500' };
    
    const gain = asapStats.max_information_gain;
    if (gain >= 0.8) return { label: 'Very High', color: 'text-emerald-600' };
    if (gain >= 0.6) return { label: 'High', color: 'text-green-600' };
    if (gain >= 0.4) return { label: 'Medium', color: 'text-amber-600' };
    if (gain >= 0.2) return { label: 'Low', color: 'text-orange-600' };
    return { label: 'Very Low', color: 'text-red-600' };
  };

  // Calculate remaining comparisons needed for good convergence
  const estimateComparisonsNeeded = (): number => {
    if (!asapStats) return 0;
    
    // Use real ASAP statistics to estimate
    const targetCoverage = 0.8; // 80% coverage target
    const currentCoverage = asapStats.coverage;
    
    if (currentCoverage >= targetCoverage) return 0;
    
    const neededCoverage = targetCoverage - currentCoverage;
    const neededPairs = Math.ceil(neededCoverage * asapStats.possible_pairs);
    return Math.max(0, neededPairs);
  };

  const convergenceStatus = getConvergenceStatus();
  const infoGainStatus = getInformationGainStatus();
  const comparisonsNeeded = estimateComparisonsNeeded();

  return (
    <div className="h-full flex flex-col">
      {/* Real ASAP Statistics Header */}
      <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
        <h3 className="text-lg font-medium text-gray-800 dark:text-gray-200 mb-3">
          Real ASAP Algorithm (from acertain/todo-sorter)
        </h3>
        
        {asapStats ? (
          <div className="space-y-4">
            {/* Main metrics grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              {/* Coverage */}
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                  {Math.round(asapStats.coverage * 100)}%
                </div>
                <div className="text-gray-600 dark:text-gray-400">Coverage</div>
                <div className="text-xs text-gray-500">
                  {asapStats.unique_pairs}/{asapStats.possible_pairs} pairs
                </div>
              </div>
              
              {/* Convergence */}
              <div className="text-center">
                <div className={`text-2xl font-bold ${convergenceStatus.color}`}>
                  {Math.round(asapStats.convergence * 100)}%
                </div>
                <div className="text-gray-600 dark:text-gray-400">Convergence</div>
                <div className={`text-xs ${convergenceStatus.color}`}>
                  {convergenceStatus.label}
                </div>
              </div>
              
              {/* Information Gain */}
              <div className="text-center">
                <div className={`text-2xl font-bold ${infoGainStatus.color}`}>
                  {asapStats.max_information_gain.toFixed(3)}
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
                  for 80% coverage
                </div>
              </div>
            </div>
            
            {/* ASAP Algorithm Details */}
            <div className="border-t pt-3 mt-3">
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Algorithm Parameters (from acertain implementation):
              </h4>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                <div>
                  <span className="text-gray-500">Mean Variance:</span>
                  <span className="ml-2 font-mono">{asapStats.mean_variance.toFixed(4)}</span>
                </div>
                <div>
                  <span className="text-gray-500">Initial Variance:</span>
                  <span className="ml-2 font-mono">{asapStats.initial_variance}</span>
                </div>
                <div>
                  <span className="text-gray-500">Prior Precision:</span>
                  <span className="ml-2 font-mono">{asapStats.prior_precision}</span>
                </div>
                <div>
                  <span className="text-gray-500">Convergence Threshold:</span>
                  <span className="ml-2 font-mono">{asapStats.convergence_threshold}</span>
                </div>
                <div>
                  <span className="text-gray-500">Total Comparisons:</span>
                  <span className="ml-2 font-mono">{asapStats.total_comparisons}</span>
                </div>
                {asapStats.optimal_next_pair && (
                  <div className="md:col-span-1">
                    <span className="text-gray-500">Next Optimal:</span>
                    <span className="ml-2 text-xs text-blue-600">
                      {asapStats.optimal_next_pair[0].substring(0, 20)}... vs {asapStats.optimal_next_pair[1].substring(0, 20)}...
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center text-gray-500 dark:text-gray-400">
            Loading ASAP statistics...
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
                : `Comparison ${comparisonsCount + 1} • Using real ASAP algorithm for optimal pair selection`
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