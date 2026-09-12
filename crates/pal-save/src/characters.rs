//! Extraction of `pal_data::OwnedPal`s (and player identities) from a decoded
//! `Level.sav`, plus the small amount of a player save we need to classify
//! containers. Field layout follows cheahjs/palworld-save-tools
//! `rawdata/character.py`: each `CharacterSaveParameterMap` value's `RawData`
//! is `SaveParameter` properties, then 4 unknown bytes, then a group-id guid.

use std::collections::{BTreeMap, BTreeSet, HashMap, HashSet};

use pal_data::types::{ContainerKind, Gender, Guid, IvSet, OwnedPal};
use pal_data::GameData;

use crate::archive::Reader;
use crate::gvas::{self, find, GvasHeader, Value};
use crate::{PalCaptureCount, SaveError};

/// A player identity discovered in the level save.
#[derive(Debug, Clone)]
pub struct PlayerEntry {
    pub uid: Guid,
    pub name: String,
}

/// Result of parsing a `Level.sav`. `base_containers` are the pal-container
/// guids owned by base camps (from `BaseCampSaveData`), used to classify base
/// worker pals; `base_id_to_container` maps each base-camp id to that container
/// so guild `base_ids` can be resolved to physical containers. `guilds` carries
/// the raw guild ownership records (member resolution against the player set is
/// deferred to the caller, which has the full player list).
#[derive(Debug, Default)]
pub struct LevelParse {
    pub pals: Vec<OwnedPal>,
    pub players: Vec<PlayerEntry>,
    pub base_containers: HashSet<Guid>,
    pub base_id_to_container: HashMap<Guid, Guid>,
    pub cage_containers: HashSet<Guid>,
    pub global_containers: HashSet<Guid>,
    pub guilds: Vec<GuildRaw>,
}

/// A guild (`EPalGroupType::Guild`/`IndependentGuild`) parsed from
/// `GroupSaveDataMap`. `member_candidates` are the distinct non-zero guids
/// found in the player-list region of the raw record; the caller intersects
/// them with the known player uids to get true members.
#[derive(Debug, Clone, PartialEq)]
pub struct GuildMarkerRaw {
    pub marker_id: Guid,
    pub x: f64,
    pub y: f64,
    pub z: f64,
    pub icon_type: i32,
    pub owner_player_uid: Guid,
}

#[derive(Debug, Clone, Default)]
pub struct GuildRaw {
    pub guild_id: Guid,
    pub guild_name: String,
    pub base_ids: Vec<Guid>,
    pub member_candidates: Vec<Guid>,
    pub markers: Vec<GuildMarkerRaw>,
}

/// Container ids extracted from a single player save, used to classify where a
/// pal physically lives.
#[derive(Debug, Default)]
pub struct PlayerContainers {
    pub player_uid: Option<Guid>,
    /// `OtomoCharacterContainerId` — the active party.
    pub party: Option<Guid>,
    /// `PalStorageContainerId` — the palbox.
    pub palbox: Option<Guid>,
    /// `RecordData.PalCaptureCount` keyed by normalized base species id.
    pub pal_capture_counts: Vec<PalCaptureCount>,
    /// `RecordData.PaldeckUnlockFlag` true keys, normalized to base species id.
    pub paldeck_unlocked: Vec<String>,
}

enum Entry {
    Pal(Box<OwnedPal>),
    Player(PlayerEntry),
    /// A parsed-but-empty entry (e.g. a player with no nickname yet); ignored.
    None,
}

/// Parse `Level.sav`, extracting pals and player identities. Structural parsing
/// of the map is strict; per-entity *interpretation* failures are collected as
/// warnings and skipped (fail-soft).
pub fn parse_level(blob: &[u8], warnings: &mut Vec<String>) -> Result<LevelParse, SaveError> {
    let mut r = Reader::new(blob);
    GvasHeader::read(&mut r)?;

    // Top level holds a single `worldSaveData` StructProperty.
    while let Some((name, type_name, size)) = gvas::read_tag(&mut r)? {
        if name == "worldSaveData" && type_name == "StructProperty" {
            r.fstring()?; // struct_type
            r.skip(16)?; // struct_id
            r.optional_guid()?;
            return parse_world_save_data(&mut r, warnings);
        }
        gvas::skip_property(&mut r, &type_name, size)?;
    }
    Err(SaveError::Gvas(
        "worldSaveData not found in level save".into(),
    ))
}

