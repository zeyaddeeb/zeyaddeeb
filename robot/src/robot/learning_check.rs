use super::{
    episode::{should_release, EpisodeEndReason},
    observation::{compute_reward_components, get_observation, release_reward, BASKET_REWARD},
    reset::{release_ball, reset_robot_positions},
    resources::{BallGrip, CurriculumStage, SharedTrainer, TrainingState},
    setup::setup,
    state::{extract_robot_state, BallQuery, JointReadQuery},
    torque::{apply_torques, ComputedTorques, TorqueWriteQuery},
    training::training_loop,
};
use crate::rl::{SacAsyncTrainer, TrainingBudget, EPISODE_STEPS};
use avian3d::prelude::*;
use bevy::{prelude::*, time::TimeUpdateStrategy};
use std::{sync::Arc, time::Instant};

#[derive(Resource, Default)]
struct Evaluation {
    step: usize,
    reward: f32,
    previous: Option<Vec<f32>>,
    done: bool,
    stage: CurriculumStage,
    ball_released: bool,
    steps_since_release: usize,
    success: bool,
    prev_ball_pos: Option<Vec3>,
}

fn evaluate_step(
    mut score: ResMut<Evaluation>,
    training: Res<TrainingState>,
    mut commands: Commands,
    mut grip: ResMut<BallGrip>,
    mut queries: ParamSet<(JointReadQuery, TorqueWriteQuery, BallQuery)>,
) {
    if score.done {
        return;
    }

    score.ball_released |= grip.released;

    let Some(state) = extract_robot_state(&queries.p0()) else {
        return;
    };

    let (ball, ball_velocity) = {
        let balls = queries.p2();
        let (pos, velocity, _) = balls.single().unwrap();

        (pos.0, velocity.0)
    };

    let end = EpisodeEndReason::check(
        ball,
        score.prev_ball_pos,
        state.torso_pos,
        state.torso_up,
        score.ball_released,
        score.stage,
        score.step,
    );

    if let Some(previous) = &score.previous {
        let reward = compute_reward_components(
            &state,
            previous,
            ball,
            ball_velocity,
            score.ball_released,
            score.stage,
        );

        score.reward += reward.stand + reward.throw;

        if score.ball_released && score.steps_since_release == 0 && !grip.dropped {
            score.reward += release_reward(ball, ball_velocity);
        }

        if end == Some(EpisodeEndReason::BasketMade) {
            score.reward += BASKET_REWARD;
        } else if end.is_some() && score.stage == CurriculumStage::Shooting {
            score.reward -= 5.0;
        }
    }

    if let Some(reason) = end {
        score.done = true;
        score.success = reason.is_stage_success(score.stage, ball);

        return;
    }

    let observation = get_observation(
        &state,
        ball,
        ball_velocity,
        score.ball_released,
        score.stage,
        score.step,
    );

    let action = training
        .sac_trainer
        .agent
        .lock()
        .unwrap()
        .get_action(&observation)
        .unwrap();

    assert!(action.iter().all(|a| a.is_finite()));
    apply_torques(&mut queries.p1(), &ComputedTorques::from_action(&action));

    if score.ball_released {
        score.steps_since_release += 1;
    } else if should_release(score.stage, score.step, action[13]) {
        score.ball_released = true;
        release_ball(&mut commands, &mut grip);
    }

    score.prev_ball_pos = Some(ball);
    score.previous = Some(action);
    score.step += 1;
}

fn app(trainer: Arc<SacAsyncTrainer>, substeps: u32) -> App {
    let mut app = App::new();

    app.add_plugins((
        MinimalPlugins,
        TransformPlugin,
        AssetPlugin::default(),
        PhysicsPlugins::default(),
    ))
    .add_plugins(super::BallGripPlugin)
    .init_asset::<Mesh>()
    .init_asset::<StandardMaterial>()
    .insert_resource(SharedTrainer {
        trainer,
        headless: true,
    })
    .insert_resource(TimeUpdateStrategy::FixedTimesteps(1))
    .insert_resource(SubstepCount(substeps))
    .insert_resource(Gravity(Vec3::new(0.0, -9.81, 0.0)))
    .add_systems(Startup, setup);

    app.finish();
    app.cleanup();

    app
}

