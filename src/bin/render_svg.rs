use darning_core::{simulate, Config, DamageKind, PatternKind, RepairShape, Segment};
use std::{
    env,
    fs::File,
    io::{self, Write},
    path::PathBuf,
};

#[derive(Debug)]
struct Options {
    output: PathBuf,
    pattern: PatternKind,
    damage: DamageKind,
    load_angle: f32,
    star: bool,
    geometry_only: bool,
}

fn pattern(value: &str) -> PatternKind {
    match value {
        "darn" => PatternKind::PlainDarn,
        "basket" => PatternKind::BasketDarn,
        "running" => PatternKind::RunningSashiko,
        "hishi" => PatternKind::Hishi,
        "asanoha" => PatternKind::Asanoha,
        "star" => PatternKind::StarDarn,
        _ => PatternKind::None,
    }
}

fn damage(value: &str) -> DamageKind {
    match value {
        "wear" => DamageKind::Wear,
        "hole" => DamageKind::Hole,
        "tear" => DamageKind::Tear,
        _ => DamageKind::None,
    }
}

fn options() -> Options {
    let mut result = Options {
        output: PathBuf::from("darning.svg"),
        pattern: PatternKind::StarDarn,
        damage: DamageKind::Hole,
        load_angle: 0.0,
        star: true,
        geometry_only: false,
    };
    let arguments: Vec<String> = env::args().skip(1).collect();
    arguments
        .chunks_exact(2)
        .for_each(|pair| match pair[0].as_str() {
            "--output" => result.output = PathBuf::from(&pair[1]),
            "--pattern" => {
                result.pattern = pattern(&pair[1]);
                result.star = result.pattern == PatternKind::StarDarn;
            }
            "--damage" => result.damage = damage(&pair[1]),
            "--load-angle" => result.load_angle = pair[1].parse().unwrap_or(0.0),
            "--geometry-only" => result.geometry_only = pair[1].parse().unwrap_or(false),
            _ => {}
        });
    result
}

fn color(ratio: f32) -> (u8, u8, u8) {
    let interpolate = |from: u8, to: u8, amount: f32| {
        (from as f32 + (to as f32 - from as f32) * amount.clamp(0.0, 1.0)).round() as u8
    };
    if ratio <= 1.0 {
        let amount = ratio.clamp(0.0, 1.0);
        (
            interpolate(145, 242, amount),
            interpolate(43, 236, amount),
            interpolate(36, 219, amount),
        )
    } else {
        let amount = ((ratio - 1.0) / 0.8).clamp(0.0, 1.0);
        (
            interpolate(242, 39, amount),
            interpolate(236, 83, amount),
            interpolate(219, 121, amount),
        )
    }
}

fn segment_svg(
    segment: &Segment,
    map_x: impl Fn(f32) -> f32,
    map_y: impl Fn(f32) -> f32,
    star: bool,
) -> String {
    let (stroke, width, opacity) = if star {
        match segment.family as u32 {
            8 => ("#b98700", 2.2, 0.82),
            6 => ("#d5a300", 2.8, 0.96),
            _ => ("#e3b51b", 2.5, 0.98),
        }
    } else {
        ("#a62643", 2.2, 0.92)
    };
    format!(
        "<line x1='{:.3}' y1='{:.3}' x2='{:.3}' y2='{:.3}' stroke='{stroke}' stroke-width='{width}' opacity='{opacity}' stroke-linecap='round'/>",
        map_x(segment.x0), map_y(segment.y0), map_x(segment.x1), map_y(segment.y1),
    )
}

