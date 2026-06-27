use std::io::{BufRead, BufReader, Write as IoWrite};
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::thread;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

// ─── Types ───────────────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone)]
struct FileEntry {
    name: String,
    path: String,
    is_dir: bool,
    size: u64,
    modified: u64,
    tags: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone)]
struct DiskInfo {
    total: u64,
    used: u64,
    available: u64,
}

#[derive(Serialize, Deserialize, Clone)]
struct CronJob {
    id: String,
    schedule: String,
    src: String,
    dst: String,
    mode: String,
    label: String,
}

#[derive(Serialize, Deserialize, Clone)]
struct RsyncEvent {
    line: String,
    is_error: bool,
    done: bool,
    exit_ok: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
struct SshProfile {
    id: String,
    name: String,
    user: String,
    host: String,
    port: u16,
    key_path: String,
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

fn config_dir() -> PathBuf {
    let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".to_string());
    let dir = PathBuf::from(home).join(".config").join("rsyn-os");
    let _ = std::fs::create_dir_all(&dir);
    dir
}

fn profiles_path() -> PathBuf {
    config_dir().join("ssh_profiles.json")
}

fn load_profiles() -> Vec<SshProfile> {
    std::fs::read_to_string(profiles_path())
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn save_profiles(profiles: &[SshProfile]) -> Result<(), String> {
    let json = serde_json::to_string_pretty(profiles).map_err(|e| e.to_string())?;
    std::fs::write(profiles_path(), json).map_err(|e| e.to_string())
}

fn ssh_args(profile: &SshProfile) -> Vec<String> {
    let mut args = vec![
        "-o".to_string(), "StrictHostKeyChecking=no".to_string(),
        "-o".to_string(), "BatchMode=yes".to_string(),
        "-p".to_string(), profile.port.to_string(),
    ];
    if !profile.key_path.is_empty() {
        args.extend(["-i".to_string(), profile.key_path.clone()]);
    }
    args.push(format!("{}@{}", profile.user, profile.host));
    args
}

fn ssh_e_arg(profile: &SshProfile) -> String {
    let mut parts = vec![
        "ssh".to_string(),
        "-o".to_string(), "StrictHostKeyChecking=no".to_string(),
        "-o".to_string(), "BatchMode=yes".to_string(),
        "-p".to_string(), profile.port.to_string(),
    ];
    if !profile.key_path.is_empty() {
        parts.extend(["-i".to_string(), profile.key_path.clone()]);
    }
    parts.join(" ")
}

// ─── xattr helpers ───────────────────────────────────────────────────────────

const TAG_ATTR: &str = "user.truefiles.tags";

fn read_tags(path: &str) -> Vec<String> {
    xattr::get(path, TAG_ATTR)
        .ok()
        .flatten()
        .and_then(|v| String::from_utf8(v).ok())
        .map(|s| s.split(',').filter(|t| !t.trim().is_empty()).map(|t| t.trim().to_lowercase()).collect())
        .unwrap_or_default()
}

fn write_tags(path: &str, tags: &[String]) -> Result<(), String> {
    if tags.is_empty() {
        xattr::remove(path, TAG_ATTR).or_else(|e| {
            // Ignore "attribute not found" error when removing non-existent attr
            if e.kind() == std::io::ErrorKind::NotFound { Ok(()) } else { Err(e) }
        }).map_err(|e| e.to_string())
    } else {
        let value: Vec<String> = tags.iter().map(|t| t.trim().to_lowercase()).collect();
        xattr::set(path, TAG_ATTR, value.join(",").as_bytes()).map_err(|e| e.to_string())
    }
}

// ─── Commands: filesystem ─────────────────────────────────────────────────────

#[tauri::command]
fn get_home_dir() -> String {
    std::env::var("HOME").unwrap_or_else(|_| "/".to_string())
}

#[tauri::command]
fn list_dir(path: String) -> Result<Vec<FileEntry>, String> {
    let entries = std::fs::read_dir(&path).map_err(|e| e.to_string())?;
    let mut files: Vec<FileEntry> = entries.flatten().filter_map(|e| {
        let meta = e.metadata().ok()?;
        let path = e.path();
        let modified = meta.modified().ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_secs()).unwrap_or(0);
        let tags = read_tags(path.to_str().unwrap_or(""));
        Some(FileEntry {
            name: e.file_name().to_string_lossy().to_string(),
            path: path.to_string_lossy().to_string(),
            is_dir: meta.is_dir(),
            size: if meta.is_file() { meta.len() } else { 0 },
            modified,
            tags,
        })
    }).collect();
    files.sort_by(|a, b| match (a.is_dir, b.is_dir) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
    });
    Ok(files)
}

#[tauri::command]
fn get_disk_info(path: String) -> Result<DiskInfo, String> {
    let out = Command::new("df")
        .args(["-B1", "--output=size,used,avail", &path])
        .output().map_err(|e| e.to_string())?;
    let s = String::from_utf8_lossy(&out.stdout);
    let line = s.lines().nth(1).ok_or("no disk info")?;
    let p: Vec<&str> = line.split_whitespace().collect();
    Ok(DiskInfo {
        total:     p.first().and_then(|s| s.parse().ok()).unwrap_or(0),
        used:      p.get(1).and_then(|s| s.parse().ok()).unwrap_or(0),
        available: p.get(2).and_then(|s| s.parse().ok()).unwrap_or(0),
    })
}

// ─── Commands: Tags ──────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone)]
struct TagEntry {
    tag: String,
    count: usize,
}

#[tauri::command]
fn get_file_tags(path: String) -> Vec<String> {
    read_tags(&path)
}

#[tauri::command]
fn set_file_tags(path: String, tags: Vec<String>) -> Result<(), String> {
    write_tags(&path, &tags)
}

#[tauri::command]
fn list_all_tags_in_dir(path: String) -> Result<Vec<TagEntry>, String> {
    let entries = std::fs::read_dir(&path).map_err(|e| e.to_string())?;
    let mut counts: std::collections::HashMap<String, usize> = std::collections::HashMap::new();

    for entry in entries.flatten() {
        for tag in read_tags(entry.path().to_str().unwrap_or("")) {
            *counts.entry(tag).or_insert(0) += 1;
        }
    }

    let mut result: Vec<TagEntry> = counts.into_iter()
        .map(|(tag, count)| TagEntry { tag, count })
        .collect();
    result.sort_by(|a, b| b.count.cmp(&a.count).then(a.tag.cmp(&b.tag)));
    Ok(result)
}

#[tauri::command]
fn search_files_by_tag(root: String, tag: String) -> Result<Vec<FileEntry>, String> {
    let tag = tag.trim().to_lowercase();
    let mut results = Vec::new();
    scan_dir_for_tag(&root, &tag, 0, &mut results);
    Ok(results)
}

fn scan_dir_for_tag(path: &str, tag: &str, depth: usize, results: &mut Vec<FileEntry>) {
    if depth > 6 { return; }
    let Ok(entries) = std::fs::read_dir(path) else { return };

    for entry in entries.flatten() {
        let p = entry.path();
        let path_str = p.to_string_lossy().to_string();
        let Ok(meta) = entry.metadata() else { continue };
        let tags = read_tags(&path_str);

        if tags.iter().any(|t| t == tag) {
            let modified = meta.modified().ok()
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_secs()).unwrap_or(0);
            results.push(FileEntry {
                name: entry.file_name().to_string_lossy().to_string(),
                path: path_str.clone(),
                is_dir: meta.is_dir(),
                size: if meta.is_file() { meta.len() } else { 0 },
                modified,
                tags,
            });
        }

        if meta.is_dir() && !entry.file_name().to_string_lossy().starts_with('.') {
            scan_dir_for_tag(&path_str, tag, depth + 1, results);
        }
    }
}

