import React from 'react';
import { extractTasks } from '../utils/markdownUtils';
import type { Task } from '../utils/markdownUtils';

interface TaskSidebarProps {
  markdown: string;
}

const TaskSidebar: React.FC<TaskSidebarProps> = ({ markdown }) => {
  // Use the shared extractTasks function
  const tasks = extractTasks(markdown);
  
  return (
    <div>
      {tasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
          <div className="w-12 h-12 mb-4 text-gray-300 dark:text-gray-600">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          <p className="text-gray-500 dark:text-gray-400">
            No tasks found. Add tasks using the <code className="text-xs bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded">- [ ] Task description</code> format.
          </p>
        </div>
      ) : (
        <ul className="space-y-2 py-1">
          {tasks.map((task) => (
            <li 
              key={task.id}
              className={`group p-2 rounded-lg transition-all duration-200 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 ${
                task.completed ? 'text-gray-400 dark:text-gray-500' : 'text-gray-700 dark:text-gray-300'
              }`}
            >
              <div className="flex items-start">
                <span className={`mt-0.5 w-5 h-5 border flex-shrink-0 flex items-center justify-center rounded transition-colors ${
                  task.completed 
                    ? 'bg-indigo-100 dark:bg-indigo-900/40 border-indigo-300 dark:border-indigo-700' 
                    : 'border-gray-300 dark:border-gray-600 group-hover:border-indigo-400 dark:group-hover:border-indigo-500'
                }`}>
                  {task.completed && (
                    <svg className="w-3 h-3 text-indigo-600 dark:text-indigo-400" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                </span>
                <span className={`ml-3 ${task.completed ? 'line-through' : ''}`}>
                  {task.content}
                  {task.rank && (
                    <span className="ml-2 text-xs inline-flex items-center px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400">
                      Rank: {task.rank} ({task.score?.toFixed(2)})
                    </span>
                  )}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default TaskSidebar; 