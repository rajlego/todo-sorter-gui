import React, { useMemo } from 'react';
import { extractTasks } from '../utils/markdownUtils';
import type { Task } from '../utils/markdownUtils';

interface TaskSidebarProps {
  markdown: string;
}

const TaskSidebar: React.FC<TaskSidebarProps> = ({ markdown }) => {
  // Memoize task extraction to avoid recalculating on every render
  const tasks = useMemo(() => extractTasks(markdown), [markdown]);
  
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
            No tasks found. Add tasks by typing each task on a new line. Use <code className="text-xs bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded"># Comment</code> for comments.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {tasks.map((task, index) => (
            <div 
              key={`task-${index}-${task.content}`} 
              className="flex items-start space-x-3 p-2 bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-gray-100 dark:border-gray-700"
            >
              <div className="flex-shrink-0 mt-0.5">
                {task.completed ? (
                  <div className="w-4 h-4 bg-green-500 rounded border-2 border-green-500 flex items-center justify-center">
                    <svg className="w-2 h-2 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </div>
                ) : (
                  <div className="w-4 h-4 border-2 border-gray-300 dark:border-gray-600 rounded"></div>
                )}
              </div>
              <div className="flex-grow min-w-0">
                <p className={`text-sm break-words ${
                  task.completed 
                    ? 'text-gray-500 dark:text-gray-400 line-through' 
                    : 'text-gray-700 dark:text-gray-300'
                }`}>
                  {task.content}
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                  Line {task.line + 1} • {task.completed ? 'Completed' : 'Pending'}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default React.memo(TaskSidebar); 