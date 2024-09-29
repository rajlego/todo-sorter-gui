use std::collections::{HashMap, HashSet};
use std::fs::File;
use std::io::{self, BufRead, Write};
use std::process::Command;

// fn rating_to_color(range: f64, rating: f64) -> String {
//     // let clamped_rating = rating.max(-2.0).min(2.0);
//     color_from_norm(normalized)
// }

fn color_from_norm(norm: f64) -> String {
    if norm < 0.5 {
        let r = 255;
        let g = (255.0 * (norm * 2.0)) as u8;
        format!("#{:02X}{:02X}00", r, g)
    } else {
        let r = (255.0 * ((1.0 - norm) * 2.0)) as u8;
        let g = 255;
        format!("#{:02X}{:02X}00", r, g)
    }
}

fn edge_color_from_norm(norm: f64) -> String {
    let intensity = (255.0 * (1.0 - norm)) as u8;
    format!("#{:02X}{:02X}{:02X}", intensity, intensity, intensity)
}

fn dfs(
    edges: &HashMap<usize, Vec<usize>>,
    from: usize,
    visited: &mut HashSet<usize>,
    map: &HashMap<(usize, usize), f64>,
    ok: &impl Fn(&f64) -> bool,
) {
    if !visited.insert(from) {
        return;
    }
    for to in edges.get(&from).unwrap_or(&vec![]) {
        if ok(map.get(&(from, *to)).unwrap()) {
            dfs(edges, *to, visited, map, ok);
        }
    }
}

fn transitive_reduction(edges: &mut HashMap<(usize, usize), f64>, ok: &impl Fn(&f64) -> bool) {
    // let mut edges_to_remove = Vec::new();
    let mut map: HashMap<usize, Vec<usize>> = HashMap::new();
    let mut nodes: Vec<usize> = edges.keys().map(|(x, _)| *x).collect();
    nodes.sort();

    for (from, to) in edges.keys() {
        map.entry(*from).or_insert_with(Vec::new).push(*to);
    }

    let mut edges_to_remove = HashSet::new();
    let mut dfs_buf: HashSet<usize> = HashSet::new();

    for n1 in nodes.iter() {
        for n2 in map.get(n1).unwrap_or(&vec![]) {
            if edges_to_remove.contains(n2) {
                continue;
            }

            dfs_buf.insert(*n1);
            dfs(&map, *n2, &mut dfs_buf, &edges, ok);
            for n3 in dfs_buf.iter() {
                if n2 == n3 || n1 == n3 {
                    continue;
                }
                edges_to_remove.insert(*n3);
            }
            dfs_buf.clear();
            // }
        }

        for y in edges_to_remove.iter() {
            edges.remove(&(*n1, *y));
            map.get_mut(n1)
                .unwrap()
                .retain(|z| !edges_to_remove.contains(z));
        }
        edges_to_remove.clear();
    }
}

