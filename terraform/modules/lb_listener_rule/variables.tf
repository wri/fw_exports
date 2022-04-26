variable "project_prefix" {
  type = string
}

variable "container_port" {
  type = number
}

variable "vpc_id" {
  type = string
}

variable "lb_target_group_arn" {
  type = string
}

variable "listener_arn" {
  type = string
}

variable "tags" {
  type = map(string)
}

variable "path_pattern" {
  type = list(string)
}

variable "priority" {
  type = number
}