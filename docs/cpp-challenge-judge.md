# C++ challenge judge

The workspace includes three bounded quant-coding challenges: collision-pair counts, streaming top-k with duplicates, and numerically stable sample variance. Statements define input/output contracts and provide a public example. Hidden checks cover empty/singleton inputs, repeated/negative values, boundary choices and large-offset variance data.

Judge current source sends the current frozen files to the same isolated C++20 Docker worker used by ordinary runs. Cases come from the server; client-supplied case overrides are ignored. Each case runs in a fresh program process. The judge reports passed/failed checks, compiler diagnostics and the source hash, and stores the exact files with the result. Cancellation uses the existing abort/cleanup mechanism.

Hidden stdin can be echoed to stdout or appear in runtime/sanitizer diagnostics. Those streams are redacted before reports are stored or returned; example output remains visible. Top-level runtime streams are also removed. This is a local practice feature, not an anti-cheating boundary: source code remains inspectable and passing finite examples cannot prove time complexity.

Saved reports can be staged in a tutor session with the exact code that ran. Later editor changes do not alter them. Hidden inputs, expected outputs and runtime streams do not enter that handoff.

Start `npm run cpp:runner` with Docker and the digest-pinned compiler image as documented in `docs/cpp-runner.md`. `npm run test:cpp-challenges` exercises actual isolated general solutions, example-hardcoded wrong code, and hidden-input echo redaction through the running local worker. It requires that worker, separate from deterministic unit tests.
