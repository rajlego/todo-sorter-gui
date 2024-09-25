#![feature(let_chains)]
#![feature(core_intrinsics)]
mod asap_cpu;
pub mod plot_ratings;
mod plot_ci;
mod sorter;

fn main() {
    if let Err(e) = sorter::main() {
        eprintln!("Error: {}", e);
    }
}
