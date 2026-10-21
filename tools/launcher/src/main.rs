#![windows_subsystem = "windows"]

use std::env;
use std::ffi::{OsStr, OsString};
use std::fs::{self, File};
use std::io::{Read, Seek, SeekFrom, Write};
use std::os::windows::ffi::{OsStrExt, OsStringExt};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

use sha2::{Digest, Sha256};
use windows_sys::Win32::UI::WindowsAndMessaging::{
    MessageBoxW, MB_ICONERROR, MB_ICONINFORMATION, MB_OK,
};

const FOOTER_SIZE: u64 = 40;
const GC_AGE_SECS: u64 = 30 * 24 * 60 * 60; // 30 days
const USER_DATA_DIR_ENV: &str = "SEPILOT_LAUNCHER_USER_DATA_DIR";
const USER_DATA_DIR_SWITCH_PREFIX: &str = "--user-data-dir=";
const USER_DATA_DIR_SWITCHES: [(&str, &str); 3] = [
    ("--user-data-dir", "--user-data-dir="),
    ("-user-data-dir", "-user-data-dir="),
    ("/user-data-dir", "/user-data-dir="),
];
const PORTABLE_EXECUTABLE_FILE_ENV: &str = "PORTABLE_EXECUTABLE_FILE";
const PORTABLE_EXECUTABLE_DIR_ENV: &str = "PORTABLE_EXECUTABLE_DIR";

fn main() {
    if let Err(e) = run() {
        show_dialog(&format!("sepilot launcher 실행 실패:\n\n{}", e), true);
        std::process::exit(1);
    }
}

fn run() -> Result<(), String> {
    let self_path = env::current_exe().map_err(|e| format!("current_exe: {}", e))?;
    let footer = read_footer(&self_path)?;
    let sha_hex = hex::encode(footer.sha256);

    let cache_root = locate_cache_root()?;
    let target_dir = cache_root.join(&sha_hex);
    let integrity_marker = target_dir.join(".integrity");
    let sepilot_exe = target_dir.join("sepilotd.exe");

    let _ = gc_old_caches(&cache_root, &sha_hex);

    if integrity_marker.exists() && sepilot_exe.exists() {
        spawn_sepilot(&sepilot_exe, &self_path)?;
        return Ok(());
    }

    if env::var_os("SEPILOT_LAUNCHER_SKIP_DIALOG").is_none() {
        show_dialog(
            "sepilot을 처음 실행하면 ~1~3분 동안 준비 작업이 진행됩니다.\n\
             확인을 누르면 시작되며, 다음 실행부터는 즉시 열립니다.",
            false,
        );
    }

    extract_payload(&self_path, &footer, &target_dir)?;
    spawn_sepilot(&sepilot_exe, &self_path)?;

    Ok(())
}

struct Footer {
    sha256: [u8; 32],
    payload_len: u64,
}

fn read_footer(self_path: &Path) -> Result<Footer, String> {
    let mut f = File::open(self_path).map_err(|e| format!("open self exe: {}", e))?;
    let file_len = f
        .metadata()
        .map_err(|e| format!("stat self exe: {}", e))?
        .len();
    if file_len < FOOTER_SIZE {
        return Err(format!("self exe too small ({} bytes)", file_len));
    }
    f.seek(SeekFrom::Start(file_len - FOOTER_SIZE))
        .map_err(|e| format!("seek footer: {}", e))?;
    let mut buf = [0u8; FOOTER_SIZE as usize];
    f.read_exact(&mut buf)
        .map_err(|e| format!("read footer: {}", e))?;
    let mut sha = [0u8; 32];
    sha.copy_from_slice(&buf[0..32]);
    let payload_len = u64::from_le_bytes(buf[32..40].try_into().unwrap());
    if payload_len == 0 || payload_len > file_len - FOOTER_SIZE {
        return Err(format!(
            "invalid payload_len in footer: {} (file_len={})",
            payload_len, file_len
        ));
    }
    Ok(Footer {
        sha256: sha,
        payload_len,
    })
}

