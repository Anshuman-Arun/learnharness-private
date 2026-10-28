import os from "node:os";
import path from "node:path";
export const tabletDirectory = () => path.join(os.tmpdir(), `learnharness-tablet-${process.getuid?.() ?? "user"}`);
export const tabletTokenFile = () => process.env.LH_TABLET_TOKEN_FILE ?? path.join(tabletDirectory(), "token");
export const tabletCaFile = () => process.env.LH_TABLET_CA_CERT_FILE ?? path.join(tabletDirectory(), "ca.pem");
