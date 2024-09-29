use libm::{erf, erfc, exp};
use std::f64::consts::PI;

// perf ideas:
// - use selective EIG a la (https://arxiv.org/abs/2004.05691) (~only eval posterior on pairs with closeish ratings)
// - dynamically set threshold based on gradient of KL divergence and maybe best known EIG?
//   - compute gradients of element posteriors by other element posteriors & use that to propagate gradients?
//   - doable with autodiff i think, just backprop on KL div & use gradients of posteriors as thresholds
// - prio queue for updates in message passing by magnitude of update?

pub struct ASAP {
    ts_solver: TrueSkillSolver,
}

impl ASAP {
    pub fn new(n: usize) -> Self {
        ASAP {
            ts_solver: TrueSkillSolver::new(n),
        }
    }

    pub fn run_asap(
        &mut self,
        m: &[Vec<i32>],
    ) -> ((usize, usize), Vec<Vec<f64>>, Vec<f64>, Vec<f64>) {
        let n = m.len();
        let g = self.unroll_mat(m);

        self.compute_information_gain_mat(n, &g)
    }

    fn unroll_mat(&self, m: &[Vec<i32>]) -> Vec<[usize; 2]> {
        let n = m.len();
        let mut g = Vec::new();
        for i in 0..n {
            for j in 0..n {
                if m[i][j] > 0 {
                    // TODO use counts in trueskill solver instead of this loop
                    for _ in 0..m[i][j] {
                        g.push([i, j]);
                    }
                }
            }
        }
        g
    }

    fn compute_prob_cmps(&self) -> Vec<Vec<f64>> {
        let (means, vrs) = (self.ts_solver.ms.as_slice(), self.ts_solver.vs.as_slice());
        let n = means.len();

        let mut prob = vec![vec![0.0; n]; n];
        for i in 0..n {
            for j in 0..n {
                if i == j {
                    prob[i][j] = 0.0;
                } else {
                    let diff_means = means[i] - means[j];
                    let vars_sum = 1.0 + vrs[i] + vrs[j];
                    prob[i][j] = ndtr(diff_means / vars_sum.sqrt());
                }
            }
        }
        prob
    }

    fn compute_information_gain_mat(
        &mut self,
        n: usize,
        g: &[[usize; 2]],
    ) -> ((usize, usize), Vec<Vec<f64>>, Vec<f64>, Vec<f64>) {
        let mut kl_divs = vec![vec![0.0; n]; n];
        self.ts_solver.push_many(g);

        let (ms_curr, vs_curr) = self.ts_solver.solve(true);
        let prob = self.compute_prob_cmps();

        for i in 1..n {
            for j in 0..i {
                let kl1 = {
                    let (ms, vs) = self.ts_solver.solve_one((i, j));
                    kl_divergence(&ms, &vs, &ms_curr, &vs_curr)
                };

                let kl2 = {
                    let (ms, vs) = self.ts_solver.solve_one((j, i));
                    kl_divergence(&ms, &vs, &ms_curr, &vs_curr)
                };

                kl_divs[i][j] = prob[i][j] * kl1 + prob[j][i] * kl2;
            }
        }

        let pair_to_compare = self.get_maximum(&kl_divs);
        (pair_to_compare, prob, ms_curr, vs_curr)
    }

    fn get_maximum(&self, gain_mat: &[Vec<f64>]) -> (usize, usize) {
        // use rand::distributions::{Distribution, WeightedIndex};
        // use rand::thread_rng;
        // let mut rng = thread_rng();
        let mut indices = Vec::new();
        let mut weights = Vec::new();

        for (i, row) in gain_mat.iter().enumerate() {
            for (j, &gain) in row.iter().enumerate() {
                if gain > 0.0 {
                    indices.push((i, j));
                    weights.push(exp(gain * 20.0));
                }
            }
        }

        // let dist = WeightedIndex::new(&weights).unwrap();
        // let chosen_index = dist.sample(&mut rng);
        let chosen_index = weights
            .iter()
            .zip(&indices)
            .enumerate()
            .max_by(|(_, a), (_, b)| a.partial_cmp(b).unwrap())
            .unwrap()
            .0;
        let chosen_pair = indices[chosen_index];

        let max_gain = gain_mat
            .iter()
            .flat_map(|row| row.iter().cloned())
            .fold(0.0, f64::max);

        println!(
            "Chosen EIG: {}, Max EIG: {}",
            gain_mat[chosen_pair.0][chosen_pair.1], max_gain
        );
        chosen_pair
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