fn evaluate(trainer: &SacAsyncTrainer, substeps: u32, stage: CurriculumStage) -> (f32, f32, usize) {
    trainer.save_checkpoint();

    let frozen = Arc::new(SacAsyncTrainer::new());

    frozen.agent.lock().unwrap().is_training = false;

    let mut total_reward = 0.0;
    let mut total_steps = 0;
    let mut successes = 0;

    for offset in [-0.04, -0.02, 0.0, 0.02, 0.04] {
        let mut app = app(frozen.clone(), substeps);

        app.insert_resource(Evaluation { stage, ..default() })
            .add_systems(
                Startup,
                (move |mut bodies: Query<(&mut Transform, &RigidBody)>| {
                    for (mut transform, body) in &mut bodies {
                        if *body == RigidBody::Dynamic {
                            transform.translation += Vec3::new(offset, 0.0, -offset);
                        }
                    }
                })
                .after(setup),
            )
            .add_systems(FixedUpdate, evaluate_step);

        for _ in 0..EPISODE_STEPS + 5 {
            app.update();

            if app.world().resource::<Evaluation>().done {
                break;
            }
        }

        let result = app.world().resource::<Evaluation>();

        assert!(result.done && result.reward.is_finite());
        total_reward += result.reward;
        total_steps += result.step;
        successes += usize::from(result.success);
    }

    (total_reward / 5.0, total_steps as f32 / 5.0, successes)
}

struct CheckpointSandbox {
    original_cwd: std::path::PathBuf,
    scratch: std::path::PathBuf,
}

impl Drop for CheckpointSandbox {
    fn drop(&mut self) {
        std::env::set_current_dir(&self.original_cwd).unwrap();
    }
}

fn checkpoint_sandbox() -> CheckpointSandbox {
    let original_cwd = std::env::current_dir().unwrap();
    let scratch = std::env::temp_dir().join(format!("robot-learning-check-{}", std::process::id()));
    let checkpoints = scratch.join("checkpoints_sac");

    std::fs::create_dir_all(&checkpoints).unwrap();

    // Fresh initialization by default. Explicit snapshots include optimizer/replay/metadata.
    if let Some(source) = std::env::var_os("ROBOT_EVAL_CHECKPOINT_DIR") {
        fn copy_tree(source: &std::path::Path, target: &std::path::Path) {
            std::fs::create_dir_all(target).unwrap();

            for entry in std::fs::read_dir(source).unwrap() {
                let entry = entry.unwrap();

                if entry.file_type().unwrap().is_dir() {
                    copy_tree(&entry.path(), &target.join(entry.file_name()));
                } else {
                    std::fs::copy(entry.path(), target.join(entry.file_name())).unwrap();
                }
            }
        }

        copy_tree(std::path::Path::new(&source), &checkpoints);
    }

    std::env::set_current_dir(&scratch).unwrap();

    CheckpointSandbox {
        original_cwd,
        scratch,
    }
}

#[test]
#[ignore = "Behavioral learning benchmark; run alone with --ignored --nocapture --test-threads=1"]
fn standing_reward_before_and_after_training() {
    let sandbox = checkpoint_sandbox();

    let trainer = Arc::new(SacAsyncTrainer::with_budget(
        TrainingBudget::new(8.0, 50).unwrap(),
    ));

    let baseline = evaluate(&trainer, 12, CurriculumStage::Standing);

    println!(
        "EVALUATION updates=0 mean_reward={:.2} mean_steps={:.1}",
        baseline.0, baseline.1
    );

    let mut training = app(trainer.clone(), 12);

    training
        .add_systems(FixedUpdate, training_loop)
        .add_systems(
            Update,
            reset_robot_positions
                .run_if(|state: Option<Res<TrainingState>>| state.is_some_and(|s| s.needs_reset)),
        );

    let started = Instant::now();
    let mut last_report = Instant::now();

    for target in [250, 500, 1000] {
        while trainer.get_stats().train_steps_done < target {
            training.update();

            if last_report.elapsed().as_secs() >= 20 {
                let stats = trainer.get_stats();

                println!(
                    "TRAIN elapsed={}s samples={} updates={} episodes={}",
                    started.elapsed().as_secs(),
                    stats.buffer_len,
                    stats.train_steps_done,
                    stats.episodes_completed
                );

                last_report = Instant::now();
            }

            assert!(started.elapsed().as_secs() < 600, "training stalled");
        }

        let result = evaluate(&trainer, 12, CurriculumStage::Standing);

        println!(
            "EVALUATION updates={} mean_reward={:.2} mean_steps={:.1} successes={}/5",
            trainer.get_stats().train_steps_done,
            result.0,
            result.1,
            result.2
        );
    }

    println!("Learning artifacts: {}", sandbox.scratch.display());
}

