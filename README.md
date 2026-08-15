# Darning simulator

A visible, comparative simulator for damage, darning, and sashiko-style reinforcement in an effectively infinite woven sheet.

**Live UI:** <https://domenzain.github.io/darning-simulator/>

The numerical core is C++23. The exact same translation unit builds as:

- a native library and SVG-producing command-line program;
- a 19 kB freestanding WebAssembly module, with no Emscripten runtime and no JavaScript reimplementation of the model.

## What it already does

- orthotropic base tissue with independent warp and weft directional capacities;
- null damage, worn ellipses, holes, tears, and an internal arbitrary-polygon damage representation;
- elliptical, rectangular, or interactively drawn concave repair perimeters;
- plain and basket darning, running sashiko, hishi diamond lattices, and an asanoha-inspired tiled motif;
- scan-line and tiled pattern generation clipped against any simple repair polygon;
- stitch paths anchored to the interstitial lattice implied by the base-thread spacing;
- a heat map of local strength under a selectable pull direction;
- an automatically expanded domain whose boundary perturbation is below a chosen far-field tolerance;
- native SVG export, native tests, and WASM smoke tests.

## Try it locally

```sh
./scripts/build_wasm.sh
./scripts/serve.sh
# open http://localhost:8000
```

A web server is required because browsers do not load a sibling `.wasm` module reliably from `file://` URLs.

## Native build

```sh
cmake -S . -B build -G Ninja -DCMAKE_BUILD_TYPE=Release
cmake --build build
ctest --test-dir build --output-on-failure

./build/darning \
  --pattern asanoha \
  --damage wear \
  --load-angle 20 \
  --output repair.svg
```

Accepted pattern names are `none`, `darn`, `basket`, `running`, `hishi`, and `asanoha`. Damage names are `none`, `wear`, `hole`, and `tear`.

## Model in one equation

For a pull direction \(n\), the base directional capacity is

\[
C_0(n) = C_w (n \cdot w)^2 + C_f (n \cdot f)^2.
\]

Damage removes local capacity and each stitch contributes according to its tangent. Their perturbation is propagated by the screened operator

\[
(I - \ell^2 \nabla^2)u = s,
\]

where \(\ell\) is the load-transfer length. A screened field decays approximately exponentially, so the finite computation window is enlarged until the omitted tail is below the requested tolerance. See [`docs/model.md`](docs/model.md) for the exact discretization and interpretation.

The output is a comparative local-strength proxy. It is deliberately not presented as a certified tear, seam, fatigue, or fracture-mechanics calculation.

## Architecture and extension points

`src/darning_core.cpp` contains no standard-library dependency in the WASM build. It owns geometry, clipping, stitch rasterization, the screened solve, and metrics. `src/native_main.cpp` is only a native renderer. `darning-simulator/app.js` is only UI and canvas rendering.

Every pattern is a generator in a small registry. New patterns normally need only to emit candidate line segments or a tiled unit cell; the common clipper handles arbitrary concave perimeters and the common rasterizer handles mechanics. Curved motifs can be approximated by short segments without changing the solver API.

The core exports stable C functions and flat float buffers, which keeps native, WASM, Python, and future GUI bindings straightforward.

## Validation

```sh
cmake -S . -B build -G Ninja
cmake --build build
ctest --test-dir build --output-on-failure
./scripts/build_wasm.sh
node tests/wasm_smoke.mjs
node --check darning-simulator/app.js
```

The tests cover the exact null case, damage-before-repair ordering, local reinforcement, orthotropy, far-field return, all current pattern generators, and clipping to a concave polygon.

## License

MIT