// ─── Commands: SSH ────────────────────────────────────────────────────────────

#[tauri::command]
fn list_ssh_profiles() -> Vec<SshProfile> {
    load_profiles()
}

#[tauri::command]
fn add_ssh_profile(name: String, user: String, host: String, port: u16, key_path: String) -> Result<String, String> {
    let id = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH).unwrap_or_default()
        .as_secs().to_string();
    let mut profiles = load_profiles();
    profiles.push(SshProfile { id: id.clone(), name, user, host, port, key_path });
    save_profiles(&profiles)?;
    Ok(id)
}

#[tauri::command]
fn remove_ssh_profile(id: String) -> Result<(), String> {
    let mut profiles = load_profiles();
    profiles.retain(|p| p.id != id);
    save_profiles(&profiles)
}

#[tauri::command]
fn test_ssh_connection(profile_id: String) -> Result<String, String> {
    let profiles = load_profiles();
    let profile = profiles.iter().find(|p| p.id == profile_id)
        .ok_or("Perfil no encontrado")?;
    let mut args = ssh_args(profile);
    args.push("echo OK".to_string());
    let out = Command::new("ssh").args(&args)
        .output().map_err(|e| e.to_string())?;
    if out.status.success() {
        Ok("Conexión exitosa".to_string())
    } else {
        Err(String::from_utf8_lossy(&out.stderr).to_string())
    }
}

