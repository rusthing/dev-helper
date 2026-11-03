use serde::Serialize;
use similar::{ChangeTag, TextDiff};

#[derive(Serialize)]
pub struct DiffLine {
    /// equal / insert / delete
    pub tag: String,
    pub old_no: Option<usize>,
    pub new_no: Option<usize>,
    pub text: String,
}

#[derive(Serialize)]
pub struct DiffSummary {
    pub added: usize,
    pub removed: usize,
    pub unchanged: usize,
}

#[derive(Serialize)]
pub struct DiffResult {
    pub lines: Vec<DiffLine>,
    pub summary: DiffSummary,
}

#[tauri::command]
pub fn text_diff(left: String, right: String) -> DiffResult {
    let diff = TextDiff::from_lines(&left, &right);
    let mut lines = Vec::new();
    let (mut added, mut removed, mut unchanged) = (0, 0, 0);

    for change in diff.iter_all_changes() {
        let tag = match change.tag() {
            ChangeTag::Insert => {
                added += 1;
                "insert"
            }
            ChangeTag::Delete => {
                removed += 1;
                "delete"
            }
            ChangeTag::Equal => {
                unchanged += 1;
                "equal"
            }
        };
        lines.push(DiffLine {
            tag: tag.to_string(),
            old_no: change.old_index().map(|i| i + 1),
            new_no: change.new_index().map(|i| i + 1),
            text: change.value().trim_end_matches('\n').to_string(),
        });
    }

    DiffResult {
        lines,
        summary: DiffSummary { added, removed, unchanged },
    }
}