#[test]
#[ignore = "Frozen-policy evaluation; run alone with --ignored --nocapture --test-threads=1"]
fn evaluate_saved_policy_by_stage() {
    let _sandbox = checkpoint_sandbox();
    let trainer = SacAsyncTrainer::new();

    for stage in [
        CurriculumStage::Standing,
        CurriculumStage::RaiseBall,
        CurriculumStage::Shooting,
    ] {
        let result = evaluate(&trainer, 12, stage);

        println!(
            "STAGE {} mean_reward={:.2} mean_steps={:.1} successes={}/5",
            stage.as_str(),
            result.0,
            result.1,
            result.2
        );
    }
}

#[test]
fn waiting_for_control_freezes_physics_without_an_extra_tick() {
    let mut app = App::new();

    app.add_plugins((
        MinimalPlugins,
        TransformPlugin,
        AssetPlugin::default(),
        PhysicsPlugins::default(),
    ))
    .init_asset::<Mesh>()
    .insert_resource(TimeUpdateStrategy::FixedTimesteps(1));

    let body = app
        .world_mut()
        .spawn((
            RigidBody::Dynamic,
            Collider::sphere(0.1),
            Transform::from_xyz(0.0, 2.0, 0.0),
        ))
        .id();

    app.finish();
    app.cleanup();
    app.update();
    app.update();

    {
        let mut clock = app.world_mut().resource_mut::<Time<Physics>>();

        clock.pause();
        clock.advance_by(std::time::Duration::ZERO);
    }

    let before = app.world().get::<Position>(body).unwrap().0;

    for _ in 0..10 {
        app.update();
    }

    assert_eq!(app.world().get::<Position>(body).unwrap().0, before);
    app.world_mut().resource_mut::<Time<Physics>>().unpause();
    app.update();
    assert!(app.world().get::<Position>(body).unwrap().y < before.y);
}

#[test]
fn ballistic_shot_scores_through_the_actual_physics_stepper() {
    use super::constants::{BALL_RADIUS, HOOP_POS};

    let mut app = App::new();

    app.add_plugins((
        MinimalPlugins,
        TransformPlugin,
        AssetPlugin::default(),
        PhysicsPlugins::default(),
    ))
    .init_asset::<Mesh>()
    .insert_resource(TimeUpdateStrategy::FixedTimesteps(1))
    .insert_resource(SubstepCount(12))
    .insert_resource(Gravity(Vec3::new(0.0, -9.81, 0.0)));

    let start = Vec3::new(0.5, 1.8, 0.0);
    let flight_seconds = 0.8;
    let velocity = (HOOP_POS - start) / flight_seconds + Vec3::Y * (0.5 * 9.81 * flight_seconds);

    let ball = app
        .world_mut()
        .spawn((
            RigidBody::Dynamic,
            Collider::sphere(BALL_RADIUS),
            Transform::from_translation(start),
            LinearVelocity(velocity),
        ))
        .id();

    app.finish();
    app.cleanup();

    let mut previous = start;
    let mut end = None;

    for step in 1..100 {
        app.update();

        let current = app.world().get::<Position>(ball).unwrap().0;

        end = EpisodeEndReason::check(
            current,
            Some(previous),
            Vec3::Y * 1.5,
            Vec3::Y,
            true,
            CurriculumStage::Shooting,
            step,
        );

        if end.is_some() {
            break;
        }

        previous = current;
    }

    assert_eq!(end, Some(EpisodeEndReason::BasketMade));
}

