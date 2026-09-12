use std::path::Path;

fn find_all(haystack: &[u8], needle: &[u8]) -> Vec<usize> {
    if needle.is_empty() || haystack.len() < needle.len() {
        return Vec::new();
    }
    haystack
        .windows(needle.len())
        .enumerate()
        .filter_map(|(i, w)| (w == needle).then_some(i))
        .collect()
}

fn read_f64(bytes: &[u8], at: usize) -> Option<f64> {
    let raw: [u8; 8] = bytes.get(at..at + 8)?.try_into().ok()?;
    Some(f64::from_le_bytes(raw))
}

fn inspect(path: &Path) {
    println!("\n=== {} ===", path.display());
    let raw = match std::fs::read(path) {
        Ok(v) => v,
        Err(e) => {
            println!("READ ERROR: {e}");
            return;
        }
    };
    println!("compressed bytes: {}", raw.len());

    let blob = match pal_save::compress::decompress_sav(&raw) {
        Ok(v) => v,
        Err(e) => {
            println!("DECOMPRESS ERROR: {e}");
            return;
        }
    };
    println!("decompressed bytes: {}", blob.len());

    let arrays = find_all(&blob, b"Local_CustomMarkerSaveData");
    let locations = find_all(&blob, b"IconLocation");
    let vectors = find_all(&blob, b"Vector");
    let icon_types = find_all(&blob, b"IconType");

    println!("Local_CustomMarkerSaveData occurrences: {} {:?}", arrays.len(), arrays.iter().take(4).collect::<Vec<_>>());
    println!("IconLocation occurrences: {} {:?}", locations.len(), locations.iter().take(8).collect::<Vec<_>>());
    println!("Vector occurrences: {}", vectors.len());
    println!("IconType occurrences: {} {:?}", icon_types.len(), icon_types.iter().take(8).collect::<Vec<_>>());

    match pal_save::read_local_data(&blob) {
        Ok(data) => {
            println!("ATLAS parser: fog layers={} markers={}", data.layers.len(), data.markers.len());
            for (i, m) in data.markers.iter().take(8).enumerate() {
                println!("  marker[{i}] x={} y={} icon={}", m.x, m.y, m.icon_type);
            }
        }
        Err(e) => println!("ATLAS parse error: {e}"),
    }

    if let Some(&array_at) = arrays.first() {
        println!("candidate vectors after marker array:");
        for &loc in locations.iter().filter(|&&p| p > array_at).take(8) {
            let vec_at = find_all(&blob[loc..], b"Vector").into_iter().next().map(|p| p + loc);
            let Some(vec_at) = vec_at else { continue };
            let distance = vec_at.saturating_sub(loc);
            let xyz_at = vec_at + b"Vector".len() + 1 + 17;
            let x = read_f64(&blob, xyz_at);
            let y = read_f64(&blob, xyz_at + 8);
            println!("  IconLocation@{loc} Vector@{vec_at} distance={distance} xyz@{xyz_at} x={x:?} y={y:?}");
        }
    }
}

fn main() {
    let args: Vec<_> = std::env::args_os().skip(1).collect();
    if args.is_empty() {
        eprintln!("usage: inspect-localdata <LocalData.sav> [more LocalData.sav files...]");
        std::process::exit(2);
    }
    for arg in args {
        inspect(Path::new(&arg));
    }
}
