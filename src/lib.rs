use std::{
    cell::UnsafeCell,
    cmp::Ordering,
    f32::consts::{PI, TAU},
};

pub const CONFIG_LEN: usize = 24;
pub const METRICS_LEN: usize = 12;
pub const BOUNDS_LEN: usize = 8;
pub const MAX_POLYGON_VERTICES: usize = 64;
pub const MAX_GRID_SIZE: usize = 193;

#[derive(Clone, Copy, Debug, Default, PartialEq)]
#[repr(C)]
pub struct Point {
    pub x: f32,
    pub y: f32,
}

impl Point {
    #[inline]
    pub const fn new(x: f32, y: f32) -> Self {
        Self { x, y }
    }
    #[inline]
    fn add(self, rhs: Self) -> Self {
        Self::new(self.x + rhs.x, self.y + rhs.y)
    }
    #[inline]
    fn sub(self, rhs: Self) -> Self {
        Self::new(self.x - rhs.x, self.y - rhs.y)
    }
    #[inline]
    fn scale(self, scalar: f32) -> Self {
        Self::new(self.x * scalar, self.y * scalar)
    }
    #[inline]
    fn dot(self, rhs: Self) -> f32 {
        self.x * rhs.x + self.y * rhs.y
    }
    #[inline]
    fn cross(self, rhs: Self) -> f32 {
        self.x * rhs.y - self.y * rhs.x
    }
    #[inline]
    fn length(self) -> f32 {
        self.dot(self).sqrt()
    }
    #[inline]
    fn normalized(self) -> Self {
        self.scale(1.0 / self.length().max(1.0e-8))
    }
}

#[derive(Clone, Copy, Debug, Default)]
#[repr(C)]
pub struct Segment {
    pub x0: f32,
    pub y0: f32,
    pub x1: f32,
    pub y1: f32,
    pub family: f32,
    pub weight: f32,
}