fn parse_world_save_data(
    r: &mut Reader,
    warnings: &mut Vec<String>,
) -> Result<LevelParse, SaveError> {
    let mut out = LevelParse::default();
    while let Some((name, type_name, size)) = gvas::read_tag(r)? {
        if name == "CharacterSaveParameterMap" && type_name == "MapProperty" {
            parse_character_map(r, &mut out, warnings)?;
        } else if name == "BaseCampSaveData" && type_name == "MapProperty" {
            // Base-camp worker containers + base_id -> container map. Parsed in
            // an isolated sub-reader bounded by `size`, so any malformed base
            // data warns and skips without desyncing the outer cursor.
            match base_camp_map(r, size) {
                Ok(map) => {
                    out.base_containers.extend(map.values().copied());
                    out.base_id_to_container.extend(map);
                }
                Err(e) => warnings.push(format!("BaseCampSaveData: {e}")),
            }
        } else if name == "GroupSaveDataMap" && type_name == "MapProperty" {
            // Guild ownership (guild id/name, base ids, members). Isolated
            // sub-reader bounded by `size`; malformed guild data is fail-soft.
            match parse_group_map(r, size) {
                Ok(guilds) => out.guilds = guilds,
                Err(e) => warnings.push(format!("GroupSaveDataMap: {e}")),
            }
        } else if name == "MapObjectSaveData" && type_name == "ArrayProperty" {
            // Storage-machine containers: `DisplayCharacter` (viewing cage) and
            // `GlobalPalStorage` (global pal storage) map objects each carry a
            // `::CharacterContainer` module whose RawData leads with the
            // machine's pal-container guid (palcalc `MapObjectVisitor` lineage).
            // Isolated decode from a copy; malformed data is fail-soft.
            match storage_containers_from_map_objects(r, size) {
                Ok((cages, global)) => {
                    out.cage_containers = cages;
                    out.global_containers = global;
                }
                Err(e) => warnings.push(format!("MapObjectSaveData: {e}")),
            }
        } else {
            gvas::skip_property(r, &type_name, size)?;
        }
    }
    Ok(out)
}

fn parse_character_map(
    r: &mut Reader,
    out: &mut LevelParse,
    warnings: &mut Vec<String>,
) -> Result<(), SaveError> {
    let _key_type = r.fstring()?; // StructProperty
    let _value_type = r.fstring()?; // StructProperty
    r.optional_guid()?;
    r.u32()?; // padding (always 0)
    let count = r.u32()?;

    for i in 0..count {
        // Map key/value are bare struct bodies (properties-until-end); the
        // struct type comes from the map, not an inline tag.
        let key = gvas::read_properties_until_end(r)?;
        let value = gvas::read_properties_until_end(r)?;
        match extract_entry(&key, &value) {
            Ok(Entry::Pal(p)) => out.pals.push(*p),
            Ok(Entry::Player(pl)) => out.players.push(pl),
            Ok(Entry::None) => {}
            Err(e) => warnings.push(format!("character entry #{i}: {e}")),
        }
    }
    Ok(())
}

fn key_guid(key: &[(String, Value)], name: &str) -> Option<Guid> {
    find(key, name).and_then(Value::as_guid)
}

/// Decode a single `CharacterSaveParameterMap` entry. The value's `RawData`
/// bytes are decoded in an isolated reader, so a malformed entity cannot
/// desync the outer map cursor.
fn extract_entry(key: &[(String, Value)], value: &[(String, Value)]) -> Result<Entry, SaveError> {
    let raw = find(value, "RawData")
        .and_then(Value::as_bytes)
        .ok_or_else(|| SaveError::Gvas("entry missing RawData".into()))?;

    let mut cr = Reader::new(raw);
    let object = gvas::read_properties_until_end(&mut cr)?;
    let param = find(&object, "SaveParameter")
        .and_then(Value::as_props)
        .ok_or_else(|| SaveError::Gvas("RawData missing SaveParameter".into()))?;

    let instance_id = key_guid(key, "InstanceId").unwrap_or_default();

    // Player character entries carry the player's identity + nickname.
    if find(param, "IsPlayer")
        .and_then(Value::as_bool)
        .unwrap_or(false)
    {
        let uid = key_guid(key, "PlayerUId")
            .or_else(|| find(param, "OwnerPlayerUId").and_then(Value::as_guid))
            .unwrap_or_default();
        let name = find(param, "NickName")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string();
        if name.is_empty() && uid == Guid::default() {
            return Ok(Entry::None);
        }
        return Ok(Entry::Player(PlayerEntry { uid, name }));
    }

    Ok(Entry::Pal(Box::new(build_pal(param, instance_id)?)))
}