#[tauri::command]
fn list_dir_ssh(profile_id: String, path: String) -> Result<Vec<FileEntry>, String> {
    let profiles = load_profiles();
    let profile = profiles.iter().find(|p| p.id == profile_id)
        .ok_or("Perfil no encontrado")?;

    let script = format!(
        r#"python3 -c "
import os,json,sys
p='{path}'
items=[]
try:
  for e in sorted(os.listdir(p)):
    fp=os.path.join(p,e)
    try:
      s=os.stat(fp)
      items.append({{'name':e,'path':fp,'is_dir':os.path.isdir(fp),'size':int(s.st_size),'modified':int(s.st_mtime)}})
    except: pass
except Exception as ex:
  print(json.dumps({{'error':str(ex)}}),file=sys.stderr)
print(json.dumps(items))
""#,
        path = path.replace("'", "\\'")
    );

    let mut args = ssh_args(profile);
    // remove the last element (user@host) and rebuild correctly
    let target = args.pop().unwrap();
    args.push(target);
    args.push(script);

    let out = Command::new("ssh").args(&args)
        .output().map_err(|e| e.to_string())?;

    if !out.status.success() {
        let err = String::from_utf8_lossy(&out.stderr);
        return Err(err.to_string());
    }

    let stdout = String::from_utf8_lossy(&out.stdout);
    serde_json::from_str::<Vec<FileEntry>>(stdout.trim())
        .map_err(|e| format!("parse error: {} — output: {}", e, stdout))
}

#[tauri::command]
fn get_disk_info_ssh(profile_id: String, path: String) -> Result<DiskInfo, String> {
    let profiles = load_profiles();
    let profile = profiles.iter().find(|p| p.id == profile_id)
        .ok_or("Perfil no encontrado")?;

    let script = format!("df -B1 --output=size,used,avail '{}'", path.replace("'", "\\'"));
    let mut args = ssh_args(profile);
    args.push(script);

    let out = Command::new("ssh").args(&args)
        .output().map_err(|e| e.to_string())?;
    let s = String::from_utf8_lossy(&out.stdout);
    let line = s.lines().nth(1).ok_or("no disk info")?;
    let p: Vec<&str> = line.split_whitespace().collect();
    Ok(DiskInfo {
        total:     p.first().and_then(|s| s.parse().ok()).unwrap_or(0),
        used:      p.get(1).and_then(|s| s.parse().ok()).unwrap_or(0),
        available: p.get(2).and_then(|s| s.parse().ok()).unwrap_or(0),
    })
}

// ─── Commands: rsync ─────────────────────────────────────────────────────────

