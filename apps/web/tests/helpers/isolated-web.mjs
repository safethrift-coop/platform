import { mkdtemp, cp, symlink, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// A source snapshot avoids competing with a user's Next dev lock/build output.
export async function isolatedWeb() {
  const source = fileURLToPath(new URL("../..", import.meta.url));
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "safethrift-web-test-"),
  );
  try {
    for (const file of [
      "src",
      "public",
      "package.json",
      "tsconfig.json",
      "postcss.config.mjs",
    ])
      await cp(path.join(source, file), path.join(directory, file), {
        recursive: true,
      });
    await symlink(
      path.join(source, "node_modules"),
      path.join(directory, "node_modules"),
      "dir",
    );
    await writeFile(
      path.join(directory, "next.config.mjs"),
      "export default { devIndicators: false };\n",
    );
    return {
      directory,
      close: () =>
        rm(directory, {
          recursive: true,
          force: true,
          maxRetries: 10,
          retryDelay: 200,
        }),
    };
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}