/// Build an [`OwnedPal`] from a decoded `SaveParameter` property set. Shared by
/// the `Level.sav` character map and the dimensional-storage array. The
/// resulting `container_kind` is always [`ContainerKind::Unknown`]; callers
/// classify it afterward.
fn build_pal(param: &[(String, Value)], instance_id: Guid) -> Result<OwnedPal, SaveError> {
    let raw_char_id = find(param, "CharacterID")
        .and_then(Value::as_str)
        .ok_or_else(|| SaveError::Gvas("pal missing CharacterID".into()))?;
    let (character_id, is_boss) =
        strip_species_prefix(strip_character_enum_prefix(raw_char_id.trim()));

    let gender = find(param, "Gender")
        .and_then(Value::as_str)
        .map(parse_gender);

    // Palworld omits default-valued properties; a missing Level means 1.
    let level = find(param, "Level")
        .and_then(Value::as_i32)
        .unwrap_or(1)
        .max(0) as u32;
    // Palworld's `Rank` is 1-based condensation (absent/0/1 = base 0 stars,
    // 2 = 1 star, ... 5 = 4 stars). Normalize to 0-based stars here so every
    // downstream `values_per_rank` vector indexes directly; absent and Rank<=1
    // both collapse to 0.
    let rank = find(param, "Rank")
        .and_then(Value::as_i32)
        .map(|r| (r - 1).max(0))
        .unwrap_or(0) as u32;
    // Lucky/bred-alpha instance flag; omitted (default false) for normal pals.
    let is_lucky = find(param, "IsRarePal")
        .and_then(Value::as_bool)
        .unwrap_or(false);

    let ivs = IvSet {
        hp: talent(param, "Talent_HP"),
        // Talent_Shot is the attack IV; tolerate the older Talent_Melee name.
        attack: find(param, "Talent_Shot")
            .or_else(|| find(param, "Talent_Melee"))
            .and_then(Value::as_i32)
            .map(clamp_iv)
            .unwrap_or(0),
        defense: talent(param, "Talent_Defense"),
    };

    let passives = find(param, "PassiveSkillList")
        .and_then(Value::as_array)
        .map(|a| {
            a.iter()
                .filter_map(|v| v.as_str().map(str::to_string))
                .collect()
        })
        .unwrap_or_default();

    // Equipped active skills. cheahjs rawdata/character.py exposes `EquipWaza`
    // (equipped) and `MasteredWaza` (learned); we surface only the equipped
    // set. Values are `EPalWazaID::*` enum labels; strip the prefix for display.
    let active_skills = find(param, "EquipWaza")
        .and_then(Value::as_array)
        .map(|a| {
            a.iter()
                .filter_map(Value::as_str)
                .filter(|s| !s.is_empty() && *s != "None")
                .map(strip_waza_prefix)
                .collect()
        })
        .unwrap_or_default();

    let nickname = find(param, "NickName")
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty())
        .map(str::to_string);

    let owner_player_uid = find(param, "OwnerPlayerUId").and_then(Value::as_guid);
    let (container_id, slot_index) = slot_id(param);

    // Human NPC detection (data-driven). Palworld stores catchable humans
    // (merchants, hunters, villagers — e.g. `SalesPerson`, `Hunter_Rifle`,
    // `Male_People03`) in the same `CharacterSaveParameterMap` as pals. Rule:
    // an entity is a human iff its species id is absent from the pack AND its
    // record carries no `Gender` property. Evidence from the real test save:
    // all 1627 in-pack pals have a `Gender`; every human NPC has none (their
    // sex is baked into the id). Requiring "absent from pack" as well keeps a
    // genuine pal that is merely missing from the pack (e.g. the `GhostAnglerFish`
    // casing gap) classified as a pal, not a human — such gaps are reported
    // separately rather than mislabeled.
    let species = GameData::get().species_by_id(&character_id);
    let is_human = gender.is_none() && species.is_none();
    // Canonicalize the id to the pack's exact casing when the species resolves
    // (save files carry casing drift, e.g. `GhostAnglerFish` vs pack
    // `GhostAnglerfish`); the frontend's icon/name maps are exact-match.
    let character_id = species.map_or(character_id, |s| s.internal_name.clone());

    Ok(OwnedPal {
        instance_id,
        character_id,
        is_boss,
        is_lucky,
        is_human,
        gender,
        level,
        rank,
        passives,
        active_skills,
        ivs,
        nickname,
        owner_player_uid,
        container_id,
        slot_index,
        container_kind: ContainerKind::Unknown,
    })
}

/// Byte offset of `container_id` inside a `WorkerDirector` `RawData` blob:
/// `id` (Guid, 16) + `spawn_transform` (FTransform = FQuat 32 + 2x FVector 24,
/// = 80) + `current_order_type` (1) + `current_battle_type` (1). Layout per
/// cheahjs/palworld-save-tools `rawdata/worker_director.py`.
const WORKER_DIRECTOR_CONTAINER_OFFSET: usize = 16 + 80 + 1 + 1;

/// Parse the `BaseCampSaveData` map (Guid key + struct value) from an isolated
/// sub-reader bounded by `size`, returning `base_id -> worker pal-container`
/// for every base with a populated container. The outer reader is always
/// advanced past the whole map region, so a malformed base cannot desync the
/// caller (fail-soft).
fn base_camp_map(r: &mut Reader, size: usize) -> Result<HashMap<Guid, Guid>, SaveError> {
    let _key_type = r.fstring()?; // StructProperty
    let _value_type = r.fstring()?; // StructProperty
    r.optional_guid()?;
    // Consume the whole value region up front, then decode from a copy: any
    // decode failure below leaves the outer cursor correctly positioned.
    let body = r.bytes(size)?.to_vec();

    let mut sub = Reader::new(&body);
    sub.u32()?; // padding (always 0)
    let count = sub.u32()?;

    let mut map = HashMap::new();
    for _ in 0..count {
        let base_id = sub.guid()?; // map key is a bare Guid
        let value = gvas::read_properties_until_end(&mut sub)?;
        if let Some(cid) = base_worker_container(&value) {
            map.insert(base_id, cid);
        }
    }
    Ok(map)
}