fn build_rsync_args(src: &str, dst: &str, mode: &str) -> Vec<String> {
    let mut args = vec!["-av".to_string(), "--progress".to_string()];
    match mode {
        "mirror"      => args.push("--delete".to_string()),
        "sync"        => args.push("--update".to_string()),
        "incremental" => args.push("--backup".to_string()),
        "dry-run"     => args.push("--dry-run".to_string()),
        _ => {}
    }
    args.push(src.to_string());
    args.push(dst.to_string());
    args
}

#[tauri::command]
fn run_rsync(
    app: AppHandle,
    src: String,
    dst: String,
    mode: String,
    excludes: Vec<String>,
    bwlimit: Option<u32>,
    src_profile_id: Option<String>,
    dst_profile_id: Option<String>,
) -> Result<(), String> {
    let profiles = load_profiles();

    let src_addr = if let Some(ref pid) = src_profile_id {
        let p = profiles.iter().find(|p| &p.id == pid).ok_or("Perfil origen no encontrado")?;
        format!("{}@{}:{}", p.user, p.host, src)
    } else {
        src.clone()
    };

    let dst_addr = if let Some(ref pid) = dst_profile_id {
        let p = profiles.iter().find(|p| &p.id == pid).ok_or("Perfil destino no encontrado")?;
        format!("{}@{}:{}", p.user, p.host, dst)
    } else {
        dst.clone()
    };

    let mut args = build_rsync_args(&src_addr, &dst_addr, &mode);

    // SSH transport — use src profile or dst profile (one of them is remote)
    let ssh_profile = src_profile_id.as_ref()
        .and_then(|id| profiles.iter().find(|p| &p.id == id))
        .or_else(|| dst_profile_id.as_ref().and_then(|id| profiles.iter().find(|p| &p.id == id)));

    if let Some(profile) = ssh_profile {
        args.insert(0, ssh_e_arg(profile));
        args.insert(0, "-e".to_string());
    }

    for ex in &excludes {
        args.push(format!("--exclude={}", ex));
    }
    if let Some(bw) = bwlimit {
        args.push(format!("--bwlimit={}", bw));
    }

    let started = std::time::Instant::now();

    let mut child = Command::new("rsync")
        .args(&args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("rsync not found: {}", e))?;

    let stdout = child.stdout.take().unwrap();
    let stderr = child.stderr.take().unwrap();

    let app_out = app.clone();
    let t1 = thread::spawn(move || {
        for line in BufReader::new(stdout).lines().flatten() {
            let _ = app_out.emit("rsync-event", RsyncEvent {
                line, is_error: false, done: false, exit_ok: true,
            });
        }
    });

    let app_err = app.clone();
    let t2 = thread::spawn(move || {
        for line in BufReader::new(stderr).lines().flatten() {
            let _ = app_err.emit("rsync-event", RsyncEvent {
                line, is_error: true, done: false, exit_ok: true,
            });
        }
    });

    let _ = t1.join();
    let _ = t2.join();

    let status = child.wait().map_err(|e| e.to_string())?;
    let ok = status.success();
    let duration_secs = started.elapsed().as_secs();

    let _ = app.emit("rsync-event", RsyncEvent {
        line: if ok {
            "✓ Sync completado exitosamente.".to_string()
        } else {
            format!("✗ rsync terminó con código {}", status.code().unwrap_or(-1))
        },
        is_error: !ok, done: true, exit_ok: ok,
    });

    // Save to history
    let id = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH).unwrap_or_default()
        .as_secs().to_string();
    append_history(HistoryEntry {
        id,
        timestamp: std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH).unwrap_or_default()
            .as_secs(),
        src: src.clone(),
        dst: dst.clone(),
        mode: mode.clone(),
        success: ok,
        duration_secs,
    });

    // Desktop notification
    let notif_body = if ok {
        format!("✓ {} → {} ({}s)", src, dst, duration_secs)
    } else {
        format!("✗ Sync falló: {} → {}", src, dst)
    };
    let _ = Command::new("notify-send")
        .args(["Truefiles OS", &notif_body, "--icon=emblem-synchronizing", "--expire-time=5000"])
        .spawn();

    Ok(())
}

