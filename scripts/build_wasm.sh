#!/usr/bin/env sh
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cargo build --manifest-path "$root/Cargo.toml" --target wasm32-unknown-unknown --release
cp "$root/target/wasm32-unknown-unknown/release/darning_core.wasm" "$root/darning-simulator/darning_core.wasm"
chmod 0644 "$root/darning-simulator/darning_core.wasm"
printf 'built %s (%s bytes)\n' "$root/darning-simulator/darning_core.wasm" "$(wc -c < "$root/darning-simulator/darning_core.wasm")"
