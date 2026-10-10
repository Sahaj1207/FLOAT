//! Upcoming events from a private ICS (iCalendar) link, which Google
//! Calendar, Outlook and iCloud all provide. Opt-in: nothing is fetched
//! until the user pastes a link in Settings.
//!
//! Recurrence is expanded with the `rrule` crate, which also parses the
//! DTSTART line (UTC, TZID or floating), so one-off events are fed through it
//! too as a single-occurrence rule.

use chrono::{DateTime, Duration as ChronoDuration, NaiveDate, NaiveDateTime, Utc};
use rrule::{RRuleSet, Tz};
use serde::Serialize;
use std::sync::Mutex;
use std::time::{Duration, Instant};

const CACHE_FOR: Duration = Duration::from_secs(10 * 60);
const MAX_EVENTS: usize = 3;
/// Don't look further ahead than this.
const HORIZON_DAYS: i64 = 30;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CalendarEvent {
    title: String,
    /// Unix milliseconds.
    start: i64,
    end: i64,
    all_day: bool,
    location: Option<String>,
}

#[derive(Default)]
struct RawEvent {
    summary: String,
    location: Option<String>,
    dtstart: Option<String>, // full line, e.g. "DTSTART;TZID=Europe/Paris:20260101T090000"
    dtend_value: Option<String>,
    rrule: Vec<String>, // RRULE / EXDATE / RDATE lines
    cancelled: bool,
    is_override: bool, // RECURRENCE-ID: a moved instance of a recurring event
}

static CACHE: Mutex<Option<(String, Instant, Vec<RawParsed>)>> = Mutex::new(None);

/// An event with its recurrence set ready to query.
#[derive(Clone)]
struct RawParsed {
    title: String,
    location: Option<String>,
    set: RRuleSet,
    duration: ChronoDuration,
    all_day: bool,
}

/// RFC 5545 line unfolding: a line starting with space/tab continues the previous one.
fn unfold(ics: &str) -> Vec<String> {
    let mut lines: Vec<String> = Vec::new();
    for raw in ics.lines() {
        if let Some(rest) = raw.strip_prefix(' ').or_else(|| raw.strip_prefix('\t')) {
            if let Some(last) = lines.last_mut() {
                last.push_str(rest);
                continue;
            }
        }
        lines.push(raw.trim_end_matches('\r').to_string());
    }
    lines
}

fn unescape(text: &str) -> String {
    text.replace("\\n", " ").replace("\\N", " ").replace("\\,", ",").replace("\\;", ";").replace("\\\\", "\\")
}

/// Value digits of a date or date-time ("20260101" or "20260101T090000[Z]") as a naive time.
fn naive(value: &str) -> Option<(NaiveDateTime, bool)> {
    let v = value.trim().trim_end_matches('Z');
    if let Ok(dt) = NaiveDateTime::parse_from_str(v, "%Y%m%dT%H%M%S") {
        return Some((dt, false));
    }
    NaiveDate::parse_from_str(v, "%Y%m%d").ok().map(|d| (d.and_hms_opt(0, 0, 0).unwrap(), true))
}

fn parse_events(ics: &str) -> Vec<RawParsed> {
    let mut events = Vec::new();
    let mut current: Option<RawEvent> = None;
    for line in unfold(ics) {
        if line == "BEGIN:VEVENT" {
            current = Some(RawEvent::default());
            continue;
        }
        if line == "END:VEVENT" {
            if let Some(event) = current.take() {
                if let Some(parsed) = finish(event) {
                    events.push(parsed);
                }
            }
            continue;
        }
        let Some(event) = current.as_mut() else { continue };
        let Some((name, value)) = line.split_once(':') else { continue };
        let key = name.split(';').next().unwrap_or(name).to_ascii_uppercase();
        match key.as_str() {
            "SUMMARY" => event.summary = unescape(value),
            "LOCATION" => event.location = Some(unescape(value)).filter(|l| !l.trim().is_empty()),
            "DTSTART" => event.dtstart = Some(line.clone()),
            "DTEND" => event.dtend_value = Some(value.to_string()),
            "RRULE" | "EXDATE" | "RDATE" => event.rrule.push(line.clone()),
            "STATUS" => event.cancelled = value.eq_ignore_ascii_case("CANCELLED"),
            "RECURRENCE-ID" => event.is_override = true,
            _ => {}
        }
    }
    events
}

fn finish(event: RawEvent) -> Option<RawParsed> {
    if event.cancelled {
        return None;
    }
    let dtstart = event.dtstart?;
    let start_value = dtstart.split_once(':')?.1;
    let (start_naive, all_day) = naive(start_value)?;
    let duration = event
        .dtend_value
        .as_deref()
        .and_then(naive)
        .map(|(end, _)| end - start_naive)
        .filter(|d| *d > ChronoDuration::zero())
        .unwrap_or_else(|| if all_day { ChronoDuration::days(1) } else { ChronoDuration::hours(1) });

    // Overrides and one-off events are a single occurrence.
    let has_rule = !event.is_override && event.rrule.iter().any(|l| l.to_ascii_uppercase().starts_with("RRULE"));
    let rules = if has_rule { event.rrule.join("\n") } else { "RRULE:FREQ=DAILY;COUNT=1".to_string() };

    let build = |start_line: &str| format!("{start_line}\n{rules}").parse::<RRuleSet>().ok();
    // Outlook exports Windows time zone names the parser doesn't know; fall
    // back to the same wall-clock time as local (floating) time.
    let set = build(&dtstart).or_else(|| build(&format!("DTSTART:{}", start_value.trim_end_matches('Z'))))?;

    Some(RawParsed {
        title: if event.summary.trim().is_empty() { "Busy".into() } else { event.summary },
        location: event.location,
        set,
        duration,
        all_day,
    })
}