// ─── Commands: cron ──────────────────────────────────────────────────────────

const MARKER: &str = "# rsyn-os:";

fn read_crontab() -> String {
    Command::new("crontab").arg("-l").output()
        .map(|o| String::from_utf8_lossy(&o.stdout).to_string())
        .unwrap_or_default()
}

fn write_crontab(content: &str) -> Result<(), String> {
    let mut child = Command::new("crontab").arg("-")
        .stdin(Stdio::piped()).spawn().map_err(|e| e.to_string())?;
    child.stdin.take().unwrap()
        .write_all(content.as_bytes()).map_err(|e| e.to_string())?;
    child.wait().map_err(|e| e.to_string())?;
    Ok(())
}

fn parse_marker(line: &str) -> std::collections::HashMap<String, String> {
    line[MARKER.len()..].split_whitespace().filter_map(|kv| {
        let mut p = kv.splitn(2, '=');
        Some((p.next()?.to_string(), p.next()?.to_string()))
    }).collect()
}

#[tauri::command]
fn list_cron_jobs() -> Result<Vec<CronJob>, String> {
    let tab = read_crontab();
    let mut jobs = Vec::new();
    let mut iter = tab.lines().peekable();
    while let Some(line) = iter.next() {
        if !line.starts_with(MARKER) { continue; }
        let meta = parse_marker(line);
        if let Some(cline) = iter.next() {
            let parts: Vec<&str> = cline.splitn(6, ' ').collect();
            if parts.len() == 6 {
                jobs.push(CronJob {
                    id:       meta.get("id").cloned().unwrap_or_default(),
                    schedule: parts[..5].join(" "),
                    src:      meta.get("src").cloned().unwrap_or_default(),
                    dst:      meta.get("dst").cloned().unwrap_or_default(),
                    mode:     meta.get("mode").cloned().unwrap_or_default(),
                    label:    meta.get("label").cloned().unwrap_or_default().replace('_', " "),
                });
            }
        }
    }
    Ok(jobs)
}

#[tauri::command]
fn add_cron_job(schedule: String, src: String, dst: String, mode: String, label: String) -> Result<String, String> {
    let id = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH).unwrap_or_default()
        .as_secs().to_string();
    let args = build_rsync_args(&src, &dst, &mode);
    let entry = format!(
        "{} id={} label={} mode={} src={} dst={}\n{} {}\n",
        MARKER, id, label.replace(' ', "_"), mode,
        src.replace(' ', "_"), dst.replace(' ', "_"),
        schedule, format!("rsync {}", args.join(" "))
    );
    let mut tab = read_crontab();
    if !tab.is_empty() && !tab.ends_with('\n') { tab.push('\n'); }
    tab.push_str(&entry);
    write_crontab(&tab)?;
    Ok(id)
}

#[tauri::command]
fn remove_cron_job(id: String) -> Result<(), String> {
    let tab = read_crontab();
    let mut out: Vec<&str> = Vec::new();
    let mut iter = tab.lines().peekable();
    while let Some(line) = iter.next() {
        if line.starts_with(MARKER) && line.contains(&format!("id={}", id)) {
            iter.next();
        } else {
            out.push(line);
        }
    }
    write_crontab(&(out.join("\n") + "\n"))
}

// ─── Commands: File Viewer ───────────────────────────────────────────────────

#[tauri::command]
fn read_file_base64(path: String) -> Result<String, String> {
    use base64::{Engine as _, engine::general_purpose::STANDARD};
    let meta = std::fs::metadata(&path).map_err(|e| e.to_string())?;
    if meta.len() > 50 * 1024 * 1024 {
        return Err("Archivo mayor a 50 MB — demasiado grande para previsualizar".into());
    }
    let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
    Ok(STANDARD.encode(&bytes))
}

