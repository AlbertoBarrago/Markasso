output "dashboard_url" {
  description = "URL of the Markasso Web Traffic dashboard"
  value       = "${trimsuffix(var.grafana_url, "/")}/d/${grafana_dashboard.web_traffic.uid}"
}

output "folder_url" {
  description = "URL of the Markasso folder in Grafana"
  value       = grafana_folder.markasso.url
}
