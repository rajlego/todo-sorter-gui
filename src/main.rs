// #![feature(let_chains)]
// #![feature(core_intrinsics)]
mod asap_cpu;
mod mp;
mod plot_ci;
pub mod plot_ratings;
mod sorter;
mod web_service;
mod db;
mod auth;
mod realtime;

use std::env;
use web_service::run_web_service;

#[tokio::main]
async fn main() {
    // Check command line args
    let args: Vec<String> = env::args().collect();
    if args.len() > 1 && args[1] == "api" {
        // Run web service mode
        run_web_service().await;
    } else {
        // Run CLI mode (not implemented for now)
        println!("Please use 'api' command to start the web service");
    }
}