/// Extract the worker pal-container guid from a single base's value struct.
/// Returns `None` for a base with no populated worker container (all-zero id).
fn base_worker_container(value: &[(String, Value)]) -> Option<Guid> {
    let raw = find(value, "WorkerDirector")
        .and_then(Value::as_props)
        .and_then(|p| find(p, "RawData"))
        .and_then(Value::as_bytes)?;
    let end = WORKER_DIRECTOR_CONTAINER_OFFSET + 16;
    let cid: Guid = raw
        .get(WORKER_DIRECTOR_CONTAINER_OFFSET..end)?
        .try_into()
        .ok()?;
    (cid != Guid::default()).then_some(cid)
}

/// Parse the `GroupSaveDataMap` (Guid key + struct value) from an isolated
/// sub-reader bounded by `size`, returning every guild's ownership record.
/// Non-guild groups (parties, neutral orgs) are ignored. The outer reader is
/// always advanced past the whole map region (fail-soft).
fn parse_group_map(r: &mut Reader, size: usize) -> Result<Vec<GuildRaw>, SaveError> {
    let _key_type = r.fstring()?; // StructProperty
    let _value_type = r.fstring()?; // StructProperty
    r.optional_guid()?;
    let body = r.bytes(size)?.to_vec();

    let mut sub = Reader::new(&body);
    sub.u32()?; // padding (always 0)
    let count = sub.u32()?;

    let mut guilds = Vec::new();
    for _ in 0..count {
        let _key = sub.guid()?; // map key is a bare Guid (== group id)
        let value = gvas::read_properties_until_end(&mut sub)?;
        let gtype = find(&value, "GroupType")
            .and_then(Value::as_str)
            .unwrap_or("");
        if !matches!(
            gtype,
            "EPalGroupType::Guild" | "EPalGroupType::IndependentGuild"
        ) {
            continue;
        }
        let Some(bytes) = find(&value, "RawData").and_then(Value::as_bytes) else {
            continue;
        };
        if let Some(g) = decode_guild(bytes) {
            guilds.push(g);
        }
    }
    Ok(guilds)
}

/// Decode a guild's `RawData` blob. Layout (cheahjs/palworld-save-tools
/// `rawdata/group.py`, current save version):
/// `group_id: Guid` · `group_name: FString` ·
/// `individual_character_handle_ids: TArray<{Guid, Guid}>` (32 B each) ·
/// then the org section `unknown: u32` · `org_type: u8` ·
/// `base_ids: TArray<Guid>` · `unknown2: u32` · then the guild section
/// `base_camp_level: i32` · `map_object_base_camp_points: TArray<Guid>` ·
/// `guild_name: FString`. What follows (`admin_player_uid` + a version-rich
/// player list carrying nested status arrays) is NOT stably shaped across
/// versions, so members are recovered by scanning that trailing region for
/// guids: the caller intersects the candidates with the known player uids.
/// Returns `None` if the fixed prefix cannot be decoded (fail-soft).
fn decode_guild(bytes: &[u8]) -> Option<GuildRaw> {
    let mut br = Reader::new(bytes);
    let guild_id = br.guid().ok()?;
    let _group_name = br.fstring().ok()?;
    let handle_count = br.u32().ok()?;
    br.skip(handle_count as usize * 32).ok()?;
    let _org_type = br.u8().ok()?;
    br.skip(4).ok()?;
    let base_count = br.u32().ok()?;
    let mut base_ids = Vec::with_capacity(base_count as usize);
    for _ in 0..base_count {
        base_ids.push(br.guid().ok()?);
    }
    let _unknown1 = br.i32().ok()?;
    let _base_camp_level = br.i32().ok()?;
    let point_count = br.u32().ok()?;
    br.skip(point_count as usize * 16).ok()?;
    let guild_name = br.fstring().ok().unwrap_or_default();
    let rest = &bytes[br.pos().min(bytes.len())..];
    let markers = decode_guild_markers(rest).unwrap_or_default();

    let mut member_candidates = Vec::new();
    let mut i = 0;
    while i + 16 <= rest.len() {
        let w: Guid = rest[i..i + 16].try_into().ok()?;
        if w != Guid::default() && !member_candidates.contains(&w) {
            member_candidates.push(w);
        }
        i += 1;
    }
    Some(GuildRaw {
        guild_id,
        guild_name,
        base_ids,
        member_candidates,
        markers,
    })
}

fn decode_guild_markers(rest: &[u8]) -> Option<Vec<GuildMarkerRaw>> {
    const MARKER_BYTES: usize = 60;
    const MAX_MARKERS: usize = 1024;
    const WORLD_LIMIT: f64 = 2_000_000.0;
    let mut r = Reader::new(rest);
    let _last_guild_name_modifier_player_uid = r.guid().ok()?;
    let count = r.u32().ok()? as usize;
    if count > MAX_MARKERS || count.checked_mul(MARKER_BYTES)? > r.remaining() {
        return None;
    }
    let mut out = Vec::with_capacity(count);
    for _ in 0..count {
        let marker_id = r.guid().ok()?;
        let x = r.f64().ok()?;
        let y = r.f64().ok()?;
        let z = r.f64().ok()?;
        let icon_type = r.i32().ok()?;
        let owner_player_uid = r.guid().ok()?;
        if !x.is_finite()
            || !y.is_finite()
            || !z.is_finite()
            || x.abs() >= WORLD_LIMIT
            || y.abs() >= WORLD_LIMIT
        {
            return None;
        }
        out.push(GuildMarkerRaw {
            marker_id,
            x,
            y,
            z,
            icon_type,
            owner_player_uid,
        });
    }
    Some(out)
}

