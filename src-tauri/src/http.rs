pub fn transport_error(error: reqwest::Error) -> String {
    if error.is_timeout() {
        "Steam API 请求超时".to_string()
    } else {
        "Steam API 请求失败".to_string()
    }
}

pub fn status_error(status: reqwest::StatusCode) -> String {
    format!("Steam API 请求失败：HTTP {}", status.as_u16())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn status_error_contains_only_the_status_code() {
        assert_eq!(
            status_error(reqwest::StatusCode::UNAUTHORIZED),
            "Steam API 请求失败：HTTP 401",
        );
    }

    #[test]
    fn non_timeout_transport_errors_use_a_constant_message() {
        let error = reqwest::Client::new()
            .get("not a valid URL?key=secret-value")
            .build()
            .unwrap_err();
        let message = transport_error(error);
        assert_eq!(message, "Steam API 请求失败");
        assert!(!message.contains("secret-value"));
    }
}