fn main() -> io::Result<()> {
    let options = options();
    let config = if options.star {
        Config {
            grid_size: 161,
            damage_kind: DamageKind::Hole,
            damage_x: 3.2,
            damage_y: 3.0,
            repair_shape: RepairShape::Ellipse,
            repair_x: 8.5,
            repair_y: 8.0,
            pattern_kind: PatternKind::StarDarn,
            pattern_spacing: 1.5,
            stitch_length: 1.4,
            thread_strength: 1.4,
            thread_width: 0.5,
            load_angle: options.load_angle,
            ..Config::default()
        }
    } else {
        Config {
            pattern_kind: options.pattern,
            damage_kind: options.damage,
            load_angle: options.load_angle,
            ..Config::default()
        }
    };
    let result = simulate(&config, &[]);
    let [domain_min_x, domain_max_x, domain_min_y, domain_max_y, ..] = result.bounds;
    let (min_x, max_x, min_y, max_y) = if options.geometry_only {
        let margin = 1.18;
        (
            -margin * config.repair_x,
            margin * config.repair_x,
            -margin * config.repair_y,
            margin * config.repair_y,
        )
    } else {
        (domain_min_x, domain_max_x, domain_min_y, domain_max_y)
    };
    let map_x = |value: f32| (value - min_x) / (max_x - min_x) * 800.0;
    let map_y = |value: f32| (max_y - value) / (max_y - min_y) * 800.0;
    let mut output = File::create(&options.output)?;
    writeln!(
        output,
        "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 800 800'>"
    )?;
    writeln!(output, "<rect width='800' height='800' fill='#f4efe3'/>")?;
    if options.geometry_only {
        let spacing = config.base_spacing;
        let x_start = (min_x / spacing).floor() as i32 - 1;
        let x_finish = (max_x / spacing).ceil() as i32 + 1;
        let y_start = (min_y / spacing).floor() as i32 - 1;
        let y_finish = (max_y / spacing).ceil() as i32 + 1;
        (x_start..=x_finish).try_for_each(|line| {
            let x = (line as f32 + 0.5) * spacing;
            writeln!(output, "<line x1='{:.3}' y1='0' x2='{:.3}' y2='800' stroke='#8b7a61' stroke-width='1.2' opacity='.35'/>", map_x(x), map_x(x))
        })?;
        (y_start..=y_finish).try_for_each(|line| {
            let y = (line as f32 + 0.5) * spacing;
            writeln!(output, "<line x1='0' y1='{:.3}' x2='800' y2='{:.3}' stroke='#6f604a' stroke-width='1.1' opacity='.31'/>", map_y(y), map_y(y))
        })?;
        writeln!(
            output,
            "<ellipse cx='400' cy='400' rx='{:.3}' ry='{:.3}' fill='#6b493f' opacity='.82'/>",
            config.damage_x * 800.0 / (max_x - min_x),
            config.damage_y * 800.0 / (max_y - min_y)
        )?;
        let outline_points = result
            .outline
            .iter()
            .map(|point| format!("{:.3},{:.3}", map_x(point.x), map_y(point.y)))
            .collect::<Vec<_>>()
            .join(" ");
        writeln!(output, "<polygon points='{outline_points}' fill='none' stroke='#554a3e' stroke-width='1.6' stroke-dasharray='8 7' opacity='.72'/>")?;
    } else {
        let step = 2usize;
        let cell = 800.0 / result.grid_size as f32;
        (0..result.grid_size).step_by(step).try_for_each(|y| {
            (0..result.grid_size).step_by(step).try_for_each(|x| {
                let ratio = result.strength[y * result.grid_size + x] / result.metrics[0];
                let (red, green, blue) = color(ratio);
                writeln!(output, "<rect x='{:.3}' y='{:.3}' width='{:.3}' height='{:.3}' fill='rgb({red},{green},{blue})'/>", x as f32 * cell, (result.grid_size - 1 - y) as f32 * cell, step as f32 * cell + 0.5, step as f32 * cell + 0.5)
            })
        })?;
    }
    result
        .segments
        .iter()
        .filter(|segment| segment.family as u32 == 8)
        .try_for_each(|segment| {
            writeln!(
                output,
                "{}",
                segment_svg(segment, map_x, map_y, options.star)
            )
        })?;
    result
        .segments
        .iter()
        .filter(|segment| segment.family as u32 != 8 && segment.family as u32 != 7)
        .try_for_each(|segment| {
            writeln!(
                output,
                "{}",
                segment_svg(segment, map_x, map_y, options.star)
            )
        })?;
    result
        .segments
        .iter()
        .filter(|segment| segment.family as u32 == 7)
        .try_for_each(|segment| {
            writeln!(
                output,
                "{}",
                segment_svg(segment, map_x, map_y, options.star)
            )
        })?;
    writeln!(output, "</svg>")?;
    eprintln!(
        "wrote {}: {} segments, mean damage {:.1}%, minimum {:.1}%, peak {:.1}%, boundary error {:.3}%",
        options.output.display(), result.segments.len(),
        100.0 * result.metrics[2] / result.metrics[0],
        100.0 * result.metrics[1] / result.metrics[0],
        100.0 * result.metrics[3] / result.metrics[0],
        100.0 * result.metrics[8],
    );
    Ok(())
}
