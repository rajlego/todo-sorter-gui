// #![feature(let_chains)]
// #![feature(core_intrinsics)]
mod asap_cpu;
mod mp;
mod plot_ci;
pub mod plot_ratings;
mod sorter;
mod web_service;
mod db;

#[tokio::main]
async fn main() {
    // Load environment variables
    dotenv::dotenv().ok();
    
    // Check for command line arguments
    let args: Vec<String> = std::env::args().collect();
    
    // If "api" argument is provided, run the web service
    if args.len() > 1 && args[1] == "api" {
        println!("Starting API server...");
        web_service::run_web_service().await;
    } else {
        // Otherwise, run the original sorter CLI
        if let Err(e) = sorter::main() {
            eprintln!("Error: {}", e);
        }
    }
}
