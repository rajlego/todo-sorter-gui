import axios from 'axios';
import type { Task, Comparison } from './markdownUtils';

// Define API base URL based on environment
// For monolithic deployment, API is at /api path with no full URL needed
const API_BASE_URL = 
  // In dev mode (localhost) use the local API with specific port
  window.location.hostname === 'localhost' 
    ? 'http://localhost:3000/api' 
    // In production, API is at /api path on the same origin
    : '/api';

console.log('Using API URL:', API_BASE_URL);

// API client instance
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// API logging utility
const logApiOperation = (operation: string, data?: any, error?: any) => {
  const timestamp = new Date().toISOString();
  if (error) {
    console.error(`[${timestamp}] API ${operation} failed:`, error);
    if (error.response) {
      console.error(`[${timestamp}] Response:`, {
        status: error.response.status,
        data: error.response.data
      });
    }
  } else {
    console.log(`[${timestamp}] API ${operation} successful`, data || '');
  }
};

// Interface for ranked tasks from the backend
export interface RankedTask extends Task {
  score: number;
  rank: number;
}

// Interface for task response from updated API
interface TaskResponse {
  content: string;
  completed: boolean;
}

// API endpoints for comparisons
export const comparisonsApi = {
  // Get all comparisons
  getAllComparisons: async (): Promise<Comparison[]> => {
    try {
      const response = await apiClient.get('/comparisons/content');
      
      const comparisons = response.data.comparisons.map((comp: any) => ({
        id: generateId(),
        taskA: { id: generateId(), content: comp.task_a_content, completed: false, line: 0 },
        taskB: { id: generateId(), content: comp.task_b_content, completed: false, line: 0 },
        winner: { id: generateId(), content: comp.winner_content, completed: false, line: 0 },
        timestamp: new Date(comp.timestamp)
      }));
      logApiOperation('getAllComparisons', { count: comparisons.length });
      return comparisons;
    } catch (error) {
      logApiOperation('getAllComparisons', undefined, error);
      throw error;
    }
  },

  // Add a new comparison using task content
  addComparison: async (comparison: Omit<Comparison, 'id' | 'timestamp'>): Promise<Comparison> => {
    try {
      const payload = {
        task_a_content: comparison.taskA.content,
        task_b_content: comparison.taskB.content,
        winner_content: comparison.winner.content
      };
      
      logApiOperation('addComparison - request', payload);

      // Validate that we have content for all tasks
      if (!comparison.taskA.content || !comparison.taskB.content || !comparison.winner.content) {
        throw new Error('Task content cannot be empty');
      }
      
      // Make sure winner is one of the tasks being compared
      if (comparison.winner.content !== comparison.taskA.content && 
          comparison.winner.content !== comparison.taskB.content) {
        throw new Error(`Winner content must match either task A or task B`);
      }

      // Send the comparison to the API
      try {
        const response = await apiClient.post('/comparisons', payload);
        logApiOperation('addComparison - response', response.data);
      } catch (err: any) {
        logApiOperation('addComparison', payload, err);
        throw err;
      }

      return {
        id: generateId(),
        taskA: comparison.taskA,
        taskB: comparison.taskB,
        winner: comparison.winner,
        timestamp: new Date()
      };
    } catch (error) {
      logApiOperation('addComparison - error', undefined, error);
      throw error;
    }
  },
};

// API endpoint for rankings
export const rankingsApi = {
  // Get task rankings
  getRankings: async (): Promise<RankedTask[]> => {
    logApiOperation('getRankings - starting');
    try {
      const response = await apiClient.get('/rankings');
      logApiOperation('getRankings - received', response.data);
      
      if (!response.data.rankings || !Array.isArray(response.data.rankings)) {
        logApiOperation('getRankings - invalid format', response.data);
        return [];
      }
      
      // Process content-based rankings
      const rankings = response.data.rankings.map((task: any, index: number) => {
        return {
          id: `task-${index + 1}`, // Generate a synthetic ID for frontend use
          content: task.content || '',
          completed: false, // We don't track this in the API anymore
          line: 0, // We don't track this in the API anymore
          score: typeof task.score === 'number' ? task.score : 0,
          rank: typeof task.rank === 'number' ? task.rank : 0
        };
      });
      
      logApiOperation('getRankings - processed', { count: rankings.length });
      return rankings;
    } catch (error) {
      logApiOperation('getRankings', undefined, error);
      throw error;
    }
  },
};

// Health check response type
interface HealthCheckResponse {
  status: string;
  db_connected: boolean;
  memory_mode: boolean;
}

// Health check endpoint
export const healthCheck = async (): Promise<boolean> => {
  try {
    const response = await apiClient.get('/health');
    logApiOperation('healthCheck - received', response.data);
    
    // Check if it's the new response format with db_connected
    if (response.data && typeof response.data === 'object') {
      const healthData = response.data as HealthCheckResponse;
      
      // If we get a specific memory_mode flag, check if we're using a real database connection
      if ('db_connected' in healthData) {
        return healthData.db_connected === true && healthData.memory_mode === false;
      }
    }
    
    // Fallback for old response format
    return response.status === 200;
  } catch (error) {
    console.error('API health check failed:', error);
    logApiOperation('healthCheck - failed', undefined, error);
    return false;
  }
};

// Helper function to generate a unique ID
const generateId = (): string => {
  return Math.random().toString(36).substring(2, 15) + 
    Math.random().toString(36).substring(2, 15);
};

// Tasks API for managing tasks directly
export const tasksApi = {
  // Get all tasks
  getAllTasks: async (): Promise<string[]> => {
    logApiOperation('getAllTasks - starting');
    try {
      const response = await apiClient.get('/tasks');
      logApiOperation('getAllTasks - received', response.data);
      
      // The updated API now returns an array of task objects with content and completed properties
      if (Array.isArray(response.data)) {
        const tasks = response.data.map((task: TaskResponse) => task.content);
        return tasks;
      }
      
      // Fallback for backward compatibility
      return response.data.tasks || [];
    } catch (error) {
      logApiOperation('getAllTasks', undefined, error);
      throw error;
    }
  },
  
  // Delete a task by content
  deleteTask: async (content: string): Promise<boolean> => {
    logApiOperation('deleteTask - starting', { content });
    try {
      const response = await apiClient.delete('/tasks', { 
        data: { content } 
      });
      logApiOperation('deleteTask - received', response.data);
      return true;
    } catch (error) {
      logApiOperation('deleteTask', { content }, error);
      throw error;
    }
  },
  
  // Register a new task
  registerTask: async (content: string): Promise<boolean> => {
    logApiOperation('registerTask - starting', { content });
    try {
      // To register a task, we create a dummy comparison where taskA and taskB are both the new task
      // and the winner is also the new task
      const payload = {
        task_a_content: content,
        task_b_content: content,
        winner_content: content
      };
      
      const response = await apiClient.post('/comparisons', payload);
      logApiOperation('registerTask - received', response.data);
      return true;
    } catch (error) {
      logApiOperation('registerTask', { content }, error);
      throw error;
    }
  }
}; 