#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    let meta = std::fs::metadata(&path).map_err(|e| e.to_string())?;
    if meta.len() > 5 * 1024 * 1024 {
        return Err("Archivo mayor a 5 MB — demasiado grande para previsualizar".into());
    }
    std::fs::read_to_string(&path).map_err(|e| e.to_string())
}

// ─── Commands: Duplicates ────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone)]
struct DuplicateGroup {
    size: u64,
    hash: String,
    files: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone)]
struct DupEvent {
    phase: String,   // "scanning" | "hashing" | "done" | "error"
    current: usize,
    total: usize,
    groups: Vec<DuplicateGroup>,
    message: String,
}

fn fnv1a(path: &str) -> Result<String, String> {
    use std::io::Read;
    let mut f = std::fs::File::open(path).map_err(|e| e.to_string())?;
    let mut h: u64 = 14695981039346656037;
    let mut buf = [0u8; 65536];
    loop {
        let n = f.read(&mut buf).map_err(|e| e.to_string())?;
        if n == 0 { break; }
        for &b in &buf[..n] {
            h ^= b as u64;
            h = h.wrapping_mul(1099511628211);
        }
    }
    Ok(format!("{:016x}", h))
}

fn collect_files(dir: &str, min_size: u64, depth: usize, out: &mut Vec<(u64, String)>) {
    if depth > 8 { return; }
    let Ok(entries) = std::fs::read_dir(dir) else { return };
    for entry in entries.flatten() {
        let path = entry.path();
        let name = entry.file_name();
        let name_s = name.to_string_lossy();
        if name_s.starts_with('.') { continue; } // skip hidden
        let Ok(meta) = entry.metadata() else { continue };
        if meta.is_symlink() { continue; }
        if meta.is_dir() {
            collect_files(&path.to_string_lossy(), min_size, depth + 1, out);
        } else if meta.is_file() && meta.len() >= min_size {
            out.push((meta.len(), path.to_string_lossy().to_string()));
        }
    }
}

#[tauri::command]
fn find_duplicates(app: AppHandle, root: String, min_size: u64) -> Result<(), String> {
    let app = app.clone();
    thread::spawn(move || {
        // Phase 1: scan
        let _ = app.emit("dup-event", DupEvent {
            phase: "scanning".into(), current: 0, total: 0,
            groups: vec![], message: format!("Escaneando {}…", root),
        });

        let mut all_files: Vec<(u64, String)> = Vec::new();
        collect_files(&root, min_size, 0, &mut all_files);

        // Group by size
        let mut by_size: std::collections::HashMap<u64, Vec<String>> = std::collections::HashMap::new();
        for (size, path) in all_files {
            by_size.entry(size).or_default().push(path);
        }
        let candidates: Vec<(u64, Vec<String>)> = by_size
            .into_iter()
            .filter(|(_, v)| v.len() > 1)
            .collect();

        let total = candidates.len();
        let _ = app.emit("dup-event", DupEvent {
            phase: "hashing".into(), current: 0, total,
            groups: vec![], message: format!("{} grupos a comparar…", total),
        });

        // Phase 2: hash
        let mut groups: Vec<DuplicateGroup> = Vec::new();
        for (i, (size, paths)) in candidates.into_iter().enumerate() {
            let _ = app.emit("dup-event", DupEvent {
                phase: "hashing".into(), current: i + 1, total,
                groups: vec![], message: String::new(),
            });

            let mut by_hash: std::collections::HashMap<String, Vec<String>> = std::collections::HashMap::new();
            for path in paths {
                if let Ok(h) = fnv1a(&path) {
                    by_hash.entry(h).or_default().push(path);
                }
            }
            for (hash, files) in by_hash {
                if files.len() > 1 {
                    groups.push(DuplicateGroup { size, hash, files });
                }
            }
        }

        // Sort by wasted space (size × copies - 1)
        groups.sort_by(|a, b| {
            let wa = a.size * (a.files.len() as u64 - 1);
            let wb = b.size * (b.files.len() as u64 - 1);
            wb.cmp(&wa)
        });

        let _ = app.emit("dup-event", DupEvent {
            phase: "done".into(), current: total, total,
            groups, message: String::new(),
        });
    });
    Ok(())
}

