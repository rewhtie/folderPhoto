use std::{collections::HashMap, fs, path::Path};

const MAGIC: u32 = 0x0756_4429;
const HEADER_SIZE: usize = 16;
const APP_METADATA_SIZE: usize = 60;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct AppInfoEntry {
    pub name: String,
    pub app_type: String,
}

fn read_u32(bytes: &[u8], offset: usize) -> Option<u32> {
    let value = bytes.get(offset..offset.checked_add(4)?)?;
    Some(u32::from_le_bytes(value.try_into().ok()?))
}

fn read_i32(bytes: &[u8], offset: usize) -> Option<i32> {
    read_u32(bytes, offset).map(|value| value as i32)
}

fn read_u64(bytes: &[u8], offset: usize) -> Option<u64> {
    let value = bytes.get(offset..offset.checked_add(8)?)?;
    Some(u64::from_le_bytes(value.try_into().ok()?))
}

fn read_c_string(bytes: &[u8], offset: &mut usize, end: usize) -> Option<String> {
    if *offset >= end || end > bytes.len() {
        return None;
    }
    let start = *offset;
    while *offset < end && bytes[*offset] != 0 {
        *offset += 1;
    }
    if *offset >= end {
        return None;
    }
    let value = String::from_utf8_lossy(&bytes[start..*offset]).into_owned();
    *offset += 1;
    Some(value)
}

fn read_string_table(bytes: &[u8], offset: usize) -> Option<Vec<String>> {
    let count = read_i32(bytes, offset)?;
    if count < 0 {
        return None;
    }

    let string_bytes_start = offset.checked_add(4)?;
    let count = count as usize;
    if count > bytes.len().saturating_sub(string_bytes_start) {
        return None;
    }

    let mut cursor = string_bytes_start;
    let mut strings = Vec::with_capacity(count);
    for _ in 0..count {
        strings.push(read_c_string(bytes, &mut cursor, bytes.len())?);
    }
    Some(strings)
}

fn extract_common_fields(
    bytes: &[u8],
    start: usize,
    end: usize,
    strings: &[String],
) -> Option<AppInfoEntry> {
    fn walk(
        bytes: &[u8],
        cursor: &mut usize,
        end: usize,
        strings: &[String],
        parent_key: Option<&str>,
        name: &mut String,
        localized_name: &mut String,
        app_type: &mut String,
    ) -> Option<()> {
        while *cursor < end {
            let value_type = *bytes.get(*cursor)?;
            *cursor += 1;
            if value_type == 0x08 {
                return Some(());
            }

            let key_end = (*cursor).checked_add(4)?;
            if key_end > end {
                return None;
            }
            let key_index = read_i32(bytes, *cursor)?;
            *cursor = key_end;
            if key_index < 0 {
                return None;
            }
            let key = strings
                .get(key_index as usize)
                .map(String::as_str)
                .unwrap_or("");

            match value_type {
                0x00 => walk(
                    bytes,
                    cursor,
                    end,
                    strings,
                    Some(key),
                    name,
                    localized_name,
                    app_type,
                )?,
                0x01 => {
                    let value = read_c_string(bytes, cursor, end)?;
                    if parent_key == Some("common") {
                        if key == "name" {
                            *name = value;
                        } else if key == "type" {
                            *app_type = value;
                        }
                    } else if parent_key == Some("name_localized") && key == "schinese" {
                        *localized_name = value;
                    }
                }
                0x02 => {
                    let next = (*cursor).checked_add(4)?;
                    if next > end {
                        return None;
                    }
                    *cursor = next;
                }
                0x07 => {
                    let next = (*cursor).checked_add(8)?;
                    if next > end {
                        return None;
                    }
                    *cursor = next;
                }
                _ => return None,
            }
        }
        Some(())
    }

    if start > end || end > bytes.len() {
        return None;
    }
    let mut cursor = start;
    let mut name = String::new();
    let mut localized_name = String::new();
    let mut app_type = String::new();
    walk(
        bytes,
        &mut cursor,
        end,
        strings,
        None,
        &mut name,
        &mut localized_name,
        &mut app_type,
    )?;

    let final_name = if localized_name.is_empty() {
        name
    } else {
        localized_name
    };
    Some(AppInfoEntry {
        name: final_name,
        app_type,
    })
}

pub fn parse_app_info(bytes: &[u8]) -> HashMap<String, AppInfoEntry> {
    if bytes.len() < HEADER_SIZE || read_u32(bytes, 0) != Some(MAGIC) {
        return HashMap::new();
    }

    let Some(string_table_offset) =
        read_u64(bytes, 8).and_then(|value| usize::try_from(value).ok())
    else {
        return HashMap::new();
    };
    if string_table_offset <= HEADER_SIZE || string_table_offset >= bytes.len() {
        return HashMap::new();
    }
    let Some(strings) = read_string_table(bytes, string_table_offset) else {
        return HashMap::new();
    };

    let mut entries = HashMap::new();
    let mut offset = HEADER_SIZE;
    while offset
        .checked_add(8)
        .is_some_and(|end| end <= string_table_offset)
    {
        let Some(app_id) = read_u32(bytes, offset) else {
            break;
        };
        offset += 4;
        if app_id == 0 {
            break;
        }
        let Some(size) = read_u32(bytes, offset).map(|value| value as usize) else {
            break;
        };
        offset += 4;
        let Some(block_end) = offset.checked_add(size) else {
            break;
        };
        if block_end > string_table_offset {
            break;
        }

        if let Some(data_start) = offset.checked_add(APP_METADATA_SIZE) {
            if let Some(info) = extract_common_fields(bytes, data_start, block_end, &strings) {
                if !info.name.is_empty() {
                    entries.insert(app_id.to_string(), info);
                }
            }
        }
        offset = block_end;
    }
    entries
}

