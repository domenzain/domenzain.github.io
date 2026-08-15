#!/usr/bin/env sh
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$root"
cargo fmt --check
cargo clippy --all-targets -- -D warnings
cargo test
./scripts/build_wasm.sh
node --check darning-simulator/app.js
node --check darning-simulator/worker.js
node tests/wasm_smoke.mjs
node tests/worker_smoke.mjs
node tests/site_smoke.mjs
cargo run --release --bin darning-render -- --pattern star --damage hole --geometry-only true --output docs/star-darn-preview.svg
