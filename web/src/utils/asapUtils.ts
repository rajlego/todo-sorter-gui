import type { Task, Comparison } from './markdownUtils';

/**
 * ASAP-inspired utilities for intelligent pairwise comparison and ranking
 * Based on the Active Sampling for Pairwise Preferences algorithm
 */

export interface TaskRating {
  task: Task;
  mean: number;      // Estimated rating (skill level)
  variance: number;  // Uncertainty about the rating
  comparisons: number; // Number of comparisons involving this task
}

export interface ComparisonStats {
  totalComparisons: number;
  uniquePairs: number;
  possiblePairs: number;
  coverage: number; // Percentage of possible pairs that have been compared
  convergence: number; // Measure of how stable/converged the rankings are
  informationGain: number; // Expected information gain from next comparison
}

/**
 * Calculate TrueSkill-inspired ratings for tasks
 */
export const calculateTaskRatings = (tasks: Task[], comparisons: Comparison[]): TaskRating[] => {
  // Initialize ratings with default values (mean=25, variance=8.33^2 ≈ 69)
  const ratings = new Map<string, { mean: number; variance: number; comparisons: number }>();
  
  tasks.forEach(task => {
    ratings.set(task.id, { mean: 25.0, variance: 69.4, comparisons: 0 });
  });

  // Process each comparison to update ratings
  comparisons.forEach(comparison => {
    const winnerRating = ratings.get(comparison.winner.id);
    const loserRating = ratings.get(
      comparison.winner.id === comparison.taskA.id 
        ? comparison.taskB.id 
        : comparison.taskA.id
    );

    if (winnerRating && loserRating) {
      // Simplified TrueSkill update
      const totalVariance = winnerRating.variance + loserRating.variance + 2 * 6.25; // 2 * beta^2
      const delta = winnerRating.mean - loserRating.mean;
      const cdfValue = normalCDF(delta / Math.sqrt(totalVariance));
      const pdfValue = normalPDF(delta / Math.sqrt(totalVariance));
      const v = pdfValue / cdfValue;
      const w = v * (v + delta / Math.sqrt(totalVariance));

      const meanChange = (Math.sqrt(winnerRating.variance) / Math.sqrt(totalVariance)) * v;
      const varianceChange = (winnerRating.variance / totalVariance) * w;

      // Update winner (increase rating)
      winnerRating.mean += meanChange;
      winnerRating.variance *= Math.max(0.1, 1 - varianceChange); // Prevent variance from becoming too small
      winnerRating.comparisons++;

      // Update loser (decrease rating)
      loserRating.mean -= meanChange;
      loserRating.variance *= Math.max(0.1, 1 - varianceChange);
      loserRating.comparisons++;
    }
  });

  // Convert to TaskRating objects
  return tasks.map(task => {
    const rating = ratings.get(task.id) || { mean: 25.0, variance: 69.4, comparisons: 0 };
    return {
      task,
      mean: rating.mean,
      variance: rating.variance,
      comparisons: rating.comparisons
    };
  }).sort((a, b) => b.mean - a.mean); // Sort by mean rating (highest first)
};

/**
 * Calculate information gain for comparing two tasks
 */
export const calculateInformationGain = (
  taskA: TaskRating, 
  taskB: TaskRating
): number => {
  const deltaRating = taskA.mean - taskB.mean;
  const totalVariance = taskA.variance + taskB.variance + 2 * 6.25; // 2 * beta^2
  const standardizedDelta = deltaRating / Math.sqrt(totalVariance);
  
  // Probability that A wins over B
  const probAWins = normalCDF(standardizedDelta);
  const probBWins = 1 - probAWins;
  
  // Calculate KL divergences for both outcomes
  const klA = calculateKLDivergence(taskA, taskB, true);  // A wins
  const klB = calculateKLDivergence(taskA, taskB, false); // B wins
  
  // Expected information gain
  return probAWins * klA + probBWins * klB;
};

/**
 * Calculate KL divergence between prior and posterior distributions
 */