fn locate_cache_root() -> Result<PathBuf, String> {
    if let Some(base) = env::var_os("LOCALAPPDATA").map(PathBuf::from) {
        if !base.as_os_str().is_empty() {
            return Ok(base.join("sepilot").join("runtime"));
        }
    }
    Ok(env::temp_dir().join("sepilot-runtime"))
}

fn extract_payload(self_path: &Path, footer: &Footer, target_dir: &Path) -> Result<(), String> {
    let mut f = File::open(self_path).map_err(|e| format!("reopen self exe: {}", e))?;
    let file_len = f
        .metadata()
        .map_err(|e| format!("stat self exe: {}", e))?
        .len();
    let payload_offset = file_len - FOOTER_SIZE - footer.payload_len;
    f.seek(SeekFrom::Start(payload_offset))
        .map_err(|e| format!("seek payload: {}", e))?;

    let mut payload = vec![0u8; footer.payload_len as usize];
    f.read_exact(&mut payload)
        .map_err(|e| format!("read payload: {}", e))?;

    let mut hasher = Sha256::new();
    hasher.update(&payload);
    let actual = hasher.finalize();
    if actual.as_slice() != &footer.sha256[..] {
        return Err(format!(
            "payload sha256 mismatch (expected {}, got {})\n\
             exe가 손상되었거나 변조되었을 수 있습니다.",
            hex::encode(footer.sha256),
            hex::encode(actual)
        ));
    }

    let parent = target_dir
        .parent()
        .ok_or_else(|| "cache target has no parent".to_string())?;
    fs::create_dir_all(parent).map_err(|e| format!("mkdir parent {:?}: {}", parent, e))?;
    let tmp_dir = parent.join(format!(".tmp.{}", std::process::id()));
    if tmp_dir.exists() {
        let _ = fs::remove_dir_all(&tmp_dir);
    }
    fs::create_dir_all(&tmp_dir).map_err(|e| format!("mkdir tmp {:?}: {}", tmp_dir, e))?;

    let cursor = std::io::Cursor::new(payload);
    sevenz_rust2::decompress(cursor, &tmp_dir).map_err(|e| format!("7z decompress: {}", e))?;

    let marker_path = tmp_dir.join(".integrity");
    {
        let mut m =
            File::create(&marker_path).map_err(|e| format!("create integrity marker: {}", e))?;
        writeln!(m, "sha256={}", hex::encode(footer.sha256))
            .map_err(|e| format!("write integrity marker: {}", e))?;
    }

    if target_dir.exists() {
        let _ = fs::remove_dir_all(target_dir);
    }
    fs::rename(&tmp_dir, target_dir)
        .map_err(|e| format!("rename {:?} -> {:?}: {}", tmp_dir, target_dir, e))?;

    Ok(())
}

fn spawn_sepilot(sepilot_exe: &Path, outer_executable: &Path) -> Result<(), String> {
    if !sepilot_exe.exists() {
        return Err(format!(
            "추출된 sepilot.exe를 찾을 수 없습니다: {:?}",
            sepilot_exe
        ));
    }
    let launch = build_child_args(
        env::args_os().skip(1).collect(),
        prepare_default_user_data_dir,
    )?;
    fs::create_dir_all(&launch.user_data_dir).map_err(|e| {
        format!(
            "create effective user-data-dir {:?}: {}",
            launch.user_data_dir, e
        )
    })?;
    let mut cmd = Command::new(sepilot_exe);
    cmd.args(launch.args);
    let (portable_file, portable_dir) = portable_executable_env(outer_executable)?;
    cmd.env(PORTABLE_EXECUTABLE_FILE_ENV, portable_file);
    cmd.env(PORTABLE_EXECUTABLE_DIR_ENV, portable_dir);
    cmd.env(USER_DATA_DIR_ENV, launch.user_data_dir);
    if let Some(parent) = sepilot_exe.parent() {
        cmd.current_dir(parent);
    }
    cmd.spawn()
        .map_err(|e| format!("spawn sepilot.exe: {}", e))?;
    Ok(())
}

fn portable_executable_env(outer_executable: &Path) -> Result<(OsString, OsString), String> {
    let parent = outer_executable
        .parent()
        .filter(|path| !path.as_os_str().is_empty());
    let Some(parent) = parent else {
        return Err(format!(
            "outer launcher path has no parent: {:?}",
            outer_executable
        ));
    };
    Ok((
        outer_executable.as_os_str().to_os_string(),
        parent.as_os_str().to_os_string(),
    ))
}

