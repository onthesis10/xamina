use axum_prometheus::{metrics_exporter_prometheus::PrometheusHandle, PrometheusMetricLayer};

pub fn build_metrics_layer() -> (PrometheusMetricLayer<'static>, PrometheusHandle) {
    PrometheusMetricLayer::pair()
}
