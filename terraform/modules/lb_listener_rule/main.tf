resource "aws_lb_listener_rule" "static" {
  listener_arn = var.listener_arn
  priority     = var.priority

  action {
    type             = "forward"
    target_group_arn = var.lb_target_group_arn
  }

  condition {
    path_pattern {
      values = var.path_pattern
    }
  }

}