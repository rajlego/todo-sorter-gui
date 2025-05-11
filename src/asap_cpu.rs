use libm::{erf, erfc, exp};
use std::f64::consts::PI;
use std::collections::{HashMap, HashSet};

// perf ideas:
// - use selective EIG a la (https://arxiv.org/abs/2004.05691) (~only eval posterior on pairs with closeish ratings)
// - dynamically set threshold based on gradient of KL divergence and maybe best known EIG?
//   - compute gradients of element posteriors by other element posteriors & use that to propagate gradients?
//   - doable with autodiff i think, just backprop on KL div & use gradients of posteriors as thresholds
// - prio queue for updates in message passing by magnitude of update?

// Simple TrueSkill implementation for content-based task comparisons
pub struct ASAP {
    // Maps task content to ratings
    pub task_ratings: HashMap<String, f64>,
    // Tracks comparison history
    comparisons: Vec<(String, String, usize)>, // (taskA, taskB, winner: 0 for A, 1 for B)
    // Baseline variance
    pub variance: f64,
}

impl ASAP {
    pub fn new() -> Self {
        ASAP {
            task_ratings: HashMap::new(),
            comparisons: Vec::new(),
            variance: 1.0,
        }
    }

    // Add a comparison with task content strings
    pub fn add_comparison(&mut self, task_a: &str, task_b: &str, winner: usize) {
        // Initialize ratings if these are new tasks
        if !self.task_ratings.contains_key(task_a) {
            self.task_ratings.insert(task_a.to_string(), 0.0);
        }
        
        if !self.task_ratings.contains_key(task_b) {
            self.task_ratings.insert(task_b.to_string(), 0.0);
        }
        
        // Store the comparison
        self.comparisons.push((task_a.to_string(), task_b.to_string(), winner));
        
        // Update ratings
        self.update_ratings();
    }
    
    // Get all ratings
    pub fn ratings(&self) -> Vec<(String, f64)> {
        self.task_ratings
            .iter()
            .map(|(content, score)| (content.clone(), *score))
            .collect()
    }
    
    // Update ratings using simplified TrueSkill
    fn update_ratings(&mut self) {
        // Reset all ratings to zero
        for rating in self.task_ratings.values_mut() {
            *rating = 0.0;
        }
        
        // Apply each comparison to update ratings
        for (task_a, task_b, winner) in &self.comparisons {
            // Fix double mutable borrow by copying values first, then updating
            let task_a_clone = task_a.clone();
            let task_b_clone = task_b.clone();
            let winner_value = *winner;
            
            // Simple update rule: winner gains 1 point, loser loses 1 point
            if winner_value == 0 {
                if let Some(rating) = self.task_ratings.get_mut(&task_a_clone) {
                    *rating += 1.0;
                }
                if let Some(rating) = self.task_ratings.get_mut(&task_b_clone) {
                    *rating -= 1.0;
                }
            } else {
                if let Some(rating) = self.task_ratings.get_mut(&task_a_clone) {
                    *rating -= 1.0;
                }
                if let Some(rating) = self.task_ratings.get_mut(&task_b_clone) {
                    *rating += 1.0;
                }
            }
        }
        
        // Normalize ratings to have mean 0
        if !self.task_ratings.is_empty() {
            let mean: f64 = self.task_ratings.values().sum::<f64>() / self.task_ratings.len() as f64;
            for rating in self.task_ratings.values_mut() {
                *rating -= mean;
            }
        }
    }
}

struct FastUsizeSet {
    set: Vec<bool>,
    vec: Vec<usize>,
}

impl FastUsizeSet {
    fn new(n: usize) -> Self {
        FastUsizeSet {
            set: vec![false; n],
            vec: Vec::new(),
        }
    }
    fn add(&mut self, i: usize) {
        if self.set[i] {
            return;
        }
        self.set[i] = true;
        self.vec.push(i);
    }
    fn pop(&mut self) -> Option<usize> {
        let i = self.vec.pop();
        if let Some(i) = i {
            self.set[i] = false;
        }
        i
    }
}

struct TrueSkillSolver {
    n: usize,
    ms: Vec<f64>,
    vs: Vec<f64>,
    mgs: Vec<[f64; 2]>,
    pgs: Vec<[f64; 2]>,
    var_to_cmps0: Vec<Vec<usize>>,
    var_to_cmps1: Vec<Vec<usize>>,
    g: Vec<[usize; 2]>,
}

impl TrueSkillSolver {
    pub fn new(n: usize) -> Self {
        TrueSkillSolver {
            n,
            ms: vec![0.0; n],
            vs: vec![0.5; n],
            mgs: Vec::new(),
            pgs: Vec::new(),
            var_to_cmps0: vec![vec![]; n],
            var_to_cmps1: vec![vec![]; n],
            g: Vec::new(),
        }
    }

