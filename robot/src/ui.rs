use bevy::prelude::*;

#[cfg(feature = "native")]
use crate::robot::{TrainingPhase, TrainingState};

#[derive(Component)]
pub struct StatsText;

#[derive(Component)]
pub struct EpisodeText;

#[derive(Component)]
pub struct RewardText;

#[derive(Component)]
pub struct BestRewardText;

#[derive(Component)]
pub struct SuccessRateText;

pub fn setup_ui(mut commands: Commands) {
    commands
        .spawn(Node {
            position_type: PositionType::Absolute,
            left: Val::Px(10.0),
            top: Val::Px(10.0),
            flex_direction: FlexDirection::Column,
            padding: UiRect::all(Val::Px(10.0)),
            ..default()
        })
        .with_children(|parent| {
            parent.spawn((
                Text::new("🤖 Robot Training Stats"),
                TextFont {
                    font_size: 24.0,
                    ..default()
                },
                TextColor(Color::srgb(0.9, 0.9, 0.9)),
                Node {
                    margin: UiRect::bottom(Val::Px(10.0)),
                    ..default()
                },
            ));

            parent.spawn((
                EpisodeText,
                Text::new("Episode: 0"),
                TextFont {
                    font_size: 18.0,
                    ..default()
                },
                TextColor(Color::srgb(0.8, 0.8, 0.8)),
            ));

            parent.spawn((
                RewardText,
                Text::new("Reward: 0.00 (EMA: 0.00)"),
                TextFont {
                    font_size: 18.0,
                    ..default()
                },
                TextColor(Color::srgb(0.8, 0.8, 0.8)),
            ));

            parent.spawn((
                BestRewardText,
                Text::new("Best: 0.00"),
                TextFont {
                    font_size: 18.0,
                    ..default()
                },
                TextColor(Color::srgb(0.3, 0.9, 0.3)),
            ));

            parent.spawn((
                SuccessRateText,
                Text::new("Baskets: 0/0 (0.0%)"),
                TextFont {
                    font_size: 18.0,
                    ..default()
                },
                TextColor(Color::srgb(0.9, 0.6, 0.2)),
            ));
        });
}

#[cfg(feature = "native")]
pub fn update_stats_ui(
    training: Res<TrainingState>,
    mut text_query: Query<(
        &mut Text,
        Option<&EpisodeText>,
        Option<&RewardText>,
        Option<&BestRewardText>,
        Option<&SuccessRateText>,
    )>,
) {
    if training.phase != TrainingPhase::Training {
        return;
    }

    for (mut text, episode, reward, best, success) in text_query.iter_mut() {
        if episode.is_some() {
            **text = format!("Episode: {} (Step: {})", training.episode, training.step);
        } else if reward.is_some() {
            **text = format!(
                "Reward: {:.2} (EMA: {:.2})",
                training.episode_reward, training.episode_reward_ema
            );
        } else if best.is_some() {
            **text = format!("Best: {:.2}", training.best_episode_reward);
        } else if success.is_some() {
            let total = training.episode.max(1);
            let rate = (training.baskets_made as f32 / total as f32) * 100.0;
            **text = format!(
                "Baskets: {}/{} ({:.1}%)",
                training.baskets_made, total, rate
            );
        }
    }
}

#[cfg(feature = "wasm")]
pub fn update_stats_ui(
    sim: Res<crate::robot::SimulationState>,
    mut text_query: Query<(
        &mut Text,
        Option<&EpisodeText>,
        Option<&RewardText>,
        Option<&BestRewardText>,
        Option<&SuccessRateText>,
    )>,
) {
    for (mut text, episode, reward, best, success) in text_query.iter_mut() {
        if episode.is_some() {
            if let Some(stats) = &sim.server_stats {
                **text = format!("Episode: {} (Step: {})", stats.episodes, sim.step);
            } else {
                **text = format!("Episode: {} (Step: {})", sim.episode, sim.step);
            }
        } else if reward.is_some() {
            if let Some(stats) = &sim.server_stats {
                **text = format!(
                    "Reward: {:.2} (Recent: {:.2})",
                    stats.avg_reward, stats.recent_reward
                );
            } else {
                **text = format!(
                    "Reward: {:.2} (EMA: {:.2})",
                    sim.episode_reward, sim.episode_reward_ema
                );
            }
        } else if best.is_some() {
            **text = format!("Best: {:.2}", sim.best_episode_reward);
        } else if success.is_some() {
            let total = sim.episode.max(1);
            let rate = (sim.baskets_made as f32 / total as f32) * 100.0;
            **text = format!("Baskets: {}/{} ({:.1}%)", sim.baskets_made, total, rate);
        }
    }
}
