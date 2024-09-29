// #![feature(let_chains)]
// #![feature(core_intrinsics)]
mod asap_cpu;
mod mp;
mod plot_ci;
pub mod plot_ratings;
mod sorter;

fn main() {
    if let Err(e) = sorter::main() {
        eprintln!("Error: {}", e);
    }
}
