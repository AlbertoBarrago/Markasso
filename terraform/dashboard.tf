# Faro (RUM) ships web traffic/error events to this stack's hosted Loki,
# which Grafana Cloud auto-provisions as a read-only datasource (can't be
# created/managed via the API) — we just look it up by name.
data "grafana_data_source" "loki" {
  name = var.loki_datasource_name
}

resource "grafana_folder" "markasso" {
  title = var.folder_title
}

resource "grafana_dashboard" "web_traffic" {
  folder = grafana_folder.markasso.id

  config_json = jsonencode({
    title = "Markasso Web Traffic"
    tags  = ["markasso", "faro", "rum"]
    time = {
      from = "now-24h"
      to   = "now"
    }
    panels = [
      {
        id         = 1
        title      = "Page views (rate)"
        type       = "timeseries"
        gridPos    = { h = 8, w = 12, x = 0, y = 0 }
        datasource = { type = "loki", uid = data.grafana_data_source.loki.uid }
        targets = [{
          expr  = "sum(rate({service_name=\"markasso-web\", kind=\"event\"} | logfmt | event_name=~\"session_start|session_resume\" [5m]))"
          refId = "A"
        }]
      },
      {
        id         = 2
        title      = "JS errors"
        type       = "timeseries"
        gridPos    = { h = 8, w = 12, x = 12, y = 0 }
        datasource = { type = "loki", uid = data.grafana_data_source.loki.uid }
        targets = [{
          expr  = "sum(rate({service_name=\"markasso-web\", kind=\"event\"} | logfmt | event_name=~\"exception|faro.error\" [5m]))"
          refId = "A"
        }]
      },
      {
        id         = 3
        title      = "Recent sessions"
        type       = "logs"
        gridPos    = { h = 10, w = 24, x = 0, y = 8 }
        datasource = { type = "loki", uid = data.grafana_data_source.loki.uid }
        targets = [{
          expr  = "{service_name=\"markasso-web\", kind=\"event\"} | logfmt | event_name=\"session_start\" or event_name=\"session_resume\""
          refId = "A"
        }]
      }
    ]
  })
}
