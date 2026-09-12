from pathlib import Path

path = Path('crates/pal-save/src/localdata.rs')
text = path.read_text(encoding='utf-8')

old = '''            return parse_local_save_data(&mut r);'''
new = '''            let mut data = parse_local_save_data(&mut r)?;
            // Current Palworld builds can serialize the custom-marker struct array
            // in a shape the general GVAS array decoder does not materialize even
            // though the rest of LocalData (notably fog) parses correctly. Keep the
            // normal decoder, but prefer a narrow signature scan when it recovers
            // markers from the same decompressed blob.
            let scanned_markers = scan_custom_markers(blob);
            if !scanned_markers.is_empty() {
                data.markers = scanned_markers;
            }
            return Ok(data);'''
if old not in text:
    raise SystemExit('read_local_data return site not found')
text = text.replace(old, new, 1)

anchor = '''fn custom_marker(props: &[(String, Value)]) -> Option<CustomMarker> {
    let (x, y, _z) = gvas::find(props, "IconLocation").and_then(Value::as_vec3)?;
    let icon_type = gvas::find(props, "IconType")
        .and_then(Value::as_i32)
        .unwrap_or(0);
    Some(CustomMarker { x, y, icon_type })
}
'''
insert = anchor + r'''

/// Recover player-placed pins directly from the decompressed LocalData blob.
///
/// `Local_CustomMarkerSaveData` is an ArrayProperty of
/// `PalCustomMarkerSaveData { IconLocation: Vector, IconType: IntProperty }`.
/// Recent game builds can expose a struct-array shape that the generic GVAS
/// materializer skips, while the surrounding LocalData still parses cleanly.
/// Searching only inside the marker region keeps this fallback deliberately
/// narrow and fail-soft instead of making the whole save parser depend on every
/// LocalData property variant.
fn scan_custom_markers(blob: &[u8]) -> Vec<CustomMarker> {
    const ARRAY_NAME: &[u8] = b"Local_CustomMarkerSaveData";
    const LOCATION_NAME: &[u8] = b"IconLocation";
    const VECTOR_NAME: &[u8] = b"Vector";
    const ICON_TYPE_NAME: &[u8] = b"IconType";
    const INT_PROPERTY: &[u8] = b"IntProperty";
    const WORLD_LIMIT: f64 = 2_000_000.0;

    let Some(array_start) = find_bytes(blob, ARRAY_NAME, 0) else {
        return Vec::new();
    };

    let mut markers = Vec::new();
    let mut cursor = array_start + ARRAY_NAME.len();

    loop {
        let Some(location_at) = find_bytes(blob, LOCATION_NAME, cursor) else {
            break;
        };
        let Some(vector_at) = find_bytes(blob, VECTOR_NAME, location_at + LOCATION_NAME.len()) else {
            break;
        };

        // `Vector` is the StructProperty subtype immediately following
        // `IconLocation`. If it is not nearby, we have left the marker array.
        if vector_at.saturating_sub(location_at) > 90 {
            break;
        }

        // After the Vector FString's trailing NUL: 16-byte struct GUID +
        // 1-byte optional-GUID flag, then three little-endian f64 values.
        let xyz_at = vector_at + VECTOR_NAME.len() + 1 + 17;
        let Some(x) = read_f64_le(blob, xyz_at) else { break };
        let Some(y) = read_f64_le(blob, xyz_at + 8) else { break };
        let Some(_z) = read_f64_le(blob, xyz_at + 16) else { break };

        if !x.is_finite()
            || !y.is_finite()
            || x.abs() >= WORLD_LIMIT
            || y.abs() >= WORLD_LIMIT
        {
            cursor = vector_at + VECTOR_NAME.len();
            continue;
        }

        let icon_type = scan_icon_type(blob, xyz_at + 24).unwrap_or(0);
        markers.push(CustomMarker { x, y, icon_type });
        cursor = vector_at + VECTOR_NAME.len();
    }

    markers
}

fn scan_icon_type(blob: &[u8], start: usize) -> Option<i32> {
    const ICON_TYPE_NAME: &[u8] = b"IconType";
    const INT_PROPERTY: &[u8] = b"IntProperty";

    let icon_at = find_bytes(blob, ICON_TYPE_NAME, start)?;
    if icon_at.saturating_sub(start) > 160 {
        return None;
    }
    let int_at = find_bytes(blob, INT_PROPERTY, icon_at + ICON_TYPE_NAME.len())?;
    if int_at.saturating_sub(icon_at) > 80 {
        return None;
    }

    // After IntProperty's trailing NUL: u64 payload size + optional-GUID flag,
    // then the little-endian i32 value.
    let value_at = int_at + INT_PROPERTY.len() + 1 + 8 + 1;
    read_i32_le(blob, value_at)
}

fn find_bytes(haystack: &[u8], needle: &[u8], start: usize) -> Option<usize> {
    if needle.is_empty() || start >= haystack.len() {
        return None;
    }
    haystack[start..]
        .windows(needle.len())
        .position(|w| w == needle)
        .map(|offset| start + offset)
}

fn read_f64_le(bytes: &[u8], at: usize) -> Option<f64> {
    let raw: [u8; 8] = bytes.get(at..at + 8)?.try_into().ok()?;
    Some(f64::from_le_bytes(raw))
}

fn read_i32_le(bytes: &[u8], at: usize) -> Option<i32> {
    let raw: [u8; 4] = bytes.get(at..at + 4)?.try_into().ok()?;
    Some(i32::from_le_bytes(raw))
}
'''
if anchor not in text:
    raise SystemExit('custom_marker anchor not found')
