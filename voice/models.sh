#!/bin/sh
set -eu

voice="https://huggingface.co/samuel-vitorino/sopro-v2-turbo/resolve/c12d0dc7c4a33b3cb6ea3d11ceb70bc60c7c6312"
whisper="https://huggingface.co/openai/whisper-tiny.en/resolve/87c7102498dcde7456f24cfd30239ca606ed9063"
here="$(cd "$(dirname "$0")" && pwd)"
target="${1:-$here/models}"

fetch() {
    mkdir -p "$target/$2"
    [ -f "$target/$2/$3" ] || curl -fsSL --retry 3 -o "$target/$2/$3" "$1/$3"
}

for file in config.json model.safetensors semantic_encoder.safetensors \
    speaker_encoder.safetensors tokenizer.model vocoder.safetensors; do
    fetch "$voice" mimic "$file"
done

for file in config.json model.safetensors tokenizer.json; do
    fetch "$whisper" whisper "$file"
done

cd "$target"

if command -v sha256sum >/dev/null; then
    sha256sum -c "$here/models.sha256"
else
    shasum -a 256 -c "$here/models.sha256"
fi
