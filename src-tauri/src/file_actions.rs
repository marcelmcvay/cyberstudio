use std::path::Path;

pub fn save_copy(window: &tauri::WebviewWindow, source: &str) -> Result<bool, String> {
    let source = Path::new(source);
    if !source.is_file() { return Err("The source file is no longer available.".into()); }
    let name = source.file_name().and_then(|name| name.to_str()).unwrap_or("file");
    let destination = rfd::FileDialog::new().set_parent(window).set_title("Save a copy").set_file_name(name).save_file();
    let Some(destination) = destination else { return Ok(false); };
    copy_to(source, &destination)?;
    Ok(true)
}

fn copy_to(source: &Path, destination: &Path) -> Result<(), String> {
    let actual = source.canonicalize().map_err(|error| format!("Could not read the source file: {error}"))?;
    let target = destination.canonicalize().or_else(|_| {
        destination.parent().unwrap_or(Path::new(".")).canonicalize().map(|parent| parent.join(destination.file_name().unwrap_or_default()))
    }).map_err(|error| format!("Could not use this save location: {error}"))?;
    if actual == target { return Err("Choose a different location or filename. The original file was not changed.".into()); }
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        if let (Ok(source_info), Ok(target_info)) = (actual.metadata(), target.metadata()) {
            if source_info.dev() == target_info.dev() && source_info.ino() == target_info.ino() {
                return Err("This location refers to the original file. Choose a different filename.".into());
            }
        }
    }
    std::fs::copy(&actual, &target).map_err(|error| format!("Could not save the copy: {error}"))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn copy_preserves_source_and_rejects_saving_over_it() {
        let root = std::env::temp_dir().join(format!("cyberstudio-copy-{}", std::process::id()));
        std::fs::create_dir_all(&root).unwrap();
        let source = root.join("image #1.txt"); let destination = root.join("copy.txt");
        std::fs::write(&source, "original").unwrap();
        assert!(copy_to(&source, &source).is_err());
        copy_to(&source, &destination).unwrap();
        assert_eq!(std::fs::read_to_string(&source).unwrap(), "original");
        assert_eq!(std::fs::read_to_string(&destination).unwrap(), "original");
        std::fs::remove_file(&source).unwrap(); std::fs::remove_file(&destination).unwrap(); std::fs::remove_dir(&root).unwrap();
    }
}
