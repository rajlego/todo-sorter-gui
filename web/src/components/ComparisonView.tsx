import React, { useState, useEffect } from 'react';

interface Task {
  id: string;
  content: string;
  completed: boolean;
}

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
      <div className="bg-white rounded-lg shadow p-6 text-center">
        <h2 className="text-xl font-bold mb-4">Task Comparison</h2>
        <p className="text-gray-500">Add at least 2 tasks to begin comparing.</p>
      </div>
    );
  }

  if (!currentPair) {
    return (
      <div className="bg-white rounded-lg shadow p-6 text-center">
        <h2 className="text-xl font-bold mb-4">Task Comparison Complete!</h2>
        <p className="text-gray-700">You've completed {comparisonsCount} comparisons.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-xl font-bold mb-4 text-center">Which task is more important?</h2>
      <p className="text-sm text-gray-500 mb-6 text-center">
        Press 1 for the first task, 2 for the second, or click on a task.
      </p>
      
      <div className="flex gap-4 flex-col sm:flex-row">
        <div 
          className="flex-1 p-4 border-2 border-blue-200 rounded-lg hover:bg-blue-50 cursor-pointer transition"
          onClick={() => handleTaskSelect(currentPair[0])}
        >
          <div className="font-medium text-lg mb-1">Task 1</div>
          <p>{currentPair[0].content}</p>
        </div>
        
        <div 
          className="flex-1 p-4 border-2 border-green-200 rounded-lg hover:bg-green-50 cursor-pointer transition"
          onClick={() => handleTaskSelect(currentPair[1])}
        >
          <div className="font-medium text-lg mb-1">Task 2</div>
          <p>{currentPair[1].content}</p>
        </div>
      </div>
      
      <div className="mt-4 text-sm text-gray-500 text-center">
        {remainingPairs.length} comparisons remaining
      </div>
    </div>
  );
};

export default ComparisonView; 