fn talent(param: &[(String, Value)], name: &str) -> u8 {
    find(param, name)
        .and_then(Value::as_i32)
        .map(clamp_iv)
        .unwrap_or(0)
}

fn clamp_iv(v: i32) -> u8 {
    v.clamp(0, 100) as u8
}

/// Strip a boss/predator/gym prefix from a raw `CharacterID`, returning the
/// bare species id and whether it is an alpha/boss variant. Matching is
/// case-insensitive on the prefix token: the real save uses both `BOSS_`
/// (tower/alpha, e.g. `BOSS_Anubis`) and title-case `Boss_` (field bosses,
/// e.g. `Boss_IceFox`, `Boss_LavaGirl`); both strip to the base species and
/// set the boss flag, so the field-boss variants resolve against the pack
/// instead of rendering as unknown. Only the boss prefixes set `is_boss`.
fn strip_species_prefix(id: &str) -> (String, bool) {
    let lower = id.to_ascii_lowercase();
    if lower.starts_with("boss_") {
        return (id["boss_".len()..].to_string(), true);
    }
    for prefix in ["predator_", "gym_"] {
        if lower.starts_with(prefix) {
            return (id[prefix.len()..].to_string(), false);
        }
    }
    (id.to_string(), false)
}

fn strip_character_enum_prefix(id: &str) -> &str {
    for prefix in ["EPalCharacterID::", "EPalID::", "EPalMonsterID::"] {
        if let Some(stripped) = id.strip_prefix(prefix) {
            return stripped;
        }
    }
    id
}

/// Normalize a save-side character id into ATLAS's canonical species key:
/// enum prefix removed, boss/predator/gym wrapper removed, and pack casing
/// restored when the species exists.
pub fn normalize_character_id(id: &str) -> String {
    let raw = strip_character_enum_prefix(id.trim());
    let (base, _) = strip_species_prefix(raw);
    GameData::get()
        .species_by_id(&base)
        .map_or(base, |s| s.internal_name.clone())
}

/// Strip the `EPalWazaID::` enum prefix from an equipped-waza id, leaving the
/// internal skill name (e.g. `EPalWazaID::FireBall` -> `FireBall`). A proper
/// skill-name DB is out of scope; the cleaned id is shown as a chip.
fn strip_waza_prefix(id: &str) -> String {
    id.strip_prefix("EPalWazaID::").unwrap_or(id).to_string()
}

fn parse_gender(s: &str) -> Gender {
    if s.contains("Female") {
        Gender::Female
    } else {
        Gender::Male
    }
}

/// `SlotId` -> (container guid, slot index). The struct nests
/// `ContainerId { ID: Guid }` and a `SlotIndex` int.
fn slot_id(param: &[(String, Value)]) -> (Option<Guid>, Option<u32>) {
    let Some(slot) = find(param, "SlotId").and_then(Value::as_props) else {
        return (None, None);
    };
    let container_id = find(slot, "ContainerId")
        .and_then(Value::as_props)
        .and_then(|p| find(p, "ID"))
        .and_then(Value::as_guid);
    let slot_index = find(slot, "SlotIndex")
        .and_then(Value::as_i32)
        .map(|v| v.max(0) as u32);
    (container_id, slot_index)
}

/// Parse the small slice of a player save we need: its uid + party/palbox
/// container ids.
pub fn parse_player_save(blob: &[u8]) -> Result<PlayerContainers, SaveError> {
    let mut r = Reader::new(blob);
    GvasHeader::read(&mut r)?;
    while let Some((name, type_name, size)) = gvas::read_tag(&mut r)? {
        if name == "SaveData" && type_name == "StructProperty" {
            r.fstring()?;
            r.skip(16)?;
            r.optional_guid()?;
            return parse_player_body(&mut r);
        }
        gvas::skip_property(&mut r, &type_name, size)?;
    }
    Ok(PlayerContainers::default())
}

fn parse_player_body(r: &mut Reader) -> Result<PlayerContainers, SaveError> {
    let mut pc = PlayerContainers::default();
    while let Some((name, type_name, size)) = gvas::read_tag(r)? {
        match name.as_str() {
            "PlayerUId" | "OtomoCharacterContainerId" | "PalStorageContainerId" => {
                let v = gvas::read_property(r, &type_name, size)?;
                match name.as_str() {
                    "PlayerUId" => pc.player_uid = v.as_guid(),
                    "OtomoCharacterContainerId" => pc.party = container_ref(&v),
                    "PalStorageContainerId" => pc.palbox = container_ref(&v),
                    _ => {}
                }
            }
            "RecordData" if type_name == "StructProperty" => {
                let v = gvas::read_property(r, &type_name, size)?;
                if let Some(props) = v.as_props() {
                    fill_player_record(&mut pc, props);
                }
            }
            _ => gvas::skip_property(r, &type_name, size)?,
        }
    }
    Ok(pc)
}