    fn push_many(&mut self, g: &[[usize; 2]]) {
        for &[a, b] in g {
            self.push_cmp(a, b);
        }
    }

    fn push_cmp(&mut self, i: usize, j: usize) {
        self.pgs.push([0.0; 2]);
        self.mgs.push([0.0; 2]);
        self.g.push([i, j]);
        let id = self.pgs.len() - 1;
        self.var_to_cmps0[i].push(id);
        self.var_to_cmps1[j].push(id);
    }

    fn pop_cmp(&mut self, i: usize, j: usize) {
        self.pgs.pop();
        self.mgs.pop();
        self.g.pop();
        let id = self.pgs.len();
        self.var_to_cmps0[i].retain(|&x| x != id);
        self.var_to_cmps1[j].retain(|&x| x != id);
    }

    // pub fn solve_with_cmp(
    //     &mut self,
    //     g: &[[usize; 2]],
    //     num_iters: usize,
    //     cmp: (usize, usize),
    // ) -> (Vec<f64>, Vec<f64>) {
    // }
    //

    pub fn solve(&mut self, save: bool) -> (Vec<f64>, Vec<f64>) {
        let mut todo_vars = FastUsizeSet::new(self.n);
        let mut todo_cmps = FastUsizeSet::new(self.g.len());

        for p in 0..self.n {
            todo_vars.add(p);
        }
        for j in 0..self.g.len() {
            todo_cmps.add(j);
        }

        self._solve(todo_vars, todo_cmps, save, 0.001)
    }

    pub fn solve_one(&mut self, cmp: (usize, usize)) -> (Vec<f64>, Vec<f64>) {
        self.push_cmp(cmp.0, cmp.1);

        let mut todo_vars = FastUsizeSet::new(self.n);
        let mut todo_cmps = FastUsizeSet::new(self.g.len());

        todo_vars.add(cmp.0);
        todo_vars.add(cmp.1);
        todo_cmps.add(self.g.len() - 1);

        // TODO could run top k candidates again with a lower threshold
        let r = self._solve(todo_vars, todo_cmps, false, 0.1);

        self.pop_cmp(cmp.0, cmp.1);

        r
    }

    pub fn _solve(
        &mut self,
        mut todo_vars: FastUsizeSet,
        mut todo_cmps: FastUsizeSet,
        save: bool,
        threshold: f64,
    ) -> (Vec<f64>, Vec<f64>) {
        let mut pgs = self.pgs.clone();
        let mut mgs = self.mgs.clone();

        let mut ps: Vec<f64> = self.vs.iter().map(|&v| 1.0 / v).collect();
        let mut ms = self.ms.clone();

        let mut sum_pgs_mgs = vec![0.0; self.n];
        let mut sum_pgs = vec![0.0; self.n];

        // assert!(n_cmps == pgs.len());
        // assert!(n_cmps == mgs.len());
        // assert!(n_cmps == self.g.len());
        assert!(self.n == sum_pgs.len());
        assert!(self.n == sum_pgs_mgs.len());
        assert!(self.n == ps.len());
        assert!(self.n == ms.len());

        let g = &self.g;

        for _i in 0..1000 {
            // println!("iter {}, todo_cmps {}", _i, todo_cmps.vec.len());

            if todo_cmps.vec.len() == 0 {
                break;
            }

            while let Some(j) = todo_cmps.pop() {
                // TODO to avoid bounds check but can't use nightly bc raj :(
                // unsafe {
                //     std::intrinsics::assume(g[j][0] < self.n && g[j][1] < self.n);
                //     std::intrinsics::assume(j < self.g.len());
                // }

                // unsafe {
                //     std::intrinsics::assume(g[j][0] < self.n && g[j][1] < self.n);
                // }

                let psg0 = ps[g[j][0]] - pgs[j][0];
                let psg1 = ps[g[j][1]] - pgs[j][1];

                let msg0 = (ps[g[j][0]] * ms[g[j][0]] - pgs[j][0] * mgs[j][0]) / psg0;
                let msg1 = (ps[g[j][1]] * ms[g[j][1]] - pgs[j][1] * mgs[j][1]) / psg1;

                let vgt = 1.0 + 1.0 / psg0 + 1.0 / psg1;
                let mgt = msg0 - msg1;

                let (ps_val, lmb) = psi_lamb(mgt / vgt.sqrt());
                let mt = mgt + vgt.sqrt() * ps_val;
                let pt = 1.0 / (vgt * (1.0 - lmb));

                let ptg = pt - 1.0 / vgt;
                let mtg = (mt * pt - mgt / vgt) / (ptg + f64::EPSILON);

                pgs[j][0] = 1.0 / (1.0 + 1.0 / ptg + 1.0 / psg1);
                pgs[j][1] = 1.0 / (1.0 + 1.0 / ptg + 1.0 / psg0);

                mgs[j][0] = msg1 + mtg;
                mgs[j][1] = msg0 - mtg;

                todo_vars.add(g[j][0]);
                todo_vars.add(g[j][1]);
            }

            while let Some(p) = todo_vars.pop() {
                sum_pgs[p] = 0.0;
                sum_pgs_mgs[p] = 0.0;

                for &i in &self.var_to_cmps0[p] {
                    sum_pgs[p] += pgs[i][0];
                    sum_pgs_mgs[p] += pgs[i][0] * mgs[i][0];
                }
                for &i in &self.var_to_cmps1[p] {
                    sum_pgs[p] += pgs[i][1];
                    sum_pgs_mgs[p] += pgs[i][1] * mgs[i][1];
                }

                let ps_ = 0.02 + sum_pgs[p];
                let ms_ = sum_pgs_mgs[p] / ps_;

                if (ms_ - ms[p]).abs() > threshold || (ps_ - ps[p]).abs() > threshold {
                    // println!("p {} ms {} -> {} ps {} -> {}", p, ms[p], ms_, ps[p], ps_);
                    for &i in &self.var_to_cmps0[p] {
                        todo_cmps.add(i);
                    }
                    for &i in &self.var_to_cmps1[p] {
                        todo_cmps.add(i);
                    }
                }

                ps[p] = ps_;
                ms[p] = ms_;
            }
        }

        if ps.iter().any(|&p| p.is_nan()) || ms.iter().any(|&m| m.is_nan()) {
            panic!("NaN in ps/ms: ps: {:?}\nms: {:?}", ps, ms);
        }

        if save {
            self.vs = ps.iter().map(|&p| 1.0 / p).collect();
            self.ms = ms.clone();
            self.pgs = pgs;
            self.mgs = mgs;
        }

        (ms, ps.iter().map(|&p| 1.0 / p).collect())
    }
}

