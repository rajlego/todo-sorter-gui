import React from 'react';

interface Task {
  id: string;
  content: string;
  completed: boolean;
}

interface TaskSidebarProps {
  markdown: string;
}

const TaskSidebar: React.FC<TaskSidebarProps> = ({ markdown }) => {
  // Parse tasks from markdown
  const extractTasks = (markdown: string): Task[] => {
    const tasks: Task[] = [];
    const lines = markdown.split('\n');
    
    lines.forEach((line, index) => {
      // Match Markdown task syntax: - [ ] Task description or - [x] Task description
      const taskMatch = line.match(/^-\s\[([ x])\]\s(.+)$/);
      if (taskMatch) {
        tasks.push({
          id: `task-${index}`,
          content: taskMatch[2],
          completed: taskMatch[1] === 'x'
        });
      }
    });
    
    return tasks;
  };
  
  const tasks = extractTasks(markdown);
  
  return (
    <div className="bg-white rounded-lg shadow p-4 h-full overflow-auto">
      <h2 className="text-xl font-bold mb-4">Tasks ({tasks.length})</h2>
      
      {tasks.length === 0 ? (
        <p className="text-gray-500">No tasks found. Add tasks using the "- [ ] Task description" format.</p>
      ) : (
        <ul className="space-y-2">
          {tasks.map((task) => (
            <li 
              key={task.id}
              className={`p-2 rounded hover:bg-gray-100 flex items-start ${
                task.completed ? 'text-gray-500 line-through' : ''
              }`}
            >
              <span className="w-5 h-5 border border-gray-300 rounded-sm mr-2 flex-shrink-0 inline-flex items-center justify-center">
                {task.completed && (
                  <svg className="w-3 h-3 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                )}
              </span>
              <span>{task.content}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default TaskSidebar; 