enum UserDataDirSwitchArg {
    Bare,
    EmptyValue,
    Value(OsString),
}

fn strip_os_string_prefix(arg: &OsStr, prefix: &str) -> Option<OsString> {
    let value: Vec<u16> = arg.encode_wide().collect();
    let prefix: Vec<u16> = prefix.encode_utf16().collect();
    value
        .starts_with(&prefix)
        .then(|| OsString::from_wide(&value[prefix.len()..]))
}

fn classify_user_data_dir_switch(arg: &OsStr) -> Option<UserDataDirSwitchArg> {
    for (bare, valued) in USER_DATA_DIR_SWITCHES {
        if arg == OsStr::new(bare) {
            return Some(UserDataDirSwitchArg::Bare);
        }
        if let Some(value) = strip_os_string_prefix(arg, valued) {
            return Some(if value.is_empty() {
                UserDataDirSwitchArg::EmptyValue
            } else {
                UserDataDirSwitchArg::Value(value)
            });
        }
    }
    None
}

fn append_user_data_dir_arg(args: &mut Vec<OsString>, user_data_dir: &Path) {
    let mut arg = OsString::from(USER_DATA_DIR_SWITCH_PREFIX);
    arg.push(user_data_dir.as_os_str());
    args.push(arg);
}

struct ChildLaunch {
    args: Vec<OsString>,
    user_data_dir: PathBuf,
}

fn build_child_args<F>(
    forwarded_args: Vec<OsString>,
    default_user_data_dir: F,
) -> Result<ChildLaunch, String>
where
    F: FnOnce() -> Result<PathBuf, String>,
{
    let mut explicit_user_data_dir: Option<(usize, PathBuf)> = None;
    for (index, arg) in forwarded_args.iter().enumerate() {
        if arg == OsStr::new("--") {
            break;
        }
        match classify_user_data_dir_switch(arg.as_os_str()) {
            Some(UserDataDirSwitchArg::Bare) => {
                return Err(
                    "user-data-dir must use a single non-empty --user-data-dir=<path> argument; separate path arguments are not accepted"
                        .to_string(),
                );
            }
            Some(UserDataDirSwitchArg::EmptyValue) => {
                return Err("user-data-dir path must not be empty".to_string());
            }
            Some(UserDataDirSwitchArg::Value(value)) => {
                let path = PathBuf::from(value);
                if !path.is_absolute() {
                    return Err(format!(
                        "user-data-dir must be an absolute path: {:?}",
                        path
                    ));
                }
                if explicit_user_data_dir.is_some() {
                    return Err("user-data-dir must be specified at most once".to_string());
                }
                explicit_user_data_dir = Some((index, path));
            }
            None => {}
        }
    }

    let (explicit_index, user_data_dir) = match explicit_user_data_dir {
        Some((index, path)) => (Some(index), path),
        None => (None, default_user_data_dir()?),
    };
    if !user_data_dir.is_absolute() {
        return Err(format!(
            "resolved user-data-dir must be absolute: {:?}",
            user_data_dir
        ));
    }
    let mut child_args = Vec::with_capacity(forwarded_args.len() + 1);
    append_user_data_dir_arg(&mut child_args, &user_data_dir);
    child_args.extend(
        forwarded_args
            .into_iter()
            .enumerate()
            .filter_map(|(index, arg)| (Some(index) != explicit_index).then_some(arg)),
    );
    Ok(ChildLaunch {
        args: child_args,
        user_data_dir,
    })
}

fn explicit_user_data_dir(value: Option<OsString>) -> Result<Option<PathBuf>, String> {
    let Some(value) = value else {
        return Ok(None);
    };
    if value.is_empty() {
        return Ok(None);
    }

    let path = PathBuf::from(value);
    if !path.is_absolute() {
        return Err(format!(
            "{} must be an absolute path: {:?}",
            USER_DATA_DIR_ENV, path
        ));
    }
    Ok(Some(path))
}

fn default_user_data_dir_candidates(
    app_data: Option<OsString>,
    local_app_data: Option<OsString>,
    temp_dir: PathBuf,
) -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    for base in [app_data, local_app_data].into_iter().flatten() {
        if base.is_empty() {
            continue;
        }
        let base = PathBuf::from(base);
        if !base.is_absolute() {
            continue;
        }
        let candidate = base.join("@sepilotd").join("desktop");
        if !candidates.contains(&candidate) {
            candidates.push(candidate);
        }
    }

    if temp_dir.is_absolute() {
        let temp_candidate = temp_dir.join("@sepilotd").join("desktop");
        if !candidates.contains(&temp_candidate) {
            candidates.push(temp_candidate);
        }
    }
    candidates
}

fn prepare_default_user_data_dir() -> Result<PathBuf, String> {
    if let Some(explicit) = explicit_user_data_dir(env::var_os(USER_DATA_DIR_ENV))? {
        fs::create_dir_all(&explicit).map_err(|e| {
            format!(
                "create {} directory {:?}: {}",
                USER_DATA_DIR_ENV, explicit, e
            )
        })?;
        return Ok(explicit);
    }

    let candidates = default_user_data_dir_candidates(
        env::var_os("APPDATA"),
        env::var_os("LOCALAPPDATA"),
        env::temp_dir(),
    );
    let mut failures = Vec::new();
    for candidate in candidates {
        match fs::create_dir_all(&candidate) {
            Ok(()) => return Ok(candidate),
            Err(error) => failures.push(format!("{:?}: {}", candidate, error)),
        }
    }

    Err(format!(
        "unable to prepare a persistent Electron user-data directory ({})",
        failures.join("; ")
    ))
}

fn gc_old_caches(cache_root: &Path, current_sha_hex: &str) -> Result<(), String> {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let entries = match fs::read_dir(cache_root) {
        Ok(e) => e,
        Err(_) => return Ok(()), // 캐시 root 없으면 GC 할 일도 없음
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let name = match path.file_name().and_then(|n| n.to_str()) {
            Some(n) => n,
            None => continue,
        };
        if name == current_sha_hex || name.starts_with(".tmp.") {
            continue;
        }
        if let Ok(meta) = entry.metadata() {
            if let Ok(modified) = meta.modified() {
                if let Ok(d) = modified.duration_since(UNIX_EPOCH) {
                    if now.saturating_sub(d.as_secs()) > GC_AGE_SECS {
                        let _ = fs::remove_dir_all(&path);
                    }
                }
            }
        }
    }
    Ok(())
}

