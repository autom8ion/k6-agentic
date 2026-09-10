# Distributed load testing with k6-operator

Runs `tests/rest/load.ts` across multiple pods in a Kubernetes cluster via
[k6-operator](https://github.com/grafana/k6-operator), for load generation
beyond what one machine can produce. This is a manual, opt-in workflow — it
needs a real cluster and the operator installed, so (like `load`/`stress`/
`soak`/`spike` generally in this repo) it's never wired into CI.

**Scope: REST only.** GraphQL's demo target (countries.trevorblades.com)
rate-limits at ~50-60 req/min — distributing VUs across pods would blow
through that immediately, so it's not a responsible target here. DB tests
need a cluster-reachable Postgres and xk6-sql's extension resolution working
from every pod, which is more setup than a first k8s example warrants.
Both could be added the same way (custom image + `TestRun`) if a real need
comes up.

The test script itself is unchanged — this reuses `tests/rest/load.ts`,
`src/config/scenarios.ts`, and the REST client exactly as they run locally.
Only the image build and the `TestRun` CR are new.

## Prerequisites

- A Kubernetes cluster and `kubectl` pointed at it (a local cluster like
  `kind` or Docker Desktop's Kubernetes works fine).
- [k6-operator](https://grafana.com/docs/k6/latest/set-up/set-up-distributed-k6/install-k6-operator/)
  installed in the cluster, e.g.:
  ```bash
  helm repo add grafana https://grafana.github.io/helm-charts
  helm install k6-operator grafana/k6-operator -n k6-operator-system --create-namespace
  ```

## Run it

```bash
npm run k8s:build   # docker build -t k6-agentic-rest:local -f k8s/Dockerfile .
npm run k8s:apply   # kubectl apply -f k8s/configmap.yaml -f k8s/testrun.yaml
```

If your cluster can't pull a locally-built image directly (only `kind
load docker-image` / Docker Desktop's built-in registry can), push
`k6-agentic-rest:local` somewhere it can reach and update
`spec.runner.image` in `k8s/testrun.yaml` before applying.

Watch it run:

```bash
kubectl get pods -l 'k6_cr=k6-agentic-rest-load'
kubectl logs -f -l 'k6_cr=k6-agentic-rest-load,runner=true'
```

Tear down:

```bash
npm run k8s:delete
```

## Tuning

`spec.parallelism` in `k8s/testrun.yaml` sets the number of runner pods.
k6-operator splits `tests/rest/load.ts`'s scenario across them, so raising
parallelism without adjusting the scenario's VUs/arrival-rate in
`src/config/scenarios.ts` just multiplies total load — treat the two
together, the same way you would when reasoning about scenario intensity for
a single local run (see the root `README.md`'s "Test types" section).

## Streaming results to Grafana

Runner pods can write to the same Prometheus/Grafana stack `npm run
dashboard:up` starts, if the cluster can reach it (e.g. `host.docker.internal`
on Docker Desktop, or a `Service` in-cluster). Add to `k8s/testrun.yaml`:

```yaml
spec:
  arguments: --out experimental-prometheus-rw
  runner:
    env:
      - name: K6_PROMETHEUS_RW_SERVER_URL
        value: http://host.docker.internal:9090/api/v1/write
```
