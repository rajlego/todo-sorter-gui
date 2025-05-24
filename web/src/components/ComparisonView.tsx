import React, { useState, useEffect } from 'react';
import type { Task, Comparison } from '../utils/markdownUtils';

interface ComparisonViewProps {
  tasks: Task[];
  comparisons?: Comparison[];
  onComparisonComplete: (taskA: Task, taskB: Task, winner: Task) => void;
}

const ComparisonView: React.FC<ComparisonViewProps> = ({ tasks, comparisons = [], onComparisonComplete }) => {
  const [currentPair, setCurrentPair] = useState<[Task, Task] | null>(null);

  // Calculate comparison count from the actual comparisons array
  const comparisonsCount = comparisons.length;

  // Calculate optimization progress
  const calculateOptimizationProgress = () => {
    if (tasks.length < 2) return { current: 0, target: 0, percentage: 0, status: 'No tasks to compare' };
    
    const n = tasks.length;
    const minComparisons = n * (n - 1) / 2; // All pairs once
    const optimalComparisons = Math.min(minComparisons * 3, n * n); // 3x coverage or n² max
    
    const current = comparisonsCount;
    const target = optimalComparisons;
    const percentage = Math.min((current / target) * 100, 100);
    
    let status = '';
    if (percentage < 25) {
      status = 'Getting started - many more needed';
    } else if (percentage < 50) {
      status = 'Building confidence - keep going';
    } else if (percentage < 75) {
      status = 'Good progress - rankings improving';
    } else if (percentage < 100) {
      status = 'Nearly optimal - fine-tuning';
    } else {
      status = 'Highly optimal - refinement mode';
    }
    
    return { current, target, percentage, status, remaining: Math.max(0, target - current) };
  };

  const progress = calculateOptimizationProgress();

  // Generate a random pair from all possible pairs
  const generateRandomPair = (taskList: Task[]): [Task, Task] | null => {
    if (taskList.length < 2) return null;
    
    // Generate all possible pairs
    const allPairs: [Task, Task][] = [];
    for (let i = 0; i < taskList.length; i++) {
      for (let j = i + 1; j < taskList.length; j++) {
        allPairs.push([taskList[i], taskList[j]]);
      }
    }
    
    // Create a weighted selection favoring less-compared pairs
    const comparedPairs = new Set<string>();
    comparisons.forEach(comparison => {
      const contents = [comparison.taskA.content, comparison.taskB.content].sort();
      comparedPairs.add(contents.join('|||'));
    });
    
    // Separate uncompared pairs (higher priority) from compared pairs
    const uncomparedPairs = allPairs.filter(([taskA, taskB]) => {
      const contents = [taskA.content, taskB.content].sort();
      const pairKey = contents.join('|||');
      return !comparedPairs.has(pairKey);
    });
    
    const comparedPairsArray = allPairs.filter(([taskA, taskB]) => {
      const contents = [taskA.content, taskB.content].sort();
      const pairKey = contents.join('|||');
      return comparedPairs.has(pairKey);
    });
    
    // Prefer uncompared pairs, but also include some compared pairs for refinement
    let selectedPairs = [];
    if (uncomparedPairs.length > 0) {
      // 80% chance to pick from uncompared, 20% from compared (for refinement)
      if (Math.random() < 0.8 || comparedPairsArray.length === 0) {
        selectedPairs = uncomparedPairs;
      } else {
        selectedPairs = comparedPairsArray;
      }
    } else {
      // All pairs have been compared at least once, use all pairs
      selectedPairs = allPairs;
    }
    
    // Return a random pair from the selected pool
    const randomIndex = Math.floor(Math.random() * selectedPairs.length);
    return selectedPairs[randomIndex];
  };

  // Generate a new pair whenever tasks or comparisons change
  useEffect(() => {
    if (tasks.length < 2) {
      setCurrentPair(null);
      return;
    }
    
    // Always generate a new pair (continuous mode)
    const newPair = generateRandomPair(tasks);
    setCurrentPair(newPair);
  }, [tasks.length, comparisons.length]); // Regenerate when tasks or comparisons change

  // Handle task selection
  const handleTaskSelect = (winner: Task) => {
    if (!currentPair) return;
    
    const [taskA, taskB] = currentPair;
    onComparisonComplete(taskA, taskB, winner);
    
    // Generate a new pair immediately for continuous comparison
    setTimeout(() => {
      const newPair = generateRandomPair(tasks);
      if (newPair) {
        setCurrentPair(newPair);
      }
    }, 300); // Small delay for smooth UX
  };

  // Handle keyboard shortcuts (1 and 2)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!currentPair) return;
      
      if (e.key === '1') {
        handleTaskSelect(currentPair[0]);
      } else if (e.key === '2') {
        handleTaskSelect(currentPair[1]);
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentPair]);

  if (tasks.length < 2) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center">
        <div className="w-16 h-16 mb-4 text-gray-300 dark:text-gray-600">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <h2 className="text-xl font-bold mb-2 text-gray-700 dark:text-gray-300">Add Tasks to Compare</h2>
        <p className="text-gray-500 dark:text-gray-400 max-w-sm">
          Add at least 2 tasks in the markdown editor to begin prioritizing them.
        </p>
      </div>
    );
  }

  if (!currentPair) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center">
        <div className="w-16 h-16 mb-4 text-gray-300 dark:text-gray-600">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h2 className="text-xl font-bold mb-2 text-gray-700 dark:text-gray-300">Preparing Comparisons...</h2>
        <p className="text-gray-500 dark:text-gray-400 max-w-sm">
          Setting up task pairs for comparison.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full">
      {/* Optimization Progress Indicator */}
      <div className="mb-6 p-4 bg-gradient-to-r from-indigo-50 to-blue-50 dark:from-indigo-900/20 dark:to-blue-900/20 rounded-lg border border-indigo-200 dark:border-indigo-800">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium text-indigo-900 dark:text-indigo-300">Optimization Progress</h3>
          <span className="text-xs text-indigo-600 dark:text-indigo-400">{progress.current} / {progress.target} comparisons</span>
        </div>
        
        <div className="w-full bg-indigo-200 dark:bg-indigo-800 rounded-full h-2 mb-2">
          <div 
            className="bg-gradient-to-r from-indigo-600 to-blue-600 h-2 rounded-full transition-all duration-500 ease-out"
            style={{ width: `${progress.percentage}%` }}
          ></div>
        </div>
        
        <div className="flex items-center justify-between text-xs">
          <span className="text-indigo-700 dark:text-indigo-300">{progress.status}</span>
          {progress.remaining > 0 && (
            <span className="text-indigo-600 dark:text-indigo-400">~{progress.remaining} more for optimal</span>
          )}
        </div>
      </div>

      <div className="text-center mb-6">
        <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-2">Which task is more important?</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Press <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-xs">1</kbd> for the first task, 
          <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-xs ml-1">2</kbd> for the second, or click on a task.
        </p>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <div 
          onClick={() => handleTaskSelect(currentPair[0])}
          className="relative rounded-xl overflow-hidden border border-indigo-100 dark:border-indigo-900 group cursor-pointer"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-indigo-50 to-blue-50 dark:from-indigo-900/40 dark:to-blue-900/40 opacity-50 group-hover:opacity-100 transition-opacity"></div>
          <div className="relative p-6">
            <div className="flex items-center mb-3">
              <span className="flex-shrink-0 w-8 h-8 bg-indigo-100 dark:bg-indigo-900/50 rounded-full flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-medium">1</span>
              <h3 className="ml-3 font-medium text-gray-900 dark:text-gray-100">Task A</h3>
            </div>
            <div className="text-gray-700 dark:text-gray-300 break-words">{currentPair[0].content}</div>
            <div className="absolute bottom-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
              <span className="flex items-center justify-center w-8 h-8 bg-indigo-500 dark:bg-indigo-600 rounded-full text-white">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              </span>
            </div>
          </div>
        </div>
        
        <div 
          onClick={() => handleTaskSelect(currentPair[1])}
          className="relative rounded-xl overflow-hidden border border-emerald-100 dark:border-emerald-900 group cursor-pointer"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-900/40 dark:to-teal-900/40 opacity-50 group-hover:opacity-100 transition-opacity"></div>
          <div className="relative p-6">
            <div className="flex items-center mb-3">
              <span className="flex-shrink-0 w-8 h-8 bg-emerald-100 dark:bg-emerald-900/50 rounded-full flex items-center justify-center text-emerald-600 dark:text-emerald-400 font-medium">2</span>
              <h3 className="ml-3 font-medium text-gray-900 dark:text-gray-100">Task B</h3>
            </div>
            <div className="text-gray-700 dark:text-gray-300 break-words">{currentPair[1].content}</div>
            <div className="absolute bottom-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
              <span className="flex items-center justify-center w-8 h-8 bg-emerald-500 dark:bg-emerald-600 rounded-full text-white">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              </span>
            </div>
          </div>
        </div>
      </div>
      
      <div className="text-center text-sm text-gray-500 dark:text-gray-400">
        <span className="inline-flex items-center justify-center px-3 py-1 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Continuous optimization mode
        </span>
      </div>
    </div>
  );
};

export default ComparisonView; 