use rig_core::{
    client::{
        BearerAuth, Capabilities, Capable, Client, ClientBuilder, DebugExt, Nothing, Provider,
        ProviderBuilder,
    },
    completion::CompletionError,
    http_client::{self, HttpClientExt},
    providers::openai::{
        self,
        completion::{GenericCompletionModel, OpenAICompatibleProvider},
    },
};
use serde_json::Value;

pub type Model = GenericCompletionModel<Gateway>;

pub fn client(url: &str, key: &str) -> http_client::Result<Client<Gateway>> {
    Client::<Gateway>::builder()
        .api_key(key)
        .base_url(url)
        .build()
}

#[derive(Debug, Default, Clone, Copy)]
pub struct Gateway;

#[derive(Debug, Default, Clone, Copy)]
pub struct GatewayBuilder;

impl Provider for Gateway {
    type Builder = GatewayBuilder;
    const VERIFY_PATH: &'static str = "/models";
}

impl ProviderBuilder for GatewayBuilder {
    type Extension<H>
        = Gateway
    where
        H: HttpClientExt;
    type ApiKey = BearerAuth;

    const BASE_URL: &'static str = "http://localhost:1234/v1";

    fn build<H>(_: &ClientBuilder<Self, Self::ApiKey, H>) -> http_client::Result<Gateway>
    where
        H: HttpClientExt,
    {
        Ok(Gateway)
    }
}

impl<H> Capabilities<H> for Gateway {
    type Completion = Capable<GenericCompletionModel<Gateway, H>>;
    type Embeddings = Nothing;
    type Rerank = Nothing;
    type Transcription = Nothing;
    type ModelListing = Nothing;
}

impl DebugExt for Gateway {}

impl OpenAICompatibleProvider for Gateway {
    const PROVIDER_NAME: &'static str = "gateway";

    type StreamingUsage = openai::Usage;
    type Response = openai::CompletionResponse;

    fn finalize_request_body(&self, body: &mut Value) -> Result<(), CompletionError> {
        if let Some(messages) = body.get_mut("messages").and_then(Value::as_array_mut) {
            for message in messages {
                if let Some(content) = message.get_mut("content") {
                    flatten(content);
                }
            }
        }
        Ok(())
    }
}

fn flatten(content: &mut Value) {
    let Some(parts) = content.as_array() else {
        return;
    };
    let texts: Option<Vec<&str>> = parts
        .iter()
        .map(|part| match part.get("type").and_then(Value::as_str) {
            Some("text") => part.get("text").and_then(Value::as_str),
            _ => None,
        })
        .collect();
    if let Some(texts) = texts {
        *content = Value::String(texts.join("\n"));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn sends_text_parts_as_strings() {
        let mut body = json!({"messages": [
            {"role": "system", "content": [{"type": "text", "text": "be brief"}]},
            {"role": "user", "content": "hi"},
            {"role": "assistant", "content": [
                {"type": "text", "text": "one"},
                {"type": "text", "text": "two"}
            ], "tool_calls": []},
        ]});
        Gateway.finalize_request_body(&mut body).unwrap();
        assert_eq!(body["messages"][0]["content"], "be brief");
        assert_eq!(body["messages"][1]["content"], "hi");
        assert_eq!(body["messages"][2]["content"], "one\ntwo");
    }

    #[test]
    fn leaves_images_for_the_server() {
        let parts = json!([
            {"type": "text", "text": "what is this"},
            {"type": "image_url", "image_url": {"url": "data:"}}
        ]);
        let mut content = parts.clone();
        flatten(&mut content);
        assert_eq!(content, parts);
    }
}
