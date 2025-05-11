import type { Task, Comparison } from './markdownUtils';

/**
 * Calculate the score for each task based on comparison results.
 * A higher score means the task was chosen more often as the winner.
 * 
 * @param tasks List of tasks
 * @param comparisons List of comparisons
 * @returns Tasks with scores, sorted from highest to lowest score
 */
export const calculateTaskRankings = (
  tasks: Task[],
  comparisons: Comparison[]
): (Task & { score: number; rank: number })[] => {
  // Initialize scores for all tasks
  const taskScores = new Map<string, number>();
  tasks.forEach(task => {
    taskScores.set(task.id, 0);
  });

  // Calculate how many times each task won
  comparisons.forEach(comparison => {
    const winnerId = comparison.winner.id;
    const currentScore = taskScores.get(winnerId) || 0;
    taskScores.set(winnerId, currentScore + 1);
  });

  // Create a sorted list of tasks with scores
  const rankedTasks = tasks
    .filter(task => taskScores.has(task.id)) // Only include tasks that have been compared
    .map(task => ({
      ...task,
      score: taskScores.get(task.id) || 0
    }))
    .sort((a, b) => b.score - a.score); // Sort by score (highest first)

  // Add rank property
  return rankedTasks.map((task, index) => ({
    ...task,
    rank: index + 1
  }));
};

/**
 * Calculate rankings using the Elo rating system, which is more
 * sophisticated than simple win counting.
 * 
 * @param tasks List of tasks
 * @param comparisons List of comparisons
 * @param kFactor The K-factor determines how much each comparison affects scores (default: 32)
 * @returns Tasks with Elo ratings, sorted from highest to lowest
 */
export const calculateEloRankings = (
  tasks: Task[],
  comparisons: Comparison[],
  kFactor: number = 32
): (Task & { eloRating: number; rank: number })[] => {
  // Initialize Elo ratings (start at 1000)
  const eloRatings = new Map<string, number>();
  tasks.forEach(task => {
    eloRatings.set(task.id, 1000);
  });

  // Process each comparison to update Elo ratings
  comparisons.forEach(comparison => {
    const taskAId = comparison.taskA.id;
    const taskBId = comparison.taskB.id;
    const winnerId = comparison.winner.id;
    
    // Skip if either task doesn't have a rating (should not happen normally)
    if (!eloRatings.has(taskAId) || !eloRatings.has(taskBId)) return;
    
    const ratingA = eloRatings.get(taskAId)!;
    const ratingB = eloRatings.get(taskBId)!;
    
    // Calculate expected scores (probability of winning)
    const expectedA = 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
    const expectedB = 1 / (1 + Math.pow(10, (ratingA - ratingB) / 400));
    
    // Calculate new ratings
    let newRatingA: number;
    let newRatingB: number;
    
    if (winnerId === taskAId) {
      // Task A won
      newRatingA = ratingA + kFactor * (1 - expectedA);
      newRatingB = ratingB + kFactor * (0 - expectedB);
    } else {
      // Task B won
      newRatingA = ratingA + kFactor * (0 - expectedA);
      newRatingB = ratingB + kFactor * (1 - expectedB);
    }
    
    eloRatings.set(taskAId, newRatingA);
    eloRatings.set(taskBId, newRatingB);
  });

  // Create a sorted list of tasks with Elo ratings
  const rankedTasks = tasks
    .filter(task => eloRatings.has(task.id))
    .map(task => ({
      ...task,
      eloRating: eloRatings.get(task.id) || 1000
    }))
    .sort((a, b) => b.eloRating - a.eloRating); // Sort by Elo rating (highest first)

  // Add rank property
  return rankedTasks.map((task, index) => ({
    ...task,
    rank: index + 1
  }));
}; 