import os from "node:os";
import path from "node:path";
export const CPP_IMAGE = "gcc@sha256:435c3cbc2ad1c25fbc1684c367808ff0ca2035a1bed56734a40165ab5cd7e3bd";
export const tokenFile = () => process.env.LH_CPP_RUNNER_TOKEN_FILE ?? path.join(os.tmpdir(), `learnharness-cpp-${process.getuid?.() ?? "user"}`, "token");
