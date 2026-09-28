pub fn primes_up_to(limit: usize) -> Vec<usize> {
    let mut composite = vec![false; limit + 1];
    let mut primes = Vec::new();
    for n in 2..=limit {
        if !composite[n] {
            primes.push(n);
            let mut multiple = n * n;
            while multiple <= limit {
                composite[multiple] = true;
                multiple += n;
            }
        }
    }
    primes
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn counts_primes_below_ten_thousand() {
        assert_eq!(primes_up_to(10_000).len(), 1229);
        assert_eq!(primes_up_to(2), vec![2]);
    }
}