fn fill_player_record(pc: &mut PlayerContainers, props: &[(String, Value)]) {
    pc.pal_capture_counts = pal_capture_counts(props);
    pc.paldeck_unlocked = paldeck_unlocked(props);
}

fn pal_capture_counts(props: &[(String, Value)]) -> Vec<PalCaptureCount> {
    let mut counts = BTreeMap::<String, u32>::new();
    let Some(entries) = find(props, "PalCaptureCount").and_then(Value::as_map) else {
        return Vec::new();
    };
    for (key, value) in entries {
        let Some(species_id) = normalized_record_species(key) else {
            continue;
        };
        let count = value.as_i32().unwrap_or(0);
        if count <= 0 {
            continue;
        }
        counts
            .entry(species_id)
            .and_modify(|current| *current = current.saturating_add(count as u32))
            .or_insert(count as u32);
    }
    counts
        .into_iter()
        .map(|(species_id, count)| PalCaptureCount { species_id, count })
        .collect()
}

fn paldeck_unlocked(props: &[(String, Value)]) -> Vec<String> {
    let mut unlocked = BTreeSet::<String>::new();
    let Some(entries) = find(props, "PaldeckUnlockFlag").and_then(Value::as_map) else {
        return Vec::new();
    };
    for (key, value) in entries {
        if !value.as_bool().unwrap_or(false) {
            continue;
        }
        if let Some(species_id) = normalized_record_species(key) {
            unlocked.insert(species_id);
        }
    }
    unlocked.into_iter().collect()
}

fn normalized_record_species(key: &Value) -> Option<String> {
    let species_id = normalize_character_id(key.as_str()?);
    (!species_id.is_empty() && !species_id.eq_ignore_ascii_case("none")).then_some(species_id)
}

/// A `PalContainerId` struct wraps the container guid in an `ID` field.
fn container_ref(v: &Value) -> Option<Guid> {
    v.as_props()
        .and_then(|p| find(p, "ID"))
        .and_then(Value::as_guid)
        .or_else(|| v.as_guid())
}

/// Collect storage-machine pal-container guids from `MapObjectSaveData`:
/// `DisplayCharacter` (viewing cage) and `GlobalPalStorage` (global pal
/// storage) instances each carry a `ConcreteModel.ModuleMap` with a
/// `::CharacterContainer` module whose `RawData` leads with the container
/// guid — byte layout per the palcalc `MapObjectVisitor` lineage, same
/// raw-guid convention as `Model.RawData` in `map_objects.rs`. The whole
/// value region is consumed up front and decoded from a copy, so a decode
/// failure cannot desync the outer cursor (fail-soft). Returns
/// `(cage_ids, global_ids)`.
fn storage_containers_from_map_objects(
    r: &mut Reader,
    size: usize,
) -> Result<(HashSet<Guid>, HashSet<Guid>), SaveError> {
    let array_type = r.fstring()?;
    r.optional_guid()?;
    let body = r.bytes(size)?.to_vec();
    let mut sub = Reader::new(&body);
    let value = gvas::read_array(&mut sub, &array_type, body.len())?;
    Ok(storage_ids_from_elements(&value))
}

/// Pure extraction over the decoded `MapObjectSaveData` array value.
fn storage_ids_from_elements(value: &Value) -> (HashSet<Guid>, HashSet<Guid>) {
    let mut cages = HashSet::new();
    let mut global = HashSet::new();
    for el in value.as_array().unwrap_or(&[]) {
        let Some(props) = el.as_props() else { continue };
        let bucket = match gvas::find(props, "MapObjectId").and_then(Value::as_str) {
            Some("DisplayCharacter") => &mut cages,
            Some("GlobalPalStorage") => &mut global,
            _ => continue,
        };
        let Some(modules) = gvas::find(props, "ConcreteModel")
            .and_then(Value::as_props)
            .and_then(|c| gvas::find(c, "ModuleMap"))
            .and_then(Value::as_map)
        else {
            continue;
        };
        for (key, module) in modules {
            if !key
                .as_str()
                .is_some_and(|s| s.ends_with("::CharacterContainer"))
            {
                continue;
            }
            if let Some(raw) = module
                .as_props()
                .and_then(|p| gvas::find(p, "RawData"))
                .and_then(Value::as_bytes)
            {
                if raw.len() >= 16 {
                    let mut g: Guid = [0u8; 16];
                    g.copy_from_slice(&raw[..16]);
                    bucket.insert(g);
                }
            }
        }
    }
    (cages, global)
}

