container_port            = "80"
environment               = "dev"
log_level                 = "debug"
desired_count             = 1
auto_scaling_min_capacity = 1
auto_scaling_max_capacity = 5

healthcheck_path = "/v1/fw_exports/healthcheck"
healthcheck_sns_emails = ["server@3sidedcube.com"]