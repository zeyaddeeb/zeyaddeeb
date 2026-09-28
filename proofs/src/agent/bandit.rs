use super::{live, memory::Arm};

const EXPLORATION: f64 = 0.6;

pub fn choose(arms: &[Arm], fronts: &[&str], last: &str) -> (String, Vec<live::Arm>) {
    let total: u64 = arms.iter().map(|arm| arm.pulls).sum();
    let views: Vec<live::Arm> = fronts
        .iter()
        .map(|front| {
            let arm = arms.iter().find(|arm| arm.front == *front);
            let pulls = arm.map_or(0, |arm| arm.pulls);
            let mean = arm.map_or(0.0, |arm| arm.reward / arm.pulls.max(1) as f64);
            let score = if pulls == 0 {
                f64::INFINITY
            } else {
                mean + EXPLORATION * ((total.max(1) as f64).ln() / pulls as f64).sqrt()
            };
            live::Arm {
                front: front.to_string(),
                pulls,
                mean,
                score,
            }
        })
        .collect();
    let chosen = views
        .iter()
        .filter(|view| view.front != last || fronts.len() == 1)
        .reduce(|best, view| if view.score > best.score { view } else { best })
        .map(|view| view.front.clone())
        .unwrap_or_else(|| fronts[0].to_string());
    (chosen, views)
}

pub fn reward(arms: &mut Vec<Arm>, front: &str, value: f64) {
    match arms.iter_mut().find(|arm| arm.front == front) {
        Some(arm) => {
            arm.pulls += 1;
            arm.reward += value;
        }
        None => arms.push(Arm {
            front: front.to_string(),
            pulls: 1,
            reward: value,
        }),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const FRONTS: [&str; 3] = ["line", "divisors", "lean"];

    #[test]
    fn visits_every_front_once_before_exploiting() {
        let mut arms = Vec::new();
        let mut last = String::new();
        let mut seen = Vec::new();
        for _ in 0..3 {
            let (front, _) = choose(&arms, &FRONTS, &last);
            reward(&mut arms, &front, 0.1);
            seen.push(front.clone());
            last = front;
        }
        assert_eq!(seen, vec!["line", "divisors", "lean"]);
    }

    #[test]
    fn prefers_the_rewarding_front_but_never_twice_in_a_row() {
        let mut arms = Vec::new();
        for _ in 0..10 {
            reward(&mut arms, "lean", 1.0);
            reward(&mut arms, "line", 0.0);
            reward(&mut arms, "divisors", 0.0);
        }
        assert_eq!(choose(&arms, &FRONTS, "line").0, "lean");
        assert_ne!(choose(&arms, &FRONTS, "lean").0, "lean");
    }
}