text = text.replace(anchor, insert, 1)

# Add focused synthetic regression just before the existing fixture fog tests.
test_anchor = '''    #[test]
    fn coop_localdata_fog_dimensions_and_reveal() {'''
test = r'''    #[test]
    fn targeted_custom_marker_scan_recovers_vector_and_icon_type() {
        let mut blob = Vec::new();
        blob.extend_from_slice(b"header Local_CustomMarkerSaveData\0 padding ");
        blob.extend_from_slice(b"IconLocation\0 StructProperty\0 Vector\0");
        blob.extend_from_slice(&[0u8; 17]);
        blob.extend_from_slice(&12345.5f64.to_le_bytes());
        blob.extend_from_slice(&(-67890.25f64).to_le_bytes());
        blob.extend_from_slice(&321.0f64.to_le_bytes());
        blob.extend_from_slice(b" IconType\0 IntProperty\0");
        blob.extend_from_slice(&4u64.to_le_bytes());
        blob.push(0);
        blob.extend_from_slice(&7i32.to_le_bytes());

        let markers = scan_custom_markers(&blob);
        assert_eq!(markers.len(), 1);
        assert!((markers[0].x - 12345.5).abs() < f64::EPSILON);
        assert!((markers[0].y + 67890.25).abs() < f64::EPSILON);
        assert_eq!(markers[0].icon_type, 7);
    }

    #[test]
    fn coop_localdata_fog_dimensions_and_reveal() {'''
if test_anchor not in text:
    raise SystemExit('test anchor not found')
text = text.replace(test_anchor, test, 1)

path.write_text(text, encoding='utf-8')

changelog = Path('CHANGELOG.md')
cl = changelog.read_text(encoding='utf-8')
needle = '- Added a per-save LocalData override in the Map filter so users can manually select/clear the client map-data file when automatic world-folder matching is ambiguous or unavailable.\n'
addition = needle + '- Hardened custom map-marker decoding with a targeted LocalData marker scan for current Palworld saves where fog parses but the generic GVAS struct-array decoder yields zero pins.\n'
if needle not in cl:
    raise SystemExit('changelog anchor not found')
changelog.write_text(cl.replace(needle, addition, 1), encoding='utf-8')

print('Applied targeted custom-marker scan fallback.')