#[derive(Resource, Default)]
struct Trace {
    step: usize,
    previous: Option<Vec<f32>>,
    released: bool,
    done: bool,
    prev_ball_pos: Option<Vec3>,
    total: f32,
}

fn trace_step(
    mut trace: ResMut<Trace>,
    training: Res<TrainingState>,
    mut commands: Commands,
    mut grip: ResMut<BallGrip>,
    mut queries: ParamSet<(JointReadQuery, TorqueWriteQuery, BallQuery)>,
) {
    let _ = &mut commands;

    if trace.done {
        return;
    }

    trace.released |= grip.released;

    let Some(state) = extract_robot_state(&queries.p0()) else {
        return;
    };

    let (ball, ball_velocity) = {
        let balls = queries.p2();
        let (pos, velocity, _) = balls.single().unwrap();

        (pos.0, velocity.0)
    };

    let stage = CurriculumStage::RaiseBall;

    let end = EpisodeEndReason::check(
        ball,
        trace.prev_ball_pos,
        state.torso_pos,
        state.torso_up,
        trace.released,
        stage,
        trace.step,
    );

    let mut reward = (0.0, 0.0);

    if let Some(previous) = &trace.previous {
        let r =
            compute_reward_components(&state, previous, ball, ball_velocity, trace.released, stage);

        reward = (r.stand, r.throw);
        trace.total += r.stand + r.throw;
    }

    println!(
        "TRACE step={} ball=({:.2},{:.2},{:.2}) ball_v=({:.2},{:.2},{:.2}) hand=({:.2},{:.2},{:.2}) torso_y={:.2} up_y={:.2} shoulder={:.2} elbow={:.2} wrist={:.2} lshoulder={:.2} lelbow={:.2} lwrist={:.2} released={} dropped={} stand={:.2} throw={:.2} total={:.1}",
        trace.step,
        ball.x, ball.y, ball.z,
        ball_velocity.x, ball_velocity.y, ball_velocity.z,
        state.hand_pos.x, state.hand_pos.y, state.hand_pos.z,
        state.torso_pos.y,
        state.torso_up.y,
        state.shoulder.angle, state.elbow.angle, state.wrist.angle,
        state.left_shoulder.angle, state.left_elbow.angle, state.left_wrist.angle,
        trace.released,
        grip.dropped,
        reward.0,
        reward.1,
        trace.total,
    );

    if let Some(reason) = end {
        println!(
            "TRACE end={} step={} total={:.1}",
            reason.as_str(),
            trace.step,
            trace.total
        );
        trace.done = true;

        return;
    }

    let observation = get_observation(
        &state,
        ball,
        ball_velocity,
        trace.released,
        stage,
        trace.step,
    );

    let action = training
        .sac_trainer
        .agent
        .lock()
        .unwrap()
        .get_action(&observation)
        .unwrap();

    println!(
        "ACTION step={} {}",
        trace.step,
        action
            .iter()
            .map(|a| format!("{a:.2}"))
            .collect::<Vec<_>>()
            .join(",")
    );

    apply_torques(&mut queries.p1(), &ComputedTorques::from_action(&action));

    trace.prev_ball_pos = Some(ball);
    trace.previous = Some(action);
    trace.step += 1;
}

#[test]
#[ignore = "temporary trace"]
fn trace_saved_policy_raise_ball() {
    let _sandbox = checkpoint_sandbox();
    let frozen = Arc::new(SacAsyncTrainer::new());

    frozen.agent.lock().unwrap().is_training = false;

    let mut app = app(frozen, 12);

    app.insert_resource(Trace::default())
        .add_systems(FixedUpdate, trace_step);

    for _ in 0..EPISODE_STEPS + 5 {
        app.update();

        if app.world().resource::<Trace>().done {
            break;
        }
    }
}
