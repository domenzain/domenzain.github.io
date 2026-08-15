# Mechanics model

This is a comparative textile-design model. It answers, under one explicit set of assumptions, where a repair leaves the cloth weaker or stronger for a chosen in-plane pull direction. It is not calibrated to a particular fibre, stitch tension, fatigue history, or crack-growth law.

## Base sheet

The base fabric is an orthotropic membrane with orthogonal warp and weft directions `w` and `f`, and capacities `Cw` and `Cf`. For unit load direction `n`,

```text
C₀(n) = Cw (n·w)² + Cf (n·f)².
```

Rotating the load therefore interpolates continuously between warp and weft capacity instead of hiding the textile orientation behind an isotropic scalar.

## Damage

A scalar mask `d(x) ∈ [0, 1]` removes local intact capacity. Null damage is exactly zero and consequently reproduces the base sheet exactly. Worn regions, holes, and tears are anti-aliased from signed-distance functions at the simulation grid scale.

## Repair geometry

Each pattern generator emits straight stitch segments. Every candidate segment passes through the same simple-polygon clipper, so ellipses, rectangles, and arbitrary concave repair boundaries share one implementation. Curved motifs are represented by short segments.

Plain woven patterns snap their pitch to an integer multiple of the base-thread spacing and place their line families at half-spacing offsets. This implements the modelling assumption that new thread occupies interstitial channels rather than crossing existing yarn centres.

The traditional star darn is deliberately different: its radial foundation spans the damaged centre, and its second thread is woven around those unsupported spokes.

## Stitch contribution

For stitch tangent `t` and load direction `n`, the deposited directional source is proportional to

```text
thread capacity × thread width × [0.12 + 0.88(t·n)²].
```

The small transverse term represents frictional and interlacing transfer; it does not claim that a yarn directly carries the full transverse load. Pattern-specific weights account for visible running-stitch duty cycle and the over/under star weave.

The source is deposited conservatively onto neighbouring cells by bilinear weights. This makes solver work proportional to stitch length plus grid size rather than multiplying every grid cell by every stitch segment.

## Load transfer

Damage and reinforcement form a signed source `s(x)`. The perturbation `u(x)` solves

```text
(I − ℓ²∇²)u = s,
```

where `ℓ` is the load-transfer length. The release core discretises this screened operator with a five-point stencil and solves it by conjugate gradients with zero perturbation at the outer boundary.

The final local strength proxy combines:

- intact base capacity after direct damage;
- direct local stitch capacity;
- the screened load-transfer field.

It is clamped nonnegative and at four times intact base capacity to keep deliberately extreme interactive inputs numerically bounded.

## Infinite-plane approximation

A screened field decays approximately exponentially. The finite computation window is enlarged by whole transfer lengths until a conservative source envelope falls below the selected far-field tolerance. The reported `boundary_error` independently measures the largest final relative-strength perturbation at that boundary. `influence_radius` is the furthest cell differing from intact cloth by more than the same tolerance.

## Limits and calibration path

The model does not yet include nonlinear yarn geometry, stitch tension, slippage, bending, seam failure, crack-tip stress intensity, progressive rupture, fatigue, fibre-specific constitutive curves, or stochastic thread breakage.

Those belong behind separately testable mechanics policies, not inside the pattern generators. A calibration programme would measure intact, damaged, and repaired directional tensile coupons; fit the base tensor and transfer length; and validate held-out repair shapes and patterns. Until then, compare patterns under identical assumptions rather than interpreting the values as certified strengths.