// Helper functions
fn kl_divergence(mean_1: &[f64], var_1: &[f64], mean_2: &[f64], var_2: &[f64]) -> f64 {
    0.5 * (var_2.iter().map(|&x| x.ln()).sum::<f64>() - var_1.iter().map(|&x| x.ln()).sum::<f64>()
        + var_1
            .iter()
            .zip(var_2.iter())
            .map(|(&v1, &v2)| v1 / v2)
            .sum::<f64>()
        + mean_1
            .iter()
            .zip(mean_2.iter())
            .zip(var_2.iter())
            .map(|((&m1, &m2), &v2)| (m2 - m1).powi(2) / v2)
            .sum::<f64>()
        - mean_1.len() as f64)
}

// too slow :(
// TODO could use simd w/ sleef for erf
fn kl_div_pairs(mean_1: &[f64], var_1: &[f64], mean_2: &[f64], var_2: &[f64]) -> f64 {
    let mut sorted_ixs = (0..mean_1.len()).collect::<Vec<_>>();
    sorted_ixs.sort_by(|&i, &j| mean_1[i].partial_cmp(&mean_1[j]).unwrap());

    let mut kl = 0.0;

    for i in 0..mean_1.len() {
        let m1l = mean_1[i];
        let v1l = var_1[i];
        let m2l = mean_2[i];
        let v2l = var_2[i];

        if (m1l - m2l).abs() < 1e-6 && (v1l - v2l).abs() < 1e-6 {
            continue;
        }

        // only compare closest 4 items to each i
        // FIXME need to sort by mean first
        for j in (i.saturating_sub(2))..(i + 3).min(mean_1.len()) {
            let m1r = mean_1[j];
            let v1r = var_1[j];

            let m2r = mean_2[j];
            let v2r = var_2[j];

            let v1_sum = 1.0 + v1l + v1r;
            let v2_sum = 1.0 + v2l + v2r;

            // TODO get q from prob cmps
            let p = ndtr((m1l - m1r) / v1_sum.sqrt());
            let q = ndtr((m2l - m2r) / v2_sum.sqrt());

            kl += p * (p / q).ln();
            // kl += (1.0 - p) * ((1.0 - p) / (1.0 - q)).ln();
        }
    }

    kl
}

fn ndtr(a: f64) -> f64 {
    if a.is_nan() {
        return f64::NAN;
    }
    let x = a * (1.0 / 2.0_f64.sqrt());
    let z = x.abs();
    if z < (1.0 / 2.0_f64.sqrt()) {
        0.5 + 0.5 * erf(x)
    } else {
        let y = 0.5 * erfc(z);
        if x > 0.0 {
            1.0 - y
        } else {
            y
        }
    }
}

fn psi_lamb(x: f64) -> (f64, f64) {
    let p = exp(-x * x / 2.0) / (2.0 * PI).sqrt();
    let c = ndtr(x);
    let ps = p / c;
    (ps, ps * (ps + x))
}
