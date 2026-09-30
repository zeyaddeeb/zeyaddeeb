use rig_core::providers::openai::{
    wire::{BodyRewrite, Dialect, Quirks, Route},
    OpenAI, OpenAIConfig,
};

pub fn dialect() -> Dialect {
    let mut quirks = Quirks::openai();
    quirks.completion_route = Route::Chat;
    quirks.verify_path = "/models";
    quirks.rewrite = BodyRewrite::DeepSeek;
    Dialect::gateway(
        "gateway",
        "http://localhost:1234/v1",
        "PROOFS_AGENT_API_KEY",
    )
    .with_quirks(quirks)
}

pub fn client(url: &str, key: &str) -> OpenAI {
    OpenAIConfig::with_key(&dialect(), key.to_string())
        .with_base_url(url)
        .client()
}