fn upcoming(events: &[RawParsed], now: DateTime<Utc>) -> Vec<CalendarEvent> {
    let horizon = now + ChronoDuration::days(HORIZON_DAYS);
    let mut out = Vec::new();
    for event in events {
        // Include an event that has started but not ended.
        let from = (now - event.duration).with_timezone(&Tz::UTC);
        let occurrences = event.set.clone().after(from).before(horizon.with_timezone(&Tz::UTC)).all(2);
        for start in occurrences.dates {
            let end = start + event.duration;
            if end.with_timezone(&Utc) <= now {
                continue;
            }
            out.push(CalendarEvent {
                title: event.title.clone(),
                start: start.timestamp_millis(),
                end: end.timestamp_millis(),
                all_day: event.all_day,
                location: event.location.clone(),
            });
        }
    }
    out.sort_by_key(|e| e.start);
    out.truncate(MAX_EVENTS);
    out
}

fn fetch(url: &str) -> Result<String, String> {
    // Calendar apps hand out webcal:// links; they are plain HTTPS.
    let url = url.trim().replacen("webcal://", "https://", 1);
    if !url.starts_with("https://") {
        return Err("The calendar link must start with https:// or webcal://".into());
    }
    let agent: ureq::Agent = ureq::Agent::config_builder()
        .timeout_global(Some(Duration::from_secs(12)))
        .user_agent("FLOAT (https://github.com/Sahaj1207/FLOAT)")
        .build()
        .into();
    let body = agent
        .get(&url)
        .call()
        .map_err(|e| e.to_string())?
        .body_mut()
        .with_config()
        .limit(8 * 1024 * 1024)
        .read_to_string()
        .map_err(|e| e.to_string())?;
    if !body.contains("BEGIN:VCALENDAR") {
        return Err("That link didn't return a calendar".into());
    }
    Ok(body)
}

/// The next few events from an ICS link (re-downloaded every 10 minutes).
#[tauri::command]
pub async fn get_calendar_events(url: String) -> Result<Vec<CalendarEvent>, String> {
    let cached = CACHE
        .lock()
        .unwrap()
        .as_ref()
        .filter(|(u, at, _)| *u == url && at.elapsed() < CACHE_FOR)
        .map(|(_, _, events)| events.clone());
    let events = match cached {
        Some(events) => events,
        None => {
            let fetch_url = url.clone();
            let events = tauri::async_runtime::spawn_blocking(move || fetch(&fetch_url).map(|ics| parse_events(&ics)))
                .await
                .map_err(|e| e.to_string())??;
            *CACHE.lock().unwrap() = Some((url, Instant::now(), events.clone()));
            events
        }
    };
    Ok(upcoming(&events, Utc::now()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    const ICS: &str = "BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nSUMMARY:Standup\r\nDTSTART:20260105T090000Z\r\nDTEND:20260105T091500Z\r\nRRULE:FREQ=WEEKLY;BYDAY=MO,WE\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nSUMMARY:Lunch with\r\n  Sam\\, downtown\r\nDTSTART;TZID=Europe/Paris:20260107T123000\r\nDTEND;TZID=Europe/Paris:20260107T133000\r\nLOCATION:Cafe\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nSUMMARY:Old\r\nDTSTART:20200101T090000Z\r\nDTEND:20200101T100000Z\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nSUMMARY:Holiday\r\nDTSTART;VALUE=DATE:20260108\r\nDTEND;VALUE=DATE:20260109\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nSUMMARY:Gone\r\nSTATUS:CANCELLED\r\nDTSTART:20260107T100000Z\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n";

    #[test]
    fn finds_upcoming_events() {
        let events = parse_events(ICS);
        // Tuesday 6 Jan 2026, 12:00 UTC.
        let now = Utc.with_ymd_and_hms(2026, 1, 6, 12, 0, 0).unwrap();
        let next = upcoming(&events, now);
        let titles: Vec<&str> = next.iter().map(|e| e.title.as_str()).collect();
        assert_eq!(titles, vec!["Standup", "Lunch with Sam, downtown", "Holiday"]);
        // Wednesday's standup at 09:00 UTC, 15 minutes long.
        assert_eq!(next[0].start, Utc.with_ymd_and_hms(2026, 1, 7, 9, 0, 0).unwrap().timestamp_millis());
        assert_eq!(next[0].end - next[0].start, 15 * 60 * 1000);
        // 12:30 in Paris is 11:30 UTC in winter.
        assert_eq!(next[1].start, Utc.with_ymd_and_hms(2026, 1, 7, 11, 30, 0).unwrap().timestamp_millis());
        assert_eq!(next[1].location.as_deref(), Some("Cafe"));
        assert!(next[2].all_day);
    }

    #[test]
    fn includes_an_event_in_progress() {
        let events = parse_events(ICS);
        let now = Utc.with_ymd_and_hms(2026, 1, 7, 9, 5, 0).unwrap();
        assert_eq!(upcoming(&events, now)[0].title, "Standup");
    }
}