/// Best-effort world name from `LevelMeta.sav`. Returns `Ok(None)` when no
/// `WorldName` string is present; parse errors bubble up to the caller, which
/// downgrades them to "no name".
pub fn parse_world_name(blob: &[u8]) -> Result<Option<String>, SaveError> {
    let mut r = Reader::new(blob);
    GvasHeader::read(&mut r)?;
    while let Some((name, type_name, size)) = gvas::read_tag(&mut r)? {
        if type_name == "StrProperty" && name == "WorldName" {
            return Ok(gvas::read_property(&mut r, &type_name, size)?
                .as_str()
                .filter(|s| !s.is_empty())
                .map(str::to_string));
        }
        if name == "SaveData" && type_name == "StructProperty" {
            r.fstring()?;
            r.skip(16)?;
            r.optional_guid()?;
            while let Some((n2, t2, s2)) = gvas::read_tag(&mut r)? {
                if t2 == "StrProperty" && n2 == "WorldName" {
                    return Ok(gvas::read_property(&mut r, &t2, s2)?
                        .as_str()
                        .filter(|s| !s.is_empty())
                        .map(str::to_string));
                }
                gvas::skip_property(&mut r, &t2, s2)?;
            }
            return Ok(None);
        }
        gvas::skip_property(&mut r, &type_name, size)?;
    }
    Ok(None)
}

/// Parse a dimensional pal-storage save (`*_dps.sav`). Its `GVAS` body is a
/// single `SaveParameterArray`, each element a `{ SaveParameter, InstanceId }`
/// struct — the same `SaveParameter` schema as `Level.sav`, but self-contained
/// (these pals do NOT appear in `Level.sav`). Empty slots (no `CharacterID`)
/// are skipped; per-pal decode failures are collected as warnings (fail-soft).
pub fn parse_dimensional_storage(
    blob: &[u8],
    warnings: &mut Vec<String>,
) -> Result<Vec<OwnedPal>, SaveError> {
    let mut r = Reader::new(blob);
    GvasHeader::read(&mut r)?;

    let mut pals = Vec::new();
    while let Some((name, type_name, size)) = gvas::read_tag(&mut r)? {
        if name == "SaveParameterArray" && type_name == "ArrayProperty" {
            let array = gvas::read_property(&mut r, &type_name, size)?;
            let elems = array
                .as_array()
                .ok_or_else(|| SaveError::Gvas("SaveParameterArray not an array".into()))?;
            for (i, elem) in elems.iter().enumerate() {
                match dimensional_pal(elem) {
                    Ok(Some(pal)) => pals.push(pal),
                    Ok(None) => {} // empty slot
                    Err(e) => warnings.push(format!("dimensional pal #{i}: {e}")),
                }
            }
            return Ok(pals);
        }
        gvas::skip_property(&mut r, &type_name, size)?;
    }
    Ok(pals)
}