#[tauri::command]
fn trash_file(path: String) -> Result<(), String> {
    // Try gio trash first (recoverable — goes to GNOME/system trash)
    if let Ok(s) = Command::new("gio").args(["trash", &path]).status() {
        if s.success() { return Ok(()); }
    }
    // Fallback: permanently delete (only if gio not available)
    std::fs::remove_file(&path).map_err(|e| e.to_string())
}

// ─── Commands: History ───────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone)]
struct HistoryEntry {
    id: String,
    timestamp: u64,
    src: String,
    dst: String,
    mode: String,
    success: bool,
    duration_secs: u64,
}

fn history_path() -> std::path::PathBuf {
    config_dir().join("history.json")
}

fn load_history() -> Vec<HistoryEntry> {
    std::fs::read_to_string(history_path())
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn append_history(entry: HistoryEntry) {
    let mut history = load_history();
    history.insert(0, entry);
    history.truncate(200); // keep last 200 entries
    if let Ok(json) = serde_json::to_string_pretty(&history) {
        let _ = std::fs::write(history_path(), json);
    }
}

#[tauri::command]
fn list_history() -> Vec<HistoryEntry> {
    load_history()
}

#[tauri::command]
fn clear_history() -> Result<(), String> {
    std::fs::write(history_path(), "[]").map_err(|e| e.to_string())
}

// ─── Commands: Timeshift ─────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone)]
struct TimeshiftSnapshot {
    name: String,
    tags: String,
    comment: String,
}

#[derive(Serialize, Deserialize, Clone)]
struct TimeshiftEvent {
    line: String,
    is_error: bool,
    done: bool,
    exit_ok: bool,
}

fn tag_name(tag: &str) -> &'static str {
    match tag {
        "O" => "Manual",
        "D" => "Diario",
        "W" => "Semanal",
        "M" => "Mensual",
        "B" => "Boot",
        _   => "—",
    }
}

fn parse_snapshot_line(line: &str) -> Option<TimeshiftSnapshot> {
    let parts: Vec<&str> = line.split_whitespace().collect();
    // First token must be a number (snapshot index)
    parts.first()?.parse::<usize>().ok()?;
    // Find the timestamp token: YYYY-MM-DD_HH-MM-SS (19 chars)
    let ts_idx = parts.iter().position(|p| {
        p.len() == 19
            && p.chars().nth(4) == Some('-')
            && p.chars().nth(7) == Some('-')
            && p.chars().nth(10) == Some('_')
    })?;
    let name = parts[ts_idx].to_string();
    let raw_tag = parts.get(ts_idx + 1).copied().unwrap_or("").to_string();
    let tags = tag_name(&raw_tag).to_string();
    let comment = if parts.len() > ts_idx + 2 {
        parts[ts_idx + 2..].join(" ")
    } else {
        String::new()
    };
    Some(TimeshiftSnapshot { name, tags, comment })
}