pub fn load_app_info_entries(librarycache_dir: &Path) -> HashMap<String, AppInfoEntry> {
    let Some(appcache_dir) = librarycache_dir.parent() else {
        return HashMap::new();
    };
    fs::read(appcache_dir.join("appinfo.vdf"))
        .map(|bytes| parse_app_info(&bytes))
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn u32_bytes(value: u32) -> Vec<u8> {
        value.to_le_bytes().to_vec()
    }

    fn cstr(value: &str) -> Vec<u8> {
        let mut bytes = value.as_bytes().to_vec();
        bytes.push(0);
        bytes
    }

    fn app_entry(
        strings: &[&str],
        app_id: u32,
        name: &str,
        app_type: &str,
        schinese: Option<&str>,
    ) -> Vec<u8> {
        let index = |value: &str| strings.iter().position(|item| *item == value).unwrap() as u32;
        let mut kv = Vec::new();
        kv.push(0x00);
        kv.extend(u32_bytes(index("appinfo")));
        kv.push(0x00);
        kv.extend(u32_bytes(index("common")));
        kv.push(0x01);
        kv.extend(u32_bytes(index("name")));
        kv.extend(cstr(name));
        kv.push(0x01);
        kv.extend(u32_bytes(index("type")));
        kv.extend(cstr(app_type));
        if let Some(localized) = schinese {
            kv.push(0x00);
            kv.extend(u32_bytes(index("name_localized")));
            kv.push(0x01);
            kv.extend(u32_bytes(index("schinese")));
            kv.extend(cstr(localized));
            kv.push(0x08);
        }
        kv.extend([0x08, 0x08]);

        let mut body = vec![0; APP_METADATA_SIZE];
        body.extend(kv);
        let mut entry = u32_bytes(app_id);
        entry.extend(u32_bytes(body.len() as u32));
        entry.extend(body);
        entry
    }

    fn build_app_info() -> Vec<u8> {
        let strings = [
            "appinfo",
            "appid",
            "common",
            "name",
            "name_localized",
            "schinese",
            "type",
        ];
        let mut bytes = Vec::new();
        bytes.extend(u32_bytes(MAGIC));
        bytes.extend(u32_bytes(1));
        bytes.extend([0; 8]);
        bytes.extend(app_entry(&strings, 10, "Counter-Strike", "Game", None));
        bytes.extend(app_entry(
            &strings,
            1_598_780,
            "Silly Polly Beast",
            "Game",
            Some("傻乎乎的波莉怪兽"),
        ));
        bytes.extend(app_entry(&strings, 1_054_480, "Kombat Pack 1", "DLC", None));
        bytes.extend(u32_bytes(0));
        let table_offset = bytes.len() as u64;
        bytes[8..16].copy_from_slice(&table_offset.to_le_bytes());
        bytes.extend(u32_bytes(strings.len() as u32));
        for value in strings {
            bytes.extend(cstr(value));
        }
        bytes
    }

    #[test]
    fn parses_names_localization_and_dlc_type() {
        let entries = parse_app_info(&build_app_info());
        assert_eq!(entries["10"].name, "Counter-Strike");
        assert_eq!(entries["1598780"].name, "傻乎乎的波莉怪兽");
        assert_eq!(entries["1054480"].app_type, "DLC");
    }

    #[test]
    fn skips_malformed_app_and_keeps_later_records() {
        let strings = [
            "appinfo",
            "appid",
            "common",
            "name",
            "name_localized",
            "schinese",
            "type",
        ];
        let mut bytes = Vec::new();
        bytes.extend(u32_bytes(MAGIC));
        bytes.extend(u32_bytes(1));
        bytes.extend([0; 8]);

        let mut malformed_body = vec![0; APP_METADATA_SIZE];
        malformed_body.push(0xff);
        let mut malformed = u32_bytes(5);
        malformed.extend(u32_bytes(malformed_body.len() as u32));
        malformed.extend(malformed_body);
        bytes.extend(malformed);
        bytes.extend(app_entry(&strings, 10, "Counter-Strike", "Game", None));
        bytes.extend(u32_bytes(0));

        let table_offset = bytes.len() as u64;
        bytes[8..16].copy_from_slice(&table_offset.to_le_bytes());
        bytes.extend(u32_bytes(strings.len() as u32));
        for value in strings {
            bytes.extend(cstr(value));
        }

        let entries = parse_app_info(&bytes);
        assert!(!entries.contains_key("5"));
        assert_eq!(entries["10"].name, "Counter-Strike");
    }

    #[test]
    fn rejects_bad_magic_and_out_of_bounds_table() {
        assert!(parse_app_info(&[0; 32]).is_empty());
        let mut bytes = build_app_info();
        bytes[8..16].copy_from_slice(&u64::MAX.to_le_bytes());
        assert!(parse_app_info(&bytes).is_empty());
    }

    #[test]
    fn truncated_record_does_not_panic() {
        let mut bytes = build_app_info();
        bytes.truncate(40);
        assert!(parse_app_info(&bytes).is_empty());
    }
}
