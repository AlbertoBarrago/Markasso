variable "grafana_url" {
  description = "Base URL of the Grafana Cloud stack"
  type        = string
  default     = "https://cordialpalm2360.grafana.net/"
}

variable "grafana_auth" {
  description = "Grafana Cloud service account token (set via GRAFANA_AUTH env var, never committed)"
  type        = string
  sensitive   = true
}

variable "folder_title" {
  description = "Title of the Grafana folder holding Markasso dashboards"
  type        = string
  default     = "Markasso"
}

variable "loki_datasource_name" {
  description = "Name of the Loki datasource auto-provisioned by Grafana Cloud for this stack"
  type        = string
  default     = "grafanacloud-cordialpalm2360-logs"
}
