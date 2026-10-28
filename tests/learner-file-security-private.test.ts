import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {describe,it} from "node:test";
import {guardSourcePath, isPrivateSourcePath, walkFiles} from "../src/agent/tools/fs-shared.ts";

describe("adversarial local learner-file security policy", () => {
  it("rejects app secrets, common credential folders, and hidden env files", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(),"lh-file-secrets-"));
    const oldAuth = process.env.LH_AUTH_FILE;
    const oldData = process.env.LH_DATA_DIR;
    try {
      const pub = path.join(tmp,"coursework");
      const vault = path.join(tmp,"private-app");
      const env = path.join(pub,".env.local");
      const notes = path.join(pub,"lecture.md");
      const ssh = path.join(pub,".ssh");
      await fs.mkdir(pub);
      await fs.mkdir(vault);
      await fs.mkdir(ssh);
      await fs.writeFile(notes,"This is mathematical coursework");
      await fs.writeFile(env,"SECRET=never-expose");
      await fs.writeFile(path.join(vault,"data.json"),"sensitive session records");
      await fs.writeFile(path.join(ssh,"id_rsa"),"private-key");
      process.env.LH_AUTH_FILE = path.join(vault,"auth.json");
      process.env.LH_DATA_DIR = path.join(vault,"data");
      assert.equal(await guardSourcePath(notes),await fs.realpath(notes));
      for(const file of [env,path.join(vault,"data.json"),path.join(ssh,"id_rsa")]){
        await assert.rejects(guardSourcePath(file),/Access denied/);
      }
      assert.equal(isPrivateSourcePath(path.join(tmp,"auth.json")),true);
      assert.equal(isPrivateSourcePath(path.join(pub,".npmrc")),true);
      if (process.platform !== "win32") {
        assert.equal(isPrivateSourcePath("/proc/self/environ"),true);
        assert.equal(isPrivateSourcePath("/proc/self/fd/3"),true);
        assert.equal(isPrivateSourcePath("/run/secrets/oauth-token"),true);
        assert.equal(isPrivateSourcePath("/sys/kernel/debug"),true);
      }
      const found:string[] = [];
      await walkFiles(pub, (p) => {found.push(p);return false;});
      assert.deepEqual(found,[notes]);
      const link=path.join(pub,"link-to-vault");
      try {
        await fs.symlink(vault, link, process.platform==="win32"?"junction":"dir");
        await assert.rejects(guardSourcePath(link),/Access denied/);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EPERM") throw error;
      }
    } finally {
      if (oldAuth===undefined) delete process.env.LH_AUTH_FILE;
      else process.env.LH_AUTH_FILE=oldAuth;
      if (oldData===undefined) delete process.env.LH_DATA_DIR;
      else process.env.LH_DATA_DIR=oldData;
      await fs.rm(tmp,{recursive:true,force:true});
    }
  });

  it("blocks credential reads through each explicit file tool and PDF entry", async () => {
    const files: Array<[string,string]> = [
      ["src/agent/tools/read.ts","guardSourcePath"],
      ["src/agent/tools/ls.ts","guardSourcePath"],
      ["src/agent/tools/find.ts","guardSourcePath"],
      ["src/agent/tools/grep.ts","guardSourcePath"],
      ["src/agent/subagents/pdf-reader.ts","guardSourcePath"],
    ];
    for(const [file,guard] of files) {
      const source=await fs.readFile(path.join(process.cwd(),file),"utf8");
      assert.match(source,new RegExp(guard));
    }
  });
});