const calculateKLDivergence = (
  taskA: TaskRating, 
  taskB: TaskRating, 
  aWins: boolean
): number => {
  // Simplified KL divergence calculation
  // In practice, this would involve more complex calculations of the posterior distributions
  const uncertainty = Math.sqrt(taskA.variance + taskB.variance);
  const ratingDifference = Math.abs(taskA.mean - taskB.mean);
  
  // Information gain is higher when:
  // 1. Tasks have similar ratings (uncertain outcome)
  // 2. Tasks have high variance (uncertain ratings)
  const similarityFactor = Math.exp(-ratingDifference / 10);
  const uncertaintyFactor = uncertainty / 20;
  
  return similarityFactor * uncertaintyFactor;
};

/**
 * Select the most informative pair of tasks to compare next
 */
export const selectOptimalPair = (
  tasks: Task[], 
  comparisons: Comparison[]
): [Task, Task] | null => {
  if (tasks.length < 2) return null;

  const taskRatings = calculateTaskRatings(tasks, comparisons);
  const ratingMap = new Map(taskRatings.map(tr => [tr.task.id, tr]));

  let bestPair: [Task, Task] | null = null;
  let bestInformationGain = -1;

  // Evaluate all possible pairs
  for (let i = 0; i < tasks.length; i++) {
    for (let j = i + 1; j < tasks.length; j++) {
      const taskA = tasks[i];
      const taskB = tasks[j];
      const ratingA = ratingMap.get(taskA.id);
      const ratingB = ratingMap.get(taskB.id);

      if (ratingA && ratingB) {
        const informationGain = calculateInformationGain(ratingA, ratingB);
        
        if (informationGain > bestInformationGain) {
          bestInformationGain = informationGain;
          bestPair = [taskA, taskB];
        }
      }
    }
  }

  return bestPair;
};

/**
 * Calculate comprehensive statistics about the comparison process
 */
export const calculateComparisonStats = (
  tasks: Task[], 
  comparisons: Comparison[]
): ComparisonStats => {
  const possiblePairs = tasks.length * (tasks.length - 1) / 2;
  
  // Count unique pairs that have been compared
  const comparedPairs = new Set<string>();
  comparisons.forEach(comparison => {
    const contents = [comparison.taskA.content, comparison.taskB.content].sort();
    comparedPairs.add(contents.join('|||'));
  });
  
  const uniquePairs = comparedPairs.size;
  const coverage = possiblePairs > 0 ? uniquePairs / possiblePairs : 0;
  
  // Calculate convergence based on rating variance
  const taskRatings = calculateTaskRatings(tasks, comparisons);
  const averageVariance = taskRatings.reduce((sum, tr) => sum + tr.variance, 0) / tasks.length;
  const convergence = Math.max(0, 1 - (averageVariance / 69.4)); // Normalized by initial variance
  
  // Calculate expected information gain for the next comparison
  const nextPair = selectOptimalPair(tasks, comparisons);
  let informationGain = 0;
  if (nextPair) {
    const ratingMap = new Map(taskRatings.map(tr => [tr.task.id, tr]));
    const ratingA = ratingMap.get(nextPair[0].id);
    const ratingB = ratingMap.get(nextPair[1].id);
    if (ratingA && ratingB) {
      informationGain = calculateInformationGain(ratingA, ratingB);
    }
  }

  return {
    totalComparisons: comparisons.length,
    uniquePairs,
    possiblePairs,
    coverage,
    convergence,
    informationGain
  };
};

/**
 * Estimate how many more comparisons are needed for good convergence
 */
export const estimateComparisonsNeeded = (stats: ComparisonStats, targetConvergence: number = 0.8): number => {
  if (stats.convergence >= targetConvergence) return 0;
  
  // Rough estimation: need about 3-5 comparisons per task for decent convergence
  const baseComparisons = stats.possiblePairs * 0.6; // 60% coverage is usually good
  const needed = Math.max(0, Math.ceil(baseComparisons - stats.totalComparisons));
  
  return needed;
};

// Helper functions for normal distribution
const normalCDF = (x: number): number => {
  return 0.5 * (1 + erf(x / Math.sqrt(2)));
};

const normalPDF = (x: number): number => {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
};

const erf = (x: number): number => {
  // Approximation of the error function
  const a1 =  0.254829592;
  const a2 = -0.284496736;
  const a3 =  1.421413741;
  const a4 = -1.453152027;
  const a5 =  1.061405429;
  const p  =  0.3275911;

  const sign = x >= 0 ? 1 : -1;
  x = Math.abs(x);

  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

  return sign * y;
}; 