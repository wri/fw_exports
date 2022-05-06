container_port            = "80"
environment               = "staging"
log_level                 = "info"
desired_count             = 1
auto_scaling_min_capacity = 1
auto_scaling_max_capacity = 15

healthcheck_path = "/v1/fw_exports/healthcheck"
healthcheck_sns_emails = ["server@3sidedcube.com"]