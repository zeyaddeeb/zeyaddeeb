use deepseek_lab::{
    protocol::Phase,
    train::{Brain, Unattended},
};

#[test]
fn it_learns_to_read_then_to_answer_on_lines_it_never_trains_on() {
    for seed in [3, 11] {
        let mut brain = Brain::new(seed).unwrap();
        let random = brain.probe().unwrap();
        assert!(random.held_out_loss > 4.0 && random.accuracy < 0.1);
        assert!(!random.dream.unwrap().compiles);

        for _ in 0..120 {
            assert!(
                brain
                    .language_step(Phase::Pretrain, &mut Unattended)
                    .unwrap()
                    .committed
            );
        }
        let reads = brain.probe().unwrap();
        assert!(
            reads.held_out_loss < 1.6,
            "seed {seed}: held-out loss {} after pretraining",
            reads.held_out_loss
        );

        for _ in 0..300 {
            brain.language_step(Phase::Sft, &mut Unattended).unwrap();
        }
        let answers = brain.probe().unwrap();
        assert!(
            answers.accuracy > reads.accuracy + 0.25,
            "seed {seed}: accuracy {} → {}",
            reads.accuracy,
            answers.accuracy
        );
        assert_eq!(brain.step, 420);
        assert_eq!(brain.revision, 420);
    }
}

#[test]
fn the_same_seed_gives_the_same_model() {
    let run = |seed| {
        let mut brain = Brain::new(seed).unwrap();
        let losses: Vec<f32> = (0..6)
            .map(|_| {
                brain
                    .language_step(Phase::Pretrain, &mut Unattended)
                    .unwrap()
                    .loss
            })
            .collect();
        losses
    };
    assert_eq!(run(5), run(5));
    assert_ne!(run(5), run(6));
}
