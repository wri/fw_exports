container_port            = "80"
environment               = "production"
log_level                 = "info"
desired_count             = 2
auto_scaling_min_capacity = 2
auto_scaling_max_capacity = 15

auth_url         = "https://api.resourcewatch.org"
forms_api_url             = "https://api.resourcewatch.org/v1"
alerts_api_url   = "https://data-api.globalforestwatch.org"
s3_bucket                 = "forest-watcher-files"
s3_access_key_id          = "overridden_in_github_secrets"
s3_secret_access_key      = "overridden_in_github_secrets"

healthcheck_path = "/v1/fw_exports/healthcheck"
healthcheck_sns_emails = ["server@3sidedcube.com"]