pub fn plot_ratings(
    input_file: &str,
    output_file: &str,
    ms_curr: &[f64],
    id_to_index: &HashMap<usize, usize>,
    prob: &[Vec<f64>],
) -> io::Result<()> {
    let print = false;

    // let mut dot_content = String::from("digraph {\n  rankdir=LR;\nnewrank=true;\n");
    let mut dot_content =
        // String::from("digraph {\n  rankdir=LR;\nTBbalance=\"max\"\nratio=\"compress\"\n");
        // String::from("digraph {\n  rankdir=LR;\nratio=\"0.7\"\nranksep=\"0.1\"\nsplines=line\n");
        // String::from("digraph {\n  rankdir=LR;\nratio=\"0.7\"\nmargin=0\nnodesep=\"0.02\"\nranksep=\"0.05\"\nconcentrate=true\n");
        String::from("digraph {\n  rankdir=LR;\nratio=\"0.7\"\nmargin=0\nnodesep=\"0.02\"\nranksep=\"0.05\"\n");
    // String::from("digraph {\n  rankdir=LR;\nratio=\"0.7\"\nmargin=0\nnodesep=\"0.02\"\nranksep=\"0.05\"\n");
    // \nranksep=\"0.1\"\n");

    let rating_min = ms_curr.iter().fold(f64::INFINITY, |acc, &p| acc.min(p));
    let rating_max = ms_curr.iter().fold(f64::NEG_INFINITY, |acc, &p| acc.max(p));
    let rating_range = rating_max - rating_min;
    if print {
        println!("{:?}", (rating_min, rating_max, rating_range));
    }

    for (id, idx) in id_to_index.iter() {
        let rating = ms_curr[*idx];
        let color = color_from_norm((rating - rating_min) / rating_range);
        dot_content.push_str(&format!(
            // "  {} [label=\"{}\", style=filled, fillcolor=\"{}\"];\n",
            "  {} [label=\"{}\", style=filled, fillcolor=\"{}\"];\n",
            id, id, color
        ));
    }

    let Ok(file) = File::open(input_file) else {
        return Ok(());
    };
    let reader = io::BufReader::new(file);

    let mut edges: HashMap<(usize, usize), f64> = HashMap::new();
    for line in reader.lines() {
        let line = line?;
        let parts: Vec<&str> = line.split(',').collect();
        if parts.len() == 2 {
            let from = parts[0].parse::<usize>().unwrap();
            let to = parts[1].parse::<usize>().unwrap();
            if id_to_index.contains_key(&from) && id_to_index.contains_key(&to) {
                let p = prob[id_to_index[&from]][id_to_index[&to]];
                edges.insert((from, to), p);
            }
        }
    }

    transitive_reduction(&mut edges, &|p| *p > 0.5);
    transitive_reduction(&mut edges, &|p| *p < 0.5);

    // transitive_reduction(&mut edges, &|p| *p > 0.4);
    // transitive_reduction(&mut edges, &|p| *p < 0.6);
    // transitive_reduction(&mut edges, &|_| true);

    if print {
        println!("Edges after transitive reduction: {:?}", edges.len());
    }

    for ((from, to), &p) in edges.iter() {
        // let d = if ms_map[&from] < ms_map[&to] {
        //     ((ms_map[&from] - ms_map[&to]) / 0.3).floor()
        // } else {
        //     ((ms_map[&from] - ms_map[&to]) / 0.2).floor().max(1.0)
        // };
        // TODO maybe also use variance here?
        // maybe use cmp prob?
        // println!("{:?}", p);
        // let d = ((p - 0.5) * 2.0).powf(3.0);
        // let d = ms_map[&to] - ms_map[&from];
        // let d =
        dot_content.push_str(&format!(
            "  {} -> {} [color=\"{}\"{}];\n",
            &from,
            &to,
            edge_color_from_norm(p),
            if p > 0.5 {
                // ",weight=10"
                ""
            } else if p > 0.45 {
                ",minlen=0"
            } else if p > 0.35 {
                ",minlen=0,weight=0"
                // ",minlen=0,weight=1"
            } else {
                ",minlen=0,constraint=false"
            }
        ));
        // dot_content.push_str(&format!("  {} -> {} [len={}];\n", &from, &to, d));
        // let w = p * 0.3;
        // if ms_map[&from] < ms_map[&to] {
        //     let d = ((ms_map[&from] - ms_map[&to]) * w).ceil();
        //     dot_content.push_str(&format!("  {} -> {} [minlen={}];\n", &from, &to, d));
        //     // dot_content.push_str(&format!("  {} -> {} [minlen=0];\n", &from, &to));
        // } else {
        //     let d = ((ms_map[&from] - ms_map[&to]) * (w / 1.0)).ceil();
        //     dot_content.push_str(&format!("  {} -> {} [minlen={}];\n", &from, &to, d));
        // }
    }

    dot_content.push_str("}\n");

    let output_dot = format!("{}.dot", output_file);
    let output_png = format!("{}.png", output_file);

    // Save the dot file
    std::fs::write(&output_dot, &dot_content)?;
    if print {
        println!("Dot file saved as {}", output_dot);
    }

    // Generate PNG from dot file
    // let command = format!("tred {} | dot -Tpng -o {}", output_dot, output_png);
    let command = format!("dot -Tpng {} -o {}", output_dot, output_png);
    // let command = format!("tred {} | fdp -Tpng -o {}", output_dot, output_png);

    let out = Command::new("sh").arg("-c").arg(&command).output()?;

    if print {
        io::stdout().write_all(&out.stdout)?;
        io::stderr().write_all(&out.stderr)?;
        println!("Graph saved as {}", output_png);
    }

    Ok(())
}