impl Segment {
    fn new(start: Point, end: Point, family: f32, weight: f32) -> Self {
        Self {
            x0: start.x,
            y0: start.y,
            x1: end.x,
            y1: end.y,
            family,
            weight,
        }
    }
    fn start(self) -> Point {
        Point::new(self.x0, self.y0)
    }
    fn end(self) -> Point {
        Point::new(self.x1, self.y1)
    }
    fn length(self) -> f32 {
        self.end().sub(self.start()).length()
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[repr(u32)]
pub enum DamageKind {
    None = 0,
    Wear = 1,
    Hole = 2,
    Tear = 3,
}

impl DamageKind {
    fn from_f32(value: f32) -> Self {
        match value.round() as u32 {
            1 => Self::Wear,
            2 => Self::Hole,
            3 => Self::Tear,
            _ => Self::None,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[repr(u32)]
pub enum RepairShape {
    None = 0,
    Ellipse = 1,
    Rectangle = 2,
    Polygon = 3,
}

impl RepairShape {
    fn from_f32(value: f32) -> Self {
        match value.round() as u32 {
            1 => Self::Ellipse,
            2 => Self::Rectangle,
            3 => Self::Polygon,
            _ => Self::None,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[repr(u32)]
pub enum PatternKind {
    None = 0,
    PlainDarn = 1,
    BasketDarn = 2,
    RunningSashiko = 3,
    Hishi = 4,
    Asanoha = 5,
    StarDarn = 6,
}

impl PatternKind {
    fn from_f32(value: f32) -> Self {
        match value.round() as u32 {
            1 => Self::PlainDarn,
            2 => Self::BasketDarn,
            3 => Self::RunningSashiko,
            4 => Self::Hishi,
            5 => Self::Asanoha,
            6 => Self::StarDarn,
            _ => Self::None,
        }
    }
}

#[derive(Clone, Debug)]
pub struct Config {
    pub grid_size: usize,
    pub warp_strength: f32,
    pub weft_strength: f32,
    pub fabric_angle: f32,
    pub base_spacing: f32,
    pub load_angle: f32,
    pub transfer_length: f32,
    pub tolerance: f32,
    pub damage_kind: DamageKind,
    pub damage_x: f32,
    pub damage_y: f32,
    pub damage_angle: f32,
    pub damage_severity: f32,
    pub repair_shape: RepairShape,
    pub repair_x: f32,
    pub repair_y: f32,
    pub repair_angle: f32,
    pub pattern_kind: PatternKind,
    pub pattern_spacing: f32,
    pub stitch_length: f32,
    pub thread_strength: f32,
    pub thread_width: f32,
    pub pattern_angle: f32,
    pub solver_iterations: usize,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            grid_size: 161,
            warp_strength: 1.0,
            weft_strength: 0.78,
            fabric_angle: 0.0,
            base_spacing: 1.6,
            load_angle: 0.0,
            transfer_length: 5.0,
            tolerance: 0.02,
            damage_kind: DamageKind::Hole,
            damage_x: 8.0,
            damage_y: 5.5,
            damage_angle: 0.0,
            damage_severity: 1.0,
            repair_shape: RepairShape::Ellipse,
            repair_x: 13.0,
            repair_y: 10.0,
            repair_angle: 0.0,
            pattern_kind: PatternKind::PlainDarn,
            pattern_spacing: 1.6,
            stitch_length: 2.2,
            thread_strength: 1.8,
            thread_width: 0.75,
            pattern_angle: 0.0,
            solver_iterations: 72,
        }
    }
}

impl Config {
    pub fn from_raw(raw: &[f32; CONFIG_LEN]) -> Self {
        let odd_grid = (raw[0].round() as usize).clamp(65, MAX_GRID_SIZE) | 1;
        Self {
            grid_size: odd_grid.min(MAX_GRID_SIZE),
            warp_strength: raw[1].max(0.01),
            weft_strength: raw[2].max(0.01),
            fabric_angle: raw[3],
            base_spacing: raw[4].max(0.2),
            load_angle: raw[5],
            transfer_length: raw[6].max(0.2),
            tolerance: raw[7].clamp(0.002, 0.1),
            damage_kind: DamageKind::from_f32(raw[8]),
            damage_x: raw[9].abs().max(0.05),
            damage_y: raw[10].abs().max(0.05),
            damage_angle: raw[11],
            damage_severity: raw[12].clamp(0.0, 1.0),
            repair_shape: RepairShape::from_f32(raw[13]),
            repair_x: raw[14].abs().max(0.05),
            repair_y: raw[15].abs().max(0.05),
            repair_angle: raw[16],
            pattern_kind: PatternKind::from_f32(raw[17]),
            pattern_spacing: raw[18].max(0.2),
            stitch_length: raw[19].max(0.1),
            thread_strength: raw[20].max(0.0),
            thread_width: raw[21].max(0.05),
            pattern_angle: raw[22],
            solver_iterations: (raw[23].round() as usize).clamp(24, 128),
        }
    }

    pub fn to_raw(&self) -> [f32; CONFIG_LEN] {
        [
            self.grid_size as f32,
            self.warp_strength,
            self.weft_strength,
            self.fabric_angle,
            self.base_spacing,
            self.load_angle,
            self.transfer_length,
            self.tolerance,
            self.damage_kind as u32 as f32,
            self.damage_x,
            self.damage_y,
            self.damage_angle,
            self.damage_severity,
            self.repair_shape as u32 as f32,
            self.repair_x,
            self.repair_y,
            self.repair_angle,
            self.pattern_kind as u32 as f32,
            self.pattern_spacing,
            self.stitch_length,
            self.thread_strength,
            self.thread_width,
            self.pattern_angle,
            self.solver_iterations as f32,
        ]
    }
}

#[derive(Clone, Debug, Default)]
pub struct Simulation {
    pub grid_size: usize,
    pub strength: Vec<f32>,
    pub damage: Vec<f32>,
    pub reinforcement: Vec<f32>,
    pub segments: Vec<Segment>,
    pub outline: Vec<Point>,
    pub metrics: [f32; METRICS_LEN],
    pub bounds: [f32; BOUNDS_LEN],
}

#[derive(Clone, Copy, Debug)]
struct Domain {
    min_x: f32,
    max_x: f32,
    min_y: f32,
    max_y: f32,
    cell: f32,
    center_x: f32,
    center_y: f32,
    tolerance: f32,
}

impl Domain {
    fn raw(self) -> [f32; BOUNDS_LEN] {
        [
            self.min_x,
            self.max_x,
            self.min_y,
            self.max_y,
            self.cell,
            self.center_x,
            self.center_y,
            self.tolerance,
        ]
    }
    fn point(self, x: usize, y: usize) -> Point {
        Point::new(
            self.min_x + x as f32 * self.cell,
            self.min_y + y as f32 * self.cell,
        )
    }
}

#[inline]
fn radians(degrees: f32) -> f32 {
    degrees * PI / 180.0
}

#[inline]
fn direction(degrees: f32) -> Point {
    let angle = radians(degrees);
    Point::new(angle.cos(), angle.sin())
}

#[inline]
fn rotate(point: Point, degrees: f32) -> Point {
    let angle = radians(degrees);
    let (sine, cosine) = angle.sin_cos();
    Point::new(
        cosine * point.x - sine * point.y,
        sine * point.x + cosine * point.y,
    )
}

#[inline]
fn smoothstep(low: f32, high: f32, value: f32) -> f32 {
    let t = ((value - low) / (high - low).max(1.0e-8)).clamp(0.0, 1.0);
    t * t * (3.0 - 2.0 * t)
}

fn distance_to_segment(point: Point, start: Point, end: Point) -> f32 {
    let delta = end.sub(start);
    let t = point.sub(start).dot(delta) / delta.dot(delta).max(1.0e-12);
    point
        .sub(start.add(delta.scale(t.clamp(0.0, 1.0))))
        .length()
}

pub fn point_in_polygon(point: Point, polygon: &[Point]) -> bool {
    polygon
        .iter()
        .enumerate()
        .fold(false, |inside, (index, current)| {
            let previous = polygon[(index + polygon.len() - 1) % polygon.len()];
            let crosses = (current.y > point.y) != (previous.y > point.y);
            let intersection_x = (previous.x - current.x) * (point.y - current.y)
                / (previous.y - current.y + 1.0e-20)
                + current.x;
            if crosses && point.x < intersection_x {
                !inside
            } else {
                inside
            }
        })
}

#[cfg(test)]
fn polygon_signed_distance(point: Point, polygon: &[Point]) -> f32 {
    let distance = polygon
        .iter()
        .enumerate()
        .map(|(index, current)| {
            distance_to_segment(
                point,
                polygon[(index + polygon.len() - 1) % polygon.len()],
                *current,
            )
        })
        .fold(f32::INFINITY, f32::min);
    if point_in_polygon(point, polygon) {
        distance
    } else {
        -distance
    }
}

fn repair_outline(config: &Config, polygon: &[Point]) -> Vec<Point> {
    match config.repair_shape {
        RepairShape::None => Vec::new(),
        RepairShape::Ellipse => (0..64)
            .map(|index| {
                let angle = TAU * index as f32 / 64.0;
                rotate(
                    Point::new(config.repair_x * angle.cos(), config.repair_y * angle.sin()),
                    config.repair_angle,
                )
            })
            .collect(),
        RepairShape::Rectangle => [
            Point::new(-config.repair_x, -config.repair_y),
            Point::new(config.repair_x, -config.repair_y),
            Point::new(config.repair_x, config.repair_y),
            Point::new(-config.repair_x, config.repair_y),
        ]
        .into_iter()
        .map(|point| rotate(point, config.repair_angle))
        .collect(),
        RepairShape::Polygon => polygon.iter().copied().take(MAX_POLYGON_VERTICES).collect(),
    }
}

fn segment_intersection_parameter(a: Point, b: Point, c: Point, d: Point) -> Option<f32> {
    let ab = b.sub(a);
    let cd = d.sub(c);
    let denominator = ab.cross(cd);
    (denominator.abs() >= 1.0e-7)
        .then(|| {
            let origin = c.sub(a);
            (
                origin.cross(cd) / denominator,
                origin.cross(ab) / denominator,
            )
        })
        .and_then(|(t, u)| {
            ((1.0e-6..1.0 - 1.0e-6).contains(&t) && (0.0..=1.0).contains(&u)).then_some(t)
        })
}

fn clip_segment(
    start: Point,
    end: Point,
    polygon: &[Point],
    family: f32,
    weight: f32,
    output: &mut Vec<Segment>,
) {
    if polygon.len() < 3 || start.sub(end).length() < 1.0e-5 {
        return;
    }
    let mut parameters = vec![0.0, 1.0];
    polygon
        .iter()
        .enumerate()
        .filter_map(|(index, current)| {
            segment_intersection_parameter(
                start,
                end,
                polygon[(index + polygon.len() - 1) % polygon.len()],
                *current,
            )
        })
        .for_each(|parameter| parameters.push(parameter));
    parameters.sort_by(|left, right| left.partial_cmp(right).unwrap_or(Ordering::Equal));
    parameters.dedup_by(|left, right| (*left - *right).abs() < 1.0e-5);
    let delta = end.sub(start);
    parameters
        .windows(2)
        .filter_map(|window| {
            let begin = window[0];
            let finish = window[1];
            let midpoint = start.add(delta.scale(0.5 * (begin + finish)));
            point_in_polygon(midpoint, polygon).then(|| {
                Segment::new(
                    start.add(delta.scale(begin)),
                    start.add(delta.scale(finish)),
                    family,
                    weight,
                )
            })
        })
        .for_each(|segment| output.push(segment));
}

#[derive(Clone, Copy)]
struct ProjectedBounds {
    min_u: f32,
    max_u: f32,
    min_v: f32,
    max_v: f32,
}

fn projected_bounds(polygon: &[Point], u: Point, v: Point) -> ProjectedBounds {
    polygon.iter().fold(
        ProjectedBounds {
            min_u: f32::INFINITY,
            max_u: f32::NEG_INFINITY,
            min_v: f32::INFINITY,
            max_v: f32::NEG_INFINITY,
        },
        |bounds, point| {
            let pu = point.dot(u);
            let pv = point.dot(v);
            ProjectedBounds {
                min_u: bounds.min_u.min(pu),
                max_u: bounds.max_u.max(pu),
                min_v: bounds.min_v.min(pv),
                max_v: bounds.max_v.max(pv),
            }
        },
    )
}

fn snapped_pitch(config: &Config, requested: f32) -> f32 {
    (requested / config.base_spacing).round().max(1.0) * config.base_spacing
}

fn full_rows(
    config: &Config,
    polygon: &[Point],
    angle: f32,
    spacing: f32,
    family: f32,
    weight: f32,
    output: &mut Vec<Segment>,
) {
    let u = direction(angle);
    let v = Point::new(-u.y, u.x);
    let bounds = projected_bounds(polygon, u, v);
    let margin = 2.0 * spacing.max(config.base_spacing);
    let first = ((bounds.min_v - 0.5 * config.base_spacing) / spacing).floor() * spacing
        + 0.5 * config.base_spacing;
    let rows = ((bounds.max_v - first) / spacing).ceil().max(0.0) as usize + 2;
    (0..rows).for_each(|row| {
        let offset = first + row as f32 * spacing;
        clip_segment(
            u.scale(bounds.min_u - margin).add(v.scale(offset)),
            u.scale(bounds.max_u + margin).add(v.scale(offset)),
            polygon,
            family,
            weight,
            output,
        );
    });
}

#[derive(Clone, Copy)]
struct DashedRows {
    angle: f32,
    spacing: f32,
    stitch: f32,
    family: f32,
    weight: f32,
}

fn dashed_rows(
    config: &Config,
    polygon: &[Point],
    specification: DashedRows,
    output: &mut Vec<Segment>,
) {
    let u = direction(specification.angle);
    let v = Point::new(-u.y, u.x);
    let bounds = projected_bounds(polygon, u, v);
    let dash = specification.stitch.max(0.35 * specification.spacing);
    let period = dash / 0.62;
    let first_row = ((bounds.min_v - 0.5 * config.base_spacing) / specification.spacing).floor()
        * specification.spacing
        + 0.5 * config.base_spacing;
    let rows = ((bounds.max_v - first_row) / specification.spacing)
        .ceil()
        .max(0.0) as usize
        + 2;
    let first_run = ((bounds.min_u - period) / period).floor() * period;
    let runs = ((bounds.max_u - first_run + period) / period)
        .ceil()
        .max(0.0) as usize
        + 2;
    (0..rows).for_each(|row| {
        let offset = first_row + row as f32 * specification.spacing;
        let phase = if row % 2 == 0 { 0.0 } else { 0.5 * period };
        (0..runs).for_each(|run| {
            let along = first_run + run as f32 * period + phase;
            clip_segment(
                u.scale(along).add(v.scale(offset)),
                u.scale(along + dash).add(v.scale(offset)),
                polygon,
                specification.family,
                specification.weight,
                output,
            );
        });
    });
}

fn ray_polygon_radius(polygon: &[Point], ray: Point) -> Option<f32> {
    polygon
        .iter()
        .enumerate()
        .filter_map(|(index, current)| {
            let previous = polygon[(index + polygon.len() - 1) % polygon.len()];
            let edge = current.sub(previous);
            let denominator = ray.cross(edge);
            (denominator.abs() >= 1.0e-7)
                .then(|| {
                    let t = previous.cross(edge) / denominator;
                    let u = previous.cross(ray) / denominator;
                    (t, u)
                })
                .and_then(|(t, u)| (t > 0.0 && (0.0..=1.0).contains(&u)).then_some(t))
        })
        .fold(None, |closest, candidate| {
            Some(closest.map_or(candidate, |value| value.min(candidate)))
        })
}

fn generate_star_darn(config: &Config, polygon: &[Point], output: &mut Vec<Segment>) {
    if polygon.len() < 3 {
        return;
    }
    let damage_radius = config.damage_x.max(config.damage_y);
    let estimated = (TAU * damage_radius / (1.35 * config.pattern_spacing)).round() as usize;
    let spoke_count = (estimated.clamp(8, 16) + estimated.clamp(8, 16) % 2).min(16);
    let phase = radians(config.pattern_angle);
    let weave_x = (config.damage_x + 0.35 * config.pattern_spacing).min(config.repair_x * 0.78);
    let weave_y = (config.damage_y + 0.35 * config.pattern_spacing).min(config.repair_y * 0.78);
    let turns =
        ((damage_radius / (0.38 * config.pattern_spacing).max(0.45)).ceil() as usize).clamp(4, 9);

    // A compact, over-under spiral is the woven centre of the traditional star darn.
    // Under-passes are emitted first so renderers can put them behind the radial foundation.
    let crossings = spoke_count * turns;
    let spiral_points: Vec<Point> = (0..=crossings)
        .map(|index| {
            let progress = index as f32 / crossings as f32;
            let angle = phase + PI / spoke_count as f32 + TAU * index as f32 / spoke_count as f32;
            let radial = 0.10 + 0.90 * progress;
            let hand_variation = 1.0 + 0.018 * (index as f32 * 1.81).sin();
            Point::new(
                weave_x * radial * hand_variation * angle.cos(),
                weave_y * radial * hand_variation * angle.sin(),
            )
        })
        .collect();

    // Repair-specific woven wheels are commonly worked under two spokes, then
    // back over one.  The 2:1 layer cadence also advances around an even spoke
    // count instead of assigning the same spokes permanently above or below.
    spiral_points
        .windows(2)
        .enumerate()
        .filter(|(index, _)| index % 3 != 2)
        .for_each(|(_, pair)| {
            clip_segment(pair[0], pair[1], polygon, 8.0, 0.92, output);
        });

    (0..spoke_count).for_each(|index| {
        let angle = phase + TAU * index as f32 / spoke_count as f32;
        let ray = Point::new(angle.cos(), angle.sin());
        let boundary =
            ray_polygon_radius(polygon, ray).unwrap_or(config.repair_x.max(config.repair_y));
        let variation = 0.94 + 0.035 * (index as f32 * 2.17 + 0.4).sin();
        let start = ray.scale(-0.035 * config.pattern_spacing);
        let finish = ray.scale(boundary * variation);
        clip_segment(start, finish, polygon, 6.0, 1.0, output);
    });

    spiral_points
        .windows(2)
        .enumerate()
        .filter(|(index, _)| index % 3 == 2)
        .for_each(|(_, pair)| {
            clip_segment(pair[0], pair[1], polygon, 7.0, 0.92, output);
        });
}

fn generate_asanoha(config: &Config, polygon: &[Point], output: &mut Vec<Segment>) {
    let pitch = snapped_pitch(config, config.pattern_spacing);
    let stitch = config.stitch_length.max(0.72 * pitch);
    [0.0, 60.0, -60.0]
        .into_iter()
        .enumerate()
        .for_each(|(family, offset)| {
            dashed_rows(
                config,
                polygon,
                DashedRows {
                    angle: config.pattern_angle + offset,
                    spacing: 1.2 * pitch,
                    stitch,
                    family: 4.0 + family as f32,
                    weight: 0.76,
                },
                output,
            );
        });
}

fn generate_pattern(config: &Config, polygon: &[Point]) -> Vec<Segment> {
    let mut output = Vec::with_capacity(2048);
    if polygon.len() < 3 {
        return output;
    }
    let pitch = snapped_pitch(config, config.pattern_spacing);
    match config.pattern_kind {
        PatternKind::None => {}
        PatternKind::PlainDarn => {
            full_rows(
                config,
                polygon,
                config.pattern_angle,
                pitch,
                0.0,
                1.0,
                &mut output,
            );
            full_rows(
                config,
                polygon,
                config.pattern_angle + 90.0,
                pitch,
                1.0,
                1.0,
                &mut output,
            );
        }
        PatternKind::BasketDarn => {
            let stitch = config.stitch_length.max(1.2 * pitch);
            dashed_rows(
                config,
                polygon,
                DashedRows {
                    angle: config.pattern_angle,
                    spacing: 2.0 * pitch,
                    stitch,
                    family: 0.0,
                    weight: 0.78,
                },
                &mut output,
            );
            dashed_rows(
                config,
                polygon,
                DashedRows {
                    angle: config.pattern_angle + 90.0,
                    spacing: 2.0 * pitch,
                    stitch,
                    family: 1.0,
                    weight: 0.78,
                },
                &mut output,
            );
        }
        PatternKind::RunningSashiko => {
            dashed_rows(
                config,
                polygon,
                DashedRows {
                    angle: config.pattern_angle,
                    spacing: pitch,
                    stitch: config.stitch_length,
                    family: 2.0,
                    weight: 0.72,
                },
                &mut output,
            );
        }
        PatternKind::Hishi => {
            dashed_rows(
                config,
                polygon,
                DashedRows {
                    angle: config.pattern_angle + 45.0,
                    spacing: pitch,
                    stitch: config.stitch_length,
                    family: 2.0,
                    weight: 0.78,
                },
                &mut output,
            );
            dashed_rows(
                config,
                polygon,
                DashedRows {
                    angle: config.pattern_angle - 45.0,
                    spacing: pitch,
                    stitch: config.stitch_length,
                    family: 3.0,
                    weight: 0.78,
                },
                &mut output,
            );
        }
        PatternKind::Asanoha => generate_asanoha(config, polygon, &mut output),
        PatternKind::StarDarn => generate_star_darn(config, polygon, &mut output),
    }
    output
}

fn damage_signed_distance(point: Point, config: &Config) -> f32 {
    if config.damage_kind == DamageKind::None {
        return -1.0e6;
    }
    let local = rotate(point, -config.damage_angle);
    match config.damage_kind {
        DamageKind::None => -1.0e6,
        DamageKind::Wear | DamageKind::Hole => {
            let normalized = (local.x * local.x / (config.damage_x * config.damage_x)
                + local.y * local.y / (config.damage_y * config.damage_y))
                .sqrt();
            (1.0 - normalized) * config.damage_x.min(config.damage_y)
        }
        DamageKind::Tear => {
            config.damage_y
                - distance_to_segment(
                    local,
                    Point::new(-config.damage_x, 0.0),
                    Point::new(config.damage_x, 0.0),
                )
        }
    }
}

fn damage_coverage(point: Point, config: &Config, feather: f32) -> f32 {
    config.damage_severity * smoothstep(-feather, feather, damage_signed_distance(point, config))
}

fn directional_base_strength(config: &Config) -> f32 {
    let angle = radians(config.load_angle - config.fabric_angle);
    let (sine, cosine) = angle.sin_cos();
    config.warp_strength * cosine * cosine + config.weft_strength * sine * sine
}

fn bounds_of(points: &[Point]) -> Option<(f32, f32, f32, f32)> {
    points.first().map(|first| {
        points
            .iter()
            .skip(1)
            .fold((first.x, first.x, first.y, first.y), |bounds, point| {
                (
                    bounds.0.min(point.x),
                    bounds.1.max(point.x),
                    bounds.2.min(point.y),
                    bounds.3.max(point.y),
                )
            })
    })
}

fn compute_domain(config: &Config, outline: &[Point]) -> Domain {
    let repair_bounds = bounds_of(outline).unwrap_or((-10.0, 10.0, -10.0, 10.0));
    let damage_extent =
        (config.damage_x * config.damage_x + config.damage_y * config.damage_y).sqrt();
    let feature_min_x = repair_bounds.0.min(-damage_extent);
    let feature_max_x = repair_bounds.1.max(damage_extent);
    let feature_min_y = repair_bounds.2.min(-damage_extent);
    let feature_max_y = repair_bounds.3.max(damage_extent);
    let center_x = 0.5 * (feature_min_x + feature_max_x);
    let center_y = 0.5 * (feature_min_y + feature_max_y);
    let feature_half = 0.5 * (feature_max_x - feature_min_x).max(feature_max_y - feature_min_y);
    let source_envelope = (config.damage_severity + config.thread_strength).max(1.0);
    let tail_lengths = (source_envelope / config.tolerance)
        .ln()
        .ceil()
        .clamp(3.0, 12.0);
    let half = (feature_half + config.transfer_length * (tail_lengths + 1.0)).max(16.0);
    let cell = 2.0 * half / (config.grid_size - 1) as f32;
    Domain {
        min_x: center_x - half,
        max_x: center_x + half,
        min_y: center_y - half,
        max_y: center_y + half,
        cell,
        center_x,
        center_y,
        tolerance: config.tolerance,
    }
}

#[inline]
fn index(x: usize, y: usize, size: usize) -> usize {
    y * size + x
}

fn deposit(field: &mut [f32], size: usize, domain: Domain, point: Point, amount: f32) {
    let gx = (point.x - domain.min_x) / domain.cell;
    let gy = (point.y - domain.min_y) / domain.cell;
    let x0 = gx.floor() as isize;
    let y0 = gy.floor() as isize;
    let tx = gx - x0 as f32;
    let ty = gy - y0 as f32;
    [
        (0, 0, (1.0 - tx) * (1.0 - ty)),
        (1, 0, tx * (1.0 - ty)),
        (0, 1, (1.0 - tx) * ty),
        (1, 1, tx * ty),
    ]
    .into_iter()
    .filter_map(|(dx, dy, weight)| {
        let x = x0 + dx;
        let y = y0 + dy;
        (x >= 0 && y >= 0 && x < size as isize && y < size as isize)
            .then_some((index(x as usize, y as usize, size), weight))
    })
    .for_each(|(cell, weight)| field[cell] += amount * weight);
}

fn rasterize_reinforcement(config: &Config, domain: Domain, segments: &[Segment]) -> Vec<f32> {
    let size = config.grid_size;
    let mut field = vec![0.0; size * size];
    let load = direction(config.load_angle);
    let sampling_step = (0.42 * domain.cell).max(0.12 * config.thread_width);
    segments.iter().for_each(|segment| {
        let start = segment.start();
        let delta = segment.end().sub(start);
        let length = delta.length();
        let tangent = delta.normalized();
        let alignment = 0.12 + 0.88 * tangent.dot(load).powi(2);
        let samples = (length / sampling_step).ceil().max(1.0) as usize;
        let step = length / samples as f32;
        let amount =
            config.thread_strength * config.thread_width * alignment * segment.weight * step
                / (domain.cell * domain.cell).max(1.0e-6);
        (0..=samples).for_each(|sample| {
            deposit(
                &mut field,
                size,
                domain,
                start.add(delta.scale(sample as f32 / samples as f32)),
                amount,
            );
        });
    });
    field
}

fn apply_operator(input: &[f32], output: &mut [f32], size: usize, diffusion: f32) {
    output.fill(0.0);
    let diagonal = 1.0 + 4.0 * diffusion;
    (1..size - 1).for_each(|y| {
        (1..size - 1).for_each(|x| {
            let cell = index(x, y, size);
            output[cell] = diagonal * input[cell]
                - diffusion
                    * (input[cell - 1] + input[cell + 1] + input[cell - size] + input[cell + size]);
        })
    });
}

fn inner_product(left: &[f32], right: &[f32], size: usize) -> f32 {
    (1..size - 1)
        .map(|y| {
            (1..size - 1)
                .map(|x| {
                    let cell = index(x, y, size);
                    left[cell] * right[cell]
                })
                .sum::<f32>()
        })
        .sum()
}

fn solve_screened(
    source: &[f32],
    size: usize,
    diffusion: f32,
    iterations: usize,
) -> (Vec<f32>, f32, usize) {
    let mut solution = vec![0.0; size * size];
    let mut residual = source.to_vec();
    let mut direction = source.to_vec();
    let mut operator = vec![0.0; size * size];
    let mut residual_norm = inner_product(&residual, &residual, size);
    let initial = residual_norm.max(1.0e-20);
    if residual_norm <= 1.0e-18 {
        return (solution, 0.0, 0);
    }
    let mut completed = 0;
    for iteration in 0..iterations {
        apply_operator(&direction, &mut operator, size, diffusion);
        let denominator = inner_product(&direction, &operator, size);
        if denominator.abs() < 1.0e-20 {
            break;
        }
        let alpha = residual_norm / denominator;
        (1..size - 1).for_each(|y| {
            (1..size - 1).for_each(|x| {
                let cell = index(x, y, size);
                solution[cell] += alpha * direction[cell];
                residual[cell] -= alpha * operator[cell];
            })
        });
        let next_norm = inner_product(&residual, &residual, size);
        completed = iteration + 1;
        if next_norm / initial < 1.0e-10 {
            residual_norm = next_norm;
            break;
        }
        let beta = next_norm / residual_norm.max(1.0e-20);
        (1..size - 1).for_each(|y| {
            (1..size - 1).for_each(|x| {
                let cell = index(x, y, size);
                direction[cell] = residual[cell] + beta * direction[cell];
            })
        });
        residual_norm = next_norm;
    }
    (solution, (residual_norm / initial).sqrt(), completed)
}

pub fn simulate(config: &Config, polygon: &[Point]) -> Simulation {
    let outline = repair_outline(config, polygon);
    let segments = generate_pattern(config, &outline);
    let domain = compute_domain(config, &outline);
    let size = config.grid_size;
    let cells = size * size;
    let feather = (0.75 * domain.cell).max(0.05);
    let damage: Vec<f32> = (0..cells)
        .map(|cell| {
            let x = cell % size;
            let y = cell / size;
            damage_coverage(domain.point(x, y), config, feather).clamp(0.0, 1.0)
        })
        .collect();
    let reinforcement = rasterize_reinforcement(config, domain, &segments);
    let base = directional_base_strength(config);
    let source: Vec<f32> = reinforcement
        .iter()
        .zip(&damage)
        .map(|(thread, damage)| 0.86 * thread - 0.58 * base * damage)
        .collect();
    let diffusion = config.transfer_length.powi(2) / domain.cell.powi(2).max(1.0e-6);
    let (solution, residual, solver_iterations) =
        solve_screened(&source, size, diffusion, config.solver_iterations);
    let strength: Vec<f32> = (0..cells)
        .map(|cell| {
            (base * (1.0 - damage[cell]) + 0.44 * reinforcement[cell] + 0.78 * solution[cell])
                .clamp(0.0, 4.0 * base)
        })
        .collect();

    let minimum = strength.iter().copied().fold(f32::INFINITY, f32::min);
    let maximum = strength.iter().copied().fold(f32::NEG_INFINITY, f32::max);
    let damage_weight: f32 = damage.iter().sum();
    let mean_damage_strength = if damage_weight > 1.0e-5 {
        strength
            .iter()
            .zip(&damage)
            .map(|(value, weight)| value * weight)
            .sum::<f32>()
            / damage_weight
    } else {
        base
    };
    let damage_area = damage_weight * domain.cell * domain.cell;
    let mut affected = 0usize;
    let mut weak = 0usize;
    let mut influence_radius = 0.0f32;
    let mut boundary_error = 0.0f32;
    (0..cells).for_each(|cell| {
        let x = cell % size;
        let y = cell / size;
        let ratio = strength[cell] / base.max(1.0e-6);
        let perturbation = (ratio - 1.0).abs();
        if perturbation > domain.tolerance {
            affected += 1;
            weak += usize::from(ratio < 1.0 - domain.tolerance);
            let point = domain.point(x, y);
            influence_radius = influence_radius
                .max(Point::new(point.x - domain.center_x, point.y - domain.center_y).length());
        }
        if x == 0 || y == 0 || x + 1 == size || y + 1 == size {
            boundary_error = boundary_error.max(perturbation);
        }
    });
    let thread_length: f32 = segments.iter().map(|segment| segment.length()).sum();
    let metrics = [
        base,
        minimum,
        mean_damage_strength,
        maximum,
        influence_radius,
        thread_length,
        if affected > 0 {
            weak as f32 / affected as f32
        } else {
            0.0
        },
        damage_area,
        boundary_error,
        residual,
        solver_iterations as f32,
        segments.len() as f32,
    ];

    Simulation {
        grid_size: size,
        strength,
        damage,
        reinforcement,
        segments,
        outline,
        metrics,
        bounds: domain.raw(),
    }
}

struct WasmState {
    config: [f32; CONFIG_LEN],
    polygon: [f32; MAX_POLYGON_VERTICES * 2],
    polygon_count: usize,
    simulation: Simulation,
}

impl Default for WasmState {
    fn default() -> Self {
        Self {
            config: Config::default().to_raw(),
            polygon: [0.0; MAX_POLYGON_VERTICES * 2],
            polygon_count: 0,
            simulation: Simulation::default(),
        }
    }
}

struct GlobalState(UnsafeCell<Option<WasmState>>);
unsafe impl Sync for GlobalState {}
static WASM_STATE: GlobalState = GlobalState(UnsafeCell::new(None));

fn with_wasm_state<Result>(function: impl FnOnce(&mut WasmState) -> Result) -> Result {
    unsafe {
        let slot = &mut *WASM_STATE.0.get();
        function(slot.get_or_insert_with(WasmState::default))
    }
}

#[no_mangle]
pub extern "C" fn darning_reset() {
    with_wasm_state(|state| {
        state.config = Config::default().to_raw();
        state.polygon_count = 0;
        state.simulation = Simulation::default();
    });
}

#[no_mangle]
pub extern "C" fn darning_config_ptr() -> *mut f32 {
    with_wasm_state(|state| state.config.as_mut_ptr())
}

#[no_mangle]
pub extern "C" fn darning_config_len() -> u32 {
    CONFIG_LEN as u32
}

#[no_mangle]
pub extern "C" fn darning_polygon_ptr() -> *mut f32 {
    with_wasm_state(|state| state.polygon.as_mut_ptr())
}

#[no_mangle]
pub extern "C" fn darning_polygon_capacity() -> u32 {
    MAX_POLYGON_VERTICES as u32
}

#[no_mangle]
pub extern "C" fn darning_set_polygon_count(count: u32) {
    with_wasm_state(|state| state.polygon_count = (count as usize).min(MAX_POLYGON_VERTICES));
}

#[no_mangle]
pub extern "C" fn darning_run() -> u32 {
    with_wasm_state(|state| {
        let config = Config::from_raw(&state.config);
        let polygon: Vec<Point> = state.polygon[..2 * state.polygon_count]
            .chunks_exact(2)
            .map(|coordinates| Point::new(coordinates[0], coordinates[1]))
            .collect();
        state.simulation = simulate(&config, &polygon);
        1
    })
}

#[no_mangle]
pub extern "C" fn darning_grid_size() -> u32 {
    with_wasm_state(|state| state.simulation.grid_size as u32)
}

#[no_mangle]
pub extern "C" fn darning_strength_ptr() -> *const f32 {
    with_wasm_state(|state| state.simulation.strength.as_ptr())
}

#[no_mangle]
pub extern "C" fn darning_damage_ptr() -> *const f32 {
    with_wasm_state(|state| state.simulation.damage.as_ptr())
}

#[no_mangle]
pub extern "C" fn darning_reinforcement_ptr() -> *const f32 {
    with_wasm_state(|state| state.simulation.reinforcement.as_ptr())
}

#[no_mangle]
pub extern "C" fn darning_segment_ptr() -> *const Segment {
    with_wasm_state(|state| state.simulation.segments.as_ptr())
}

#[no_mangle]
pub extern "C" fn darning_segment_count() -> u32 {
    with_wasm_state(|state| state.simulation.segments.len() as u32)
}

#[no_mangle]
pub extern "C" fn darning_outline_ptr() -> *const Point {
    with_wasm_state(|state| state.simulation.outline.as_ptr())
}

#[no_mangle]
pub extern "C" fn darning_outline_count() -> u32 {
    with_wasm_state(|state| state.simulation.outline.len() as u32)
}

#[no_mangle]
pub extern "C" fn darning_metrics_ptr() -> *const f32 {
    with_wasm_state(|state| state.simulation.metrics.as_ptr())
}

#[no_mangle]
pub extern "C" fn darning_bounds_ptr() -> *const f32 {
    with_wasm_state(|state| state.simulation.bounds.as_ptr())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn base_config() -> Config {
        Config {
            grid_size: 97,
            solver_iterations: 72,
            ..Config::default()
        }
    }

    #[test]
    fn null_damage_is_exactly_the_base_sheet() {
        let config = Config {
            damage_kind: DamageKind::None,
            damage_severity: 0.0,
            repair_shape: RepairShape::None,
            pattern_kind: PatternKind::None,
            ..base_config()
        };
        let result = simulate(&config, &[]);
        assert!(result
            .strength
            .iter()
            .all(|value| *value == result.metrics[0]));
        assert_eq!(result.metrics[4], 0.0);
    }

    #[test]
    fn an_open_hole_is_locally_weak() {
        let result = simulate(
            &Config {
                pattern_kind: PatternKind::None,
                repair_shape: RepairShape::None,
                ..base_config()
            },
            &[],
        );
        assert!(result.metrics[1] < 0.2 * result.metrics[0]);
        assert!(result.metrics[2] < result.metrics[0]);
        assert!(result.metrics[7] > 40.0);
    }

    #[test]
    fn a_darn_improves_the_hole_and_can_reinforce() {
        let damaged = simulate(
            &Config {
                pattern_kind: PatternKind::None,
                repair_shape: RepairShape::None,
                ..base_config()
            },
            &[],
        );
        let repaired = simulate(
            &Config {
                thread_strength: 2.2,
                ..base_config()
            },
            &[],
        );
        assert!(repaired.metrics[2] > damaged.metrics[2]);
        assert!(repaired.metrics[3] > repaired.metrics[0]);
        assert!(repaired.metrics[11] > 8.0);
    }

    #[test]
    fn base_sheet_is_orthotropic() {
        let warp = simulate(
            &Config {
                damage_kind: DamageKind::None,
                repair_shape: RepairShape::None,
                pattern_kind: PatternKind::None,
                load_angle: 0.0,
                ..base_config()
            },
            &[],
        );
        let weft = simulate(
            &Config {
                damage_kind: DamageKind::None,
                repair_shape: RepairShape::None,
                pattern_kind: PatternKind::None,
                load_angle: 90.0,
                ..base_config()
            },
            &[],
        );
        assert!(warp.metrics[0] > weft.metrics[0]);
        assert!((warp.metrics[0] - 1.0).abs() < 1.0e-5);
        assert!((weft.metrics[0] - 0.78).abs() < 1.0e-4);
    }

    #[test]
    fn every_registered_pattern_generates_thread() {
        [
            PatternKind::PlainDarn,
            PatternKind::BasketDarn,
            PatternKind::RunningSashiko,
            PatternKind::Hishi,
            PatternKind::Asanoha,
            PatternKind::StarDarn,
        ]
        .into_iter()
        .for_each(|pattern_kind| {
            let result = simulate(
                &Config {
                    pattern_kind,
                    ..base_config()
                },
                &[],
            );
            assert!(!result.segments.is_empty(), "{pattern_kind:?}");
        });
    }

    #[test]
    fn star_darn_has_radial_foundation_and_woven_centre() {
        let result = simulate(
            &Config {
                damage_x: 3.2,
                damage_y: 3.0,
                repair_x: 8.5,
                repair_y: 8.0,
                pattern_kind: PatternKind::StarDarn,
                pattern_spacing: 1.5,
                ..base_config()
            },
            &[],
        );
        let spokes = result
            .segments
            .iter()
            .filter(|segment| segment.family == 6.0)
            .count();
        let over = result
            .segments
            .iter()
            .filter(|segment| segment.family == 7.0)
            .count();
        let under = result
            .segments
            .iter()
            .filter(|segment| segment.family == 8.0)
            .count();
        assert!((8..=16).contains(&spokes));
        assert!(over > spokes && under > spokes);
        assert!(result
            .segments
            .iter()
            .filter(|segment| segment.family == 6.0)
            .all(|segment| segment.start().length() < 0.2));
    }

    #[test]
    fn concave_perimeters_clip_every_stitch() {
        let polygon = [
            Point::new(-12.0, -8.0),
            Point::new(12.0, -8.0),
            Point::new(12.0, -2.0),
            Point::new(4.0, -2.0),
            Point::new(4.0, 8.0),
            Point::new(-12.0, 8.0),
        ];
        let result = simulate(
            &Config {
                repair_shape: RepairShape::Polygon,
                ..base_config()
            },
            &polygon,
        );
        assert!(!result.segments.is_empty());
        assert!(result.segments.iter().all(|segment| {
            polygon_signed_distance(segment.start().add(segment.end()).scale(0.5), &polygon)
                >= -1.0e-4
        }));
    }

    #[test]
    fn computational_boundary_meets_requested_tolerance() {
        let result = simulate(&base_config(), &[]);
        assert!(
            result.metrics[8] <= base_config().tolerance + 1.0e-4,
            "{}",
            result.metrics[8]
        );
    }

    #[test]
    fn simulation_is_deterministic() {
        let left = simulate(
            &Config {
                pattern_kind: PatternKind::StarDarn,
                damage_x: 3.2,
                damage_y: 3.0,
                ..base_config()
            },
            &[],
        );
        let right = simulate(
            &Config {
                pattern_kind: PatternKind::StarDarn,
                damage_x: 3.2,
                damage_y: 3.0,
                ..base_config()
            },
            &[],
        );
        assert_eq!(left.metrics, right.metrics);
        assert_eq!(left.strength, right.strength);
    }
}