#[tauri::command]
fn check_timeshift() -> bool {
    Command::new("which").arg("timeshift").output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

#[tauri::command]
fn list_timeshift_snapshots() -> Result<Vec<TimeshiftSnapshot>, String> {
    let out = Command::new("pkexec")
        .args(["timeshift", "--list"])
        .output()
        .map_err(|e| format!("No se pudo ejecutar pkexec: {}", e))?;

    let stdout = String::from_utf8_lossy(&out.stdout);
    let stderr = String::from_utf8_lossy(&out.stderr);

    if !out.status.success() && stdout.trim().is_empty() {
        return Err(stderr.to_string());
    }

    let snapshots: Vec<TimeshiftSnapshot> = stdout.lines()
        .filter_map(parse_snapshot_line)
        .collect();
    Ok(snapshots)
}

#[tauri::command]
fn create_timeshift_snapshot(app: AppHandle, comment: String) -> Result<(), String> {
    let mut cmd_args = vec!["timeshift", "--create"];
    if !comment.is_empty() {
        cmd_args.extend(["--comments", comment.as_str()]);
    }

    let mut child = Command::new("pkexec")
        .args(&cmd_args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("No se pudo lanzar pkexec: {}", e))?;

    let stdout = child.stdout.take().unwrap();
    let stderr = child.stderr.take().unwrap();

    let app_out = app.clone();
    let t1 = thread::spawn(move || {
        for line in BufReader::new(stdout).lines().flatten() {
            let _ = app_out.emit("timeshift-event", TimeshiftEvent {
                line, is_error: false, done: false, exit_ok: true,
            });
        }
    });
    let app_err = app.clone();
    let t2 = thread::spawn(move || {
        for line in BufReader::new(stderr).lines().flatten() {
            let _ = app_err.emit("timeshift-event", TimeshiftEvent {
                line, is_error: true, done: false, exit_ok: true,
            });
        }
    });
    let _ = t1.join();
    let _ = t2.join();

    let status = child.wait().map_err(|e| e.to_string())?;
    let ok = status.success();
    let _ = app.emit("timeshift-event", TimeshiftEvent {
        line: if ok { "✓ Snapshot creado exitosamente.".to_string() }
              else  { format!("✗ Timeshift terminó con código {}", status.code().unwrap_or(-1)) },
        is_error: !ok, done: true, exit_ok: ok,
    });
    Ok(())
}

#[tauri::command]
fn delete_timeshift_snapshot(app: AppHandle, name: String) -> Result<(), String> {
    let mut child = Command::new("pkexec")
        .args(["timeshift", "--delete", "--snapshot", &name])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("No se pudo lanzar pkexec: {}", e))?;

    let stdout = child.stdout.take().unwrap();
    let stderr = child.stderr.take().unwrap();

    let app_out = app.clone();
    let t1 = thread::spawn(move || {
        for line in BufReader::new(stdout).lines().flatten() {
            let _ = app_out.emit("timeshift-event", TimeshiftEvent {
                line, is_error: false, done: false, exit_ok: true,
            });
        }
    });
    let app_err = app.clone();
    let t2 = thread::spawn(move || {
        for line in BufReader::new(stderr).lines().flatten() {
            let _ = app_err.emit("timeshift-event", TimeshiftEvent {
                line, is_error: true, done: false, exit_ok: true,
            });
        }
    });
    let _ = t1.join();
    let _ = t2.join();

    let status = child.wait().map_err(|e| e.to_string())?;
    let ok = status.success();
    let _ = app.emit("timeshift-event", TimeshiftEvent {
        line: if ok { "✓ Snapshot eliminado.".to_string() }
              else  { format!("✗ Error al eliminar: código {}", status.code().unwrap_or(-1)) },
        is_error: !ok, done: true, exit_ok: ok,
    });
    Ok(())
}

// ─── Entry point ─────────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            get_home_dir,
            list_dir,
            get_disk_info,
            read_file_base64,
            read_text_file,
            find_duplicates,
            trash_file,
            get_file_tags,
            set_file_tags,
            list_all_tags_in_dir,
            search_files_by_tag,
            list_ssh_profiles,
            add_ssh_profile,
            remove_ssh_profile,
            test_ssh_connection,
            list_dir_ssh,
            get_disk_info_ssh,
            run_rsync,
            list_cron_jobs,
            add_cron_job,
            remove_cron_job,
            list_history,
            clear_history,
            check_timeshift,
            list_timeshift_snapshots,
            create_timeshift_snapshot,
            delete_timeshift_snapshot,
        ])
        .run(tauri::generate_context!())
        .expect("error while running truefiles-os");
}