/// Decode one dimensional-storage element into an [`OwnedPal`] tagged
/// [`ContainerKind::DimensionalPalStorage`]. Returns `Ok(None)` for an empty
/// slot (missing or `None` `CharacterID`).
fn dimensional_pal(elem: &Value) -> Result<Option<OwnedPal>, SaveError> {
    let props = elem
        .as_props()
        .ok_or_else(|| SaveError::Gvas("element not a struct".into()))?;
    let param = find(props, "SaveParameter")
        .and_then(Value::as_props)
        .ok_or_else(|| SaveError::Gvas("element missing SaveParameter".into()))?;

    match find(param, "CharacterID").and_then(Value::as_str) {
        None | Some("") | Some("None") => return Ok(None),
        Some(_) => {}
    }

    let instance_id = find(props, "InstanceId")
        .and_then(Value::as_props)
        .and_then(|p| find(p, "InstanceId"))
        .and_then(Value::as_guid)
        .unwrap_or_default();

    let mut pal = build_pal(param, instance_id)?;
    pal.container_kind = ContainerKind::DimensionalPalStorage;
    Ok(Some(pal))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Synthetic: extraction digs MapObjectId -> ConcreteModel -> ModuleMap ->
    /// ::CharacterContainer module RawData -> leading guid, routing cages and
    /// global-storage machines to their buckets and ignoring other objects.
    #[test]
    fn storage_ids_extracted_from_map_object_module_maps() {
        fn machine(object_id: &str, guid: Guid) -> Value {
            let mut raw = guid.to_vec();
            raw.extend_from_slice(&[0xAA; 8]); // trailing module payload
            Value::Props(vec![
                ("MapObjectId".into(), Value::Str(object_id.into())),
                (
                    "ConcreteModel".into(),
                    Value::Props(vec![(
                        "ModuleMap".into(),
                        Value::Map(vec![(
                            Value::Name(
                                "EPalMapObjectConcreteModelModuleType::CharacterContainer".into(),
                            ),
                            Value::Props(vec![("RawData".into(), Value::Bytes(raw))]),
                        )]),
                    )]),
                ),
            ])
        }
        let cage_guid: Guid = [7u8; 16];
        let global_guid: Guid = [9u8; 16];
        let elements = Value::Array(vec![
            machine("DisplayCharacter", cage_guid),
            machine("GlobalPalStorage", global_guid),
            Value::Props(vec![("MapObjectId".into(), Value::Str("PalBoxV2".into()))]),
        ]);
        let (cages, global) = storage_ids_from_elements(&elements);
        assert_eq!(cages.len(), 1);
        assert!(cages.contains(&cage_guid));
        assert_eq!(global.len(), 1);
        assert!(global.contains(&global_guid));
    }

    /// Condensation `Rank` in the save is 1-based (absent/0/1 = base 0 stars,
    /// 2 = 1 star, ... 5 = 4 stars). `build_pal` normalizes to 0-based stars so
    /// downstream `values_per_rank` vectors index directly.
    #[test]
    fn rank_normalized_to_zero_based_stars() {
        fn stars(rank: Option<i32>) -> u32 {
            let mut param = vec![("CharacterID".to_string(), Value::Str("SheepBall".into()))];
            if let Some(r) = rank {
                param.push(("Rank".to_string(), Value::Int(r)));
            }
            build_pal(&param, Guid::default()).unwrap().rank
        }
        assert_eq!(stars(None), 0, "absent Rank -> 0 stars");
        assert_eq!(stars(Some(0)), 0, "Rank 0 -> 0 stars");
        assert_eq!(stars(Some(1)), 0, "Rank 1 -> 0 stars");
        assert_eq!(stars(Some(2)), 1, "Rank 2 -> 1 star");
        assert_eq!(stars(Some(5)), 4, "Rank 5 -> 4 stars");
    }

    fn record_map_int(entries: &[(&str, i32)]) -> Value {
        Value::Map(
            entries
                .iter()
                .map(|(key, value)| (Value::Name((*key).to_string()), Value::Int(*value)))
                .collect(),
        )
    }

    fn record_map_bool(entries: &[(&str, bool)]) -> Value {
        Value::Map(
            entries
                .iter()
                .map(|(key, value)| (Value::Name((*key).to_string()), Value::Bool(*value)))
                .collect(),
        )
    }

    #[test]
    fn pal_capture_count_normalizes_and_sums_positive_species() {
        let props = vec![(
            "PalCaptureCount".to_string(),
            record_map_int(&[
                ("BOSS_GhostAnglerFish", 2),
                ("EPalCharacterID::GhostAnglerfish", 3),
                ("Predator_Penguin", 1),
                ("PinkCat", 0),
                ("None", 9),
            ]),
        )];

        assert_eq!(
            pal_capture_counts(&props),
            vec![
                PalCaptureCount {
                    species_id: "GhostAnglerfish".to_string(),
                    count: 5,
                },
                PalCaptureCount {
                    species_id: "Penguin".to_string(),
                    count: 1,
                },
            ]
        );
    }

    #[test]
    fn paldeck_unlock_flag_normalizes_true_species() {
        let props = vec![(
            "PaldeckUnlockFlag".to_string(),
            record_map_bool(&[
                ("EPalCharacterID::GhostAnglerFish", true),
                ("Gym_PinkCat", true),
                ("SheepBall", false),
                ("None", true),
            ]),
        )];

        assert_eq!(
            paldeck_unlocked(&props),
            vec!["GhostAnglerfish".to_string(), "PinkCat".to_string()]
        );
    }

    #[test]
    fn palworld_1_0_guild_markers_decode_from_group_tail() {
        fn fs(out: &mut Vec<u8>, v: &str) {
            out.extend_from_slice(&((v.len() + 1) as i32).to_le_bytes());
            out.extend_from_slice(v.as_bytes());
            out.push(0);
        }
        let gid: Guid = [1; 16];
        let mid: Guid = [3; 16];
        let owner: Guid = [7; 16];
        let mut raw = Vec::new();
        raw.extend_from_slice(&gid);
        fs(&mut raw, "group");
        raw.extend_from_slice(&0u32.to_le_bytes());
        raw.push(0);
        raw.extend_from_slice(&[0; 4]);
        raw.extend_from_slice(&0u32.to_le_bytes());
        raw.extend_from_slice(&0i32.to_le_bytes());
        raw.extend_from_slice(&20i32.to_le_bytes());
        raw.extend_from_slice(&0u32.to_le_bytes());
        fs(&mut raw, "Smitty Guild");
        raw.extend_from_slice(&[5; 16]);
        raw.extend_from_slice(&1u32.to_le_bytes());
        raw.extend_from_slice(&mid);
        raw.extend_from_slice(&1234.5f64.to_le_bytes());
        raw.extend_from_slice(&(-6789.25f64).to_le_bytes());
        raw.extend_from_slice(&42f64.to_le_bytes());
        raw.extend_from_slice(&3i32.to_le_bytes());
        raw.extend_from_slice(&owner);
        let g = decode_guild(&raw).expect("guild");
        assert_eq!(g.guild_id, gid);
        assert_eq!(g.guild_name, "Smitty Guild");
        assert_eq!(g.markers.len(), 1);
        assert_eq!(g.markers[0].marker_id, mid);
        assert_eq!(g.markers[0].x, 1234.5);
        assert_eq!(g.markers[0].y, -6789.25);
        assert_eq!(g.markers[0].icon_type, 3);
        assert_eq!(g.markers[0].owner_player_uid, owner);
    }
}
