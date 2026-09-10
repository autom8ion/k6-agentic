# Runner image for k6-operator distributed load tests (see k8s/README.md).
#
# This repo's test scripts are plain TypeScript run natively by k6 -- no
# bundler, no node_modules (see CLAUDE.md). k6-operator can't mount a
# multi-file project with relative imports via its ConfigMap script option
# (that's for single small script files), so instead we bake src/ and tests/
# straight into a custom runner image and point the TestRun CR's
# `script.localFile` at a path inside it. There is deliberately no `npm
# install` step here -- k6 never touches node_modules, in a container or not.
FROM grafana/k6:latest

COPY src/ /home/k6/src/
COPY tests/ /home/k6/tests/
