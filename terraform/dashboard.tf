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
      },
      {
        id         = 4
        title      = "Tool usage"
        type       = "barchart"
        gridPos    = { h = 8, w = 12, x = 0, y = 18 }
        datasource = { type = "loki", uid = data.grafana_data_source.loki.uid }
        targets = [{
          expr  = "sum by (event_data_tool) (count_over_time({service_name=\"markasso-web\", kind=\"event\"} | logfmt | event_name=\"tool_selected\" [$__range]))"
          refId = "A"
        }]
      },
      {
        id         = 5
        title      = "Elements created (by type)"
        type       = "barchart"
        gridPos    = { h = 8, w = 12, x = 12, y = 18 }
        datasource = { type = "loki", uid = data.grafana_data_source.loki.uid }
        targets = [{
          expr  = "sum by (event_data_element_type) (count_over_time({service_name=\"markasso-web\", kind=\"event\"} | logfmt | event_name=\"element_created\" [$__range]))"
          refId = "A"
        }]
      },
      {
        id         = 6
        title      = "Undo / Redo usage"
        type       = "timeseries"
        gridPos    = { h = 8, w = 12, x = 0, y = 26 }
        datasource = { type = "loki", uid = data.grafana_data_source.loki.uid }
        targets = [{
          expr  = "sum by (event_name) (rate({service_name=\"markasso-web\", kind=\"event\"} | logfmt | event_name=~\"undo_used|redo_used\" [5m]))"
          refId = "A"
        }]
      },
      {
        id         = 7
        title      = "Feature usage (export / share / palette)"
        type       = "barchart"
        gridPos    = { h = 8, w = 12, x = 12, y = 26 }
        datasource = { type = "loki", uid = data.grafana_data_source.loki.uid }
        targets = [{
          expr  = "sum by (event_name) (count_over_time({service_name=\"markasso-web\", kind=\"event\"} | logfmt | event_name=~\"export_used|share_link_created|command_palette_used\" [$__range]))"
          refId = "A"
        }]
      },
      {
        id         = 8
        title      = "Avg active session duration (min)"
        type       = "stat"
        gridPos    = { h = 6, w = 12, x = 0, y = 34 }
        datasource = { type = "loki", uid = data.grafana_data_source.loki.uid }
        targets = [{
          expr  = "avg(sum by (session_id) (count_over_time({service_name=\"markasso-web\", kind=\"event\"} | logfmt | event_name=\"session_heartbeat\" [$__range]))) * 0.5"
          refId = "A"
        }]
      }
    ]
  })
}
