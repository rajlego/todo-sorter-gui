use rand::Rng;
use tuple_map::TupleMap2;

use crate::asap_cpu::ASAP;
use crate::plot_ci::plot_ci;
use std::collections::HashMap;
use std::fs::File;
use std::io::{self, BufRead, Write};
use std::process::Command;
use std::thread;

const EMOJIS: &[&str] = &["📅", "⏳", "✅"];

pub fn main() -> io::Result<()> {
    let mut args = std::env::args();
    args.next();
    let dir = args.next().unwrap();
    println!("dir: {}", dir);
    std::env::set_current_dir(dir)?;
    loop {
        run()?
    }
}

fn run() -> io::Result<()> {
    let (mut with_rid, mut without_rid) = get_todos()?;

    let comparisons: Vec<(usize, usize)> = io::BufReader::new(File::open("ratings.log")?)
        .lines()
        .filter_map(|line| {
            let line = line.ok()?;
            if let [i, j] = line
                .split(',')
                .filter_map(|s| s.parse().ok())
                .filter(|&i| with_rid.contains_key(&i))
                .collect::<Vec<_>>()[..]
            {
                Some((i, j))
            } else {
                None
            }
        })
        .collect();

    let mut id_to_index: HashMap<_, _> = with_rid
        .iter()
        .enumerate()
        .map(|(i, (&id, _))| (id, i))
        .collect();
    let mut index_to_id: HashMap<_, _> = id_to_index.iter().map(|(&k, &v)| (v, k)).collect();

    let n = with_rid.len() + if without_rid.is_empty() { 0 } else { 1 };
    let mut m = vec![vec![0; n]; n];
    for &(i, j) in &comparisons {
        if id_to_index.contains_key(&i) && id_to_index.contains_key(&j) {
            m[id_to_index[&i]][id_to_index[&j]] += 1;
        }
    }

    let mut asap = ASAP::new(n);

    let (pair, prob, ms_curr, vs_curr) = asap.run_asap(&m);

    {
        let id_to_index = id_to_index.clone();
        let prob = prob.clone();
        let ms_curr = ms_curr.clone();
        thread::spawn(move || {
            crate::plot_ratings::plot_ratings(
                "ratings.log",
                "ratings_graph",
                &ms_curr,
                &id_to_index,
                &prob,
            )
            .unwrap();
        });
    }

    {
        let index_to_id = index_to_id.clone();
        let ms_curr = ms_curr.clone();
        let vs_curr = vs_curr.clone();
        let with_rid = with_rid.clone();
        thread::spawn(move || {
            let items: Vec<_> = ms_curr
                .iter()
                .zip(vs_curr.iter())
                .enumerate()
                .filter_map(|(i, (&m, &v))| {
                    index_to_id
                        .get(&i)
                        .and_then(|&id| with_rid.get(&id).map(|t| (t.todo.clone(), m, v)))
                })
                .collect();
            plot_ci(items, "ratings_ci.html").unwrap();
        });
    }

    // assign an id / add [[rid::]] to a random todo in without_rid
    if !without_rid.is_empty() && (pair.0 == n - 1 || pair.1 == n - 1) {
        let ix = n - 1;
        let rid = with_rid.iter().map(|(id, _)| id).max().unwrap_or(&0usize) + 1;
        let mut rng = rand::thread_rng();
        let idx = rng.gen_range(0..without_rid.len());
        let todo = without_rid.swap_remove(idx);
        let new_line = if let Some(pos) = EMOJIS.iter().filter_map(|e| todo.todo.find(e)).min() {
            format!(
                "{} [[rid::{}]] {}",
                &todo.todo[..pos],
                rid,
                &todo.todo[pos..]
            )
        } else {
            format!("{} [[rid::{}]]", todo.todo, rid)
        };
        with_rid.insert(rid, todo.clone());
        index_to_id.insert(ix, rid);
        id_to_index.insert(rid, ix);
        replace_line_in_file(&todo.file, todo.line_num, &new_line)?;
    }

    let pair = pair.map(|i| index_to_id.get(&i).unwrap());
    pair.for_each(|id| {
        let t = with_rid.get(id).unwrap();
        println!("{} ({}:{})", t.todo, t.file, t.line_num);
    });

    print!("Enter 1 or 2: ");
    io::stdout().flush()?;
    let c = console::Term::stdout().read_char()?;
    println!();
    let mut file = File::options().append(true).open("ratings.log")?;
    writeln!(
        file,
        "{},{}",
        if c == '1' { pair.0 } else { pair.1 },
        if c == '1' { pair.1 } else { pair.0 }
    )?;

    Ok(())
}

#[derive(Clone)]
struct Todo {
    file: String,
    line_num: usize,
    todo: String,
}

fn get_todos() -> io::Result<(HashMap<usize, Todo>, Vec<Todo>)> {
    let command_output = Command::new("rg")
        .args(&[r"^\s*- \[ \]", ".", "-n"])
        .output()?;
    let output = String::from_utf8_lossy(&command_output.stdout);

    let mut with_rid = HashMap::new();
    let mut without_rid = Vec::new();

    for line in output.lines() {
        let parts: Vec<&str> = line.splitn(3, ':').collect();
        if parts.len() == 3 {
            let line = parts[2];
            let todo = Todo {
                file: parts[0].to_string(),
                line_num: parts[1].parse().unwrap(),
                todo: line.to_string(),
            };

            if let Some(start) = line.find("[[rid::") {
                if let Some(end) = line[start..].find("]]") {
                    if let Ok(rid) = line[start + 7..start + end].parse() {
                        with_rid.insert(rid, todo);
                    } else {
                        println!("Invalid rid: {}", &line[start + 7..start + end]);
                    }
                } else {
                    println!("Invalid rid: {}", &line[start..]);
                }
            } else {
                without_rid.push(todo);
            }
        }
    }

    Ok((with_rid, without_rid))
}

fn replace_line_in_file(file: &str, line_num: usize, new_content: &str) -> io::Result<()> {
    let content = std::fs::read_to_string(file)?;
    let mut lines: Vec<String> = content.lines().map(String::from).collect();
    if line_num > lines.len() {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            format!("line {} is out of bounds", line_num),
        ));
    }
    lines[line_num - 1] = new_content.to_string();
    std::fs::write(file, lines.join("\n"))?;
    Ok(())
}
