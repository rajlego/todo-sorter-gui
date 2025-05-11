import React, { useState, useEffect } from 'react';
import type { Task } from '../utils/markdownUtils';

interface ComparisonViewProps {
  tasks: Task[];
  onComparisonComplete: (taskA: Task, taskB: Task, winner: Task) => void;
}

const ComparisonView: React.FC<ComparisonViewProps> = ({ tasks, onComparisonComplete }) => {
  const [currentPair, setCurrentPair] = useState<[Task, Task] | null>(null);
  const [remainingPairs, setRemainingPairs] = useState<[Task, Task][]>([]);
  const [comparisonsCount, setComparisonsCount] = useState(0);

  // Generate all possible pairs of tasks
  useEffect(() => {
    if (tasks.length < 2) return;
    
    const pairs: [Task, Task][] = [];
    for (let i = 0; i < tasks.length; i++) {
      for (let j = i + 1; j < tasks.length; j++) {
        pairs.push([tasks[i], tasks[j]]);
      }
    }
    
    // Shuffle the pairs
    const shuffledPairs = [...pairs].sort(() => Math.random() - 0.5);
    setRemainingPairs(shuffledPairs);
    
    // Set the first pair
    if (shuffledPairs.length > 0) {
      setCurrentPair(shuffledPairs[0]);
    }
  }, [tasks]);

  // Select the next pair after a comparison
  const getNextPair = () => {
    if (remainingPairs.length <= 1) {
      setCurrentPair(null);
      return;
    }
    
    const newRemainingPairs = [...remainingPairs];
    newRemainingPairs.shift(); // Remove the current pair
    setRemainingPairs(newRemainingPairs);
    setCurrentPair(newRemainingPairs[0]);
  };

  // Handle task selection
  const handleTaskSelect = (winner: Task) => {
    if (!currentPair) return;
    
    const [taskA, taskB] = currentPair;
    onComparisonComplete(taskA, taskB, winner);
    setComparisonsCount(prev => prev + 1);
    getNextPair();
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
        <div className="w-16 h-16 mb-4 text-emerald-500 dark:text-emerald-400">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h2 className="text-xl font-bold mb-2 text-gray-700 dark:text-gray-300">Comparison Complete!</h2>
        <p className="text-gray-600 dark:text-gray-400">
          You've completed {comparisonsCount} comparisons.
        </p>
        {comparisonsCount > 0 && (
          <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
            Check the Task Rankings section to see the results.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="w-full">
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
        <span className="inline-flex items-center justify-center px-2.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200">
          {remainingPairs.length} comparisons remaining
        </span>
      </div>
    </div>
  );
};

export default ComparisonView; 