{{- define "t4-cluster.name" -}}
t4-cluster
{{- end -}}

{{- define "t4-cluster.fullname" -}}
{{- if contains "t4-cluster" .Release.Name -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-t4-cluster" .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}

{{- define "t4-cluster.labels" -}}
app.kubernetes.io/name: {{ include "t4-cluster.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/part-of: t4-cluster
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" }}
{{- end -}}

{{- define "t4-cluster.selectorLabels" -}}
app.kubernetes.io/name: {{ include "t4-cluster.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

{{- define "t4-cluster.image" -}}
{{- printf "%s@%s" .repository .digest -}}
{{- end -}}
