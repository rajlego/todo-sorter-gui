use std::fs::File;
use std::io::Write;

fn escape_xml(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
}

pub fn plot_ci(mut items: Vec<(String, f64, f64)>, filename: &str) -> std::io::Result<()> {
    // Sort items by mean in descending order
    items.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap());
    let graph_width = 400.0;
    let left_margin = 50.0; // Reduced left margin
    let right_margin = 1200.0; // Increased right margin for labels
    let total_width = left_margin + graph_width + right_margin;
    let row_height = 20.0;
    let height = row_height * items.len() as f64 + 40.0; // Add some extra space at the bottom
    let bar_height = 20.0;

    let min_mean = items
        .iter()
        .map(|&(_, m, _)| m)
        .fold(f64::INFINITY, f64::min);
    let max_mean = items
        .iter()
        .map(|&(_, m, _)| m)
        .fold(f64::NEG_INFINITY, f64::max);
    let range = max_mean - min_mean;

    let mut svg = format!(
        r#"<svg xmlns="http://www.w3.org/2000/svg" width="{}" height="{}">"#,
        total_width, height
    );

    // Add a white background
    svg.push_str(&format!(
        r#"<rect width="100%" height="100%" fill="white"/>"#
    ));

    // Add vertical line separating labels from graph
    svg.push_str(&format!(
        r#"<line x1="{}" y1="0" x2="{}" y2="{}" stroke="\#ccc" stroke-width="1"/>"#,
        left_margin, left_margin, height
    ));

    for (i, (name, mean, var)) in items.iter().enumerate() {
        let y = i as f64 * row_height + 20.0; // Add some top padding
        let x = left_margin + (graph_width * (max_mean - mean) / range);
        let ci_width = graph_width * (var.sqrt() * 1.645) / range; // 90% confidence interval

        // Add confidence interval line
        svg.push_str(&format!(
            r#"<line x1="{}" y1="{}" x2="{}" y2="{}" stroke="black" stroke-width="2"/>"#,
            x - ci_width / 2.0,
            y,
            x + ci_width / 2.0,
            y
        ));

        // Add mean point
        svg.push_str(&format!(
            r#"<circle cx="{}" cy="{}" r="4" fill="blue"/>"#,
            x, y
        ));

        // Add label to the left of the CI
        let label_x = x + ci_width / 2.0 + 10.0;
        svg.push_str(&format!(
            r#"<text x="{}" y="{}" font-family="Arial, sans-serif" font-size="14" text-anchor="start" dominant-baseline="middle">{}</text>"#,
            label_x,
            y,
            escape_xml(&truncate_text(name, 200))
        ));
    }

    svg.push_str("</svg>");
    File::create(filename)?.write_all(svg.as_bytes())?;
    Ok(())
}

fn truncate_text(s: &str, max_chars: usize) -> String {
    if s.chars().count() <= max_chars {
        s.to_string()
    } else {
        let mut truncated: String = s.chars().take(max_chars - 3).collect();
        truncated.push_str("...");
        truncated
    }
}
