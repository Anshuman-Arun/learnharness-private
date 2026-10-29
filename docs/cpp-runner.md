# Isolated C++ execution

Requires Node 26, Docker and the pinned official GCC image. Run the worker on the same machine as LearnHarness (Docker Desktop works on Windows):

```sh
docker pull gcc@sha256:435c3cbc2ad1c25fbc1684c367808ff0ca2035a1bed56734a40165ab5cd7e3bd
node runner/cpp-service.mjs
```

The worker binds `127.0.0.1:3213`. It creates a private per-user local token file; the app reads that same file. Optional `LH_CPP_RUNNER_TOKEN_FILE` selects another private path for both processes; `LH_CPP_RUNNER_URL` selects another loopback address for the app. Tokens are not printed or sent to the browser. Do not expose the worker to a LAN or reverse proxy. The image is downloaded and digest-verified by Docker; no compilation falls back to host execution.

Each request creates a disposable non-root container: no network, no host mounts, read-only root filesystem, private temporary files, all capabilities dropped, no new privileges, 512 MB memory, one CPU, 64 processes, bounded file/output sizes, and separate compile/run time limits. Container cleanup runs on success, failure and cancellation; an idle container also exits after 60 seconds if the worker crashes. At most two requests run concurrently. The worker has Docker access, so run it only as a trusted local service.

C++20 compilation uses warnings and optional address/undefined-behavior sanitizers. Standard input and source are passed over stdin without source interpolation into shell commands. Test cases compare output after normalizing Windows line endings and trailing whitespace. These are learning checks, not an anti-cheat system for public submissions. Forced termination and resource failures remain distinct from confirmed timeouts.

Execution reports, the source snapshot, input and checks persist in `LH_DATA_DIR/training/cpp-run`. Sending a report to the tutor includes its corresponding source; editing later does not rewrite old evidence.

The API/report vocabulary adapts upstream LearnHarness PR #241 (AGPL-3.0). Its root/systemd runner was replaced with container execution to work on this cloud machine and Docker Desktop.