fn show_dialog(msg: &str, is_error: bool) {
    let wide_msg: Vec<u16> = OsString::from(msg)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();
    let wide_title: Vec<u16> = OsString::from("sepilot")
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();
    let flags = MB_OK
        | if is_error {
            MB_ICONERROR
        } else {
            MB_ICONINFORMATION
        };
    unsafe {
        MessageBoxW(
            std::ptr::null_mut(),
            wide_msg.as_ptr(),
            wide_title.as_ptr(),
            flags,
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn os(value: &str) -> OsString {
        OsString::from(value)
    }

    #[test]
    fn normalizes_one_explicit_equals_form_for_each_windows_switch_prefix() {
        for prefix in ["--", "-", "/"] {
            let explicit = os(&format!(
                "{}user-data-dir=C:\\Users\\Alice\\Profile",
                prefix
            ));
            let forwarded = vec![os("--disable-gpu"), explicit];
            let child = build_child_args(forwarded, || -> Result<PathBuf, String> {
                panic!("an explicit user-data-dir must bypass default resolution")
            })
            .unwrap();

            assert_eq!(
                child.args,
                vec![
                    os(r"--user-data-dir=C:\Users\Alice\Profile"),
                    os("--disable-gpu")
                ]
            );
            assert_eq!(
                child.user_data_dir,
                PathBuf::from(r"C:\Users\Alice\Profile")
            );
        }
    }

    #[test]
    fn inserts_one_unicode_safe_default_switch_before_forwarded_args() {
        let path = PathBuf::from(r"C:\Users\Alice\앱 데이터");

        let launch = build_child_args(vec![os("--disable-gpu")], || Ok(path.clone())).unwrap();

        assert_eq!(
            launch.args[0],
            os(r"--user-data-dir=C:\Users\Alice\앱 데이터")
        );
        assert_eq!(launch.args[1], os("--disable-gpu"));
        assert_eq!(launch.user_data_dir, path);
    }

    #[test]
    fn rejects_bare_separate_empty_and_duplicate_switches_before_terminator() {
        let default = || Ok(PathBuf::from(r"C:\Default"));
        assert!(
            build_child_args(vec![os("--user-data-dir"), os(r"C:\Explicit")], default,).is_err()
        );
        assert!(build_child_args(vec![os("-user-data-dir=")], default).is_err());
        assert!(build_child_args(vec![os(r"--user-data-dir=relative\profile")], default,).is_err());
        assert!(build_child_args(
            vec![os(r"--user-data-dir=C:\One"), os(r"/user-data-dir=C:\Two"),],
            default,
        )
        .is_err());
    }

    #[test]
    fn ignores_switch_like_application_args_after_terminator() {
        let forwarded = vec![
            os("--disable-gpu"),
            os("--"),
            os("--user-data-dir"),
            os(r"C:\ApplicationArg"),
        ];

        let child =
            build_child_args(forwarded.clone(), || Ok(PathBuf::from(r"C:\Default"))).unwrap();

        assert_eq!(child.args[0], os(r"--user-data-dir=C:\Default"));
        assert_eq!(&child.args[1..], forwarded.as_slice());
        assert_eq!(child.user_data_dir, PathBuf::from(r"C:\Default"));
    }

    #[test]
    fn does_not_treat_similar_switch_names_as_user_data_dir() {
        let forwarded = vec![os(r"--user-data-directory=C:\NotTheProfileSwitch")];

        let child =
            build_child_args(forwarded.clone(), || Ok(PathBuf::from(r"C:\Default"))).unwrap();

        assert_eq!(child.args[0], os(r"--user-data-dir=C:\Default"));
        assert_eq!(&child.args[1..], forwarded.as_slice());
    }

    #[test]
    fn derives_portable_environment_from_the_outer_launcher() {
        assert_eq!(
            portable_executable_env(Path::new(r"D:\Apps\SEPilot.exe")).unwrap(),
            (os(r"D:\Apps\SEPilot.exe"), os(r"D:\Apps"))
        );
        assert!(portable_executable_env(Path::new("SEPilot.exe")).is_err());
    }

    #[test]
    fn prefers_roaming_app_data_then_local_app_data_then_temp() {
        let candidates = default_user_data_dir_candidates(
            Some(os(r"C:\Users\Alice\AppData\Roaming")),
            Some(os(r"C:\Users\Alice\AppData\Local")),
            PathBuf::from(r"C:\Temp"),
        );

        assert_eq!(
            candidates,
            vec![
                PathBuf::from(r"C:\Users\Alice\AppData\Roaming\@sepilotd\desktop"),
                PathBuf::from(r"C:\Users\Alice\AppData\Local\@sepilotd\desktop"),
                PathBuf::from(r"C:\Temp\@sepilotd\desktop"),
            ]
        );
    }

    #[test]
    fn ignores_empty_or_relative_implicit_bases_but_keeps_the_safe_fallback() {
        let candidates = default_user_data_dir_candidates(
            Some(os("")),
            Some(os(r"relative\local")),
            PathBuf::from(r"C:\Temp"),
        );

        assert_eq!(
            candidates,
            vec![PathBuf::from(r"C:\Temp\@sepilotd\desktop")]
        );
        assert!(default_user_data_dir_candidates(
            Some(os("")),
            Some(os(r"relative\local")),
            PathBuf::from(r"relative\temp"),
        )
        .is_empty());
    }

    #[test]
    fn explicit_environment_override_must_be_absolute() {
        assert_eq!(
            explicit_user_data_dir(Some(os(r"D:\Profiles\sepilot"))).unwrap(),
            Some(PathBuf::from(r"D:\Profiles\sepilot"))
        );
        assert_eq!(explicit_user_data_dir(Some(os(""))).unwrap(), None);
        assert!(explicit_user_data_dir(Some(os(r"relative\profile"))).is_err());
    }
}
