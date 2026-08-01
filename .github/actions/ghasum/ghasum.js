// SPDX-License-Identifier: Apache-2.0

import { spawnSync } from "node:child_process";
import { appendFile, mkdtemp } from "node:fs/promises";
import { arch, platform, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { env, exit } from "node:process";

// --- Constants ---------------------------------------------------------------
const CHECKSUM_FILE = "checksums-sha512.txt";
const REPOSITORY = "chains-project/ghasum";

// --- Context -----------------------------------------------------------------
const ARCH = arch().toLowerCase();
const OS = platform().toLowerCase();

const JOB = env.GITHUB_JOB;
const SHA = env.GITHUB_WORKFLOW_SHA;
const OWNER = env.GITHUB_REPOSITORY.split("/")[0];
const PROJECT = env.GITHUB_REPOSITORY.split("/")[1];
const WORKFLOW = env.GITHUB_WORKFLOW_REF.split(/[/@]/g).slice(2,5).join("/");

let cache;
switch (OS) {
case "darwin": cache = "/Users/runner/work/_actions"; break;
case "linux":  cache = "/home/runner/work/_actions";  break;
case "win32":  cache = "C:\\a\\_actions";             break;
}

let archive;
switch (`${OS}-${ARCH}`) {
case "darwin-arm64": archive = "ghasum_darwin_arm64.tar.gz"; break;
case "darwin-x64":   archive = "ghasum_darwin_amd64.tar.gz"; break;
case "linux-arm64":  archive = "ghasum_linux_arm64.tar.gz";  break;
case "linux-x64":    archive = "ghasum_linux_amd64.tar.gz";  break;
case "win32-arm64":  archive = "ghasum_windows_arm64.zip";   break;
case "win32-x64":    archive = "ghasum_windows_amd64.zip";   break;
}

console.log("OS     ", OS)
console.log("ARCH   ", ARCH)
console.log("cache  ", cache)
console.log("archive", archive)

// --- Inputs ------------------------------------------------------------------
const CHECKSUM = env.INPUT_CHECKSUM.replace(/^sha256:/, "");
const MODE = env.INPUT_MODE;
const VERSION = env.INPUT_VERSION;

// --- Script ------------------------------------------------------------------
try {
	if (!["install", "update", "verify"].includes(MODE)) {
		throw new Error(`mode must be 'install' or 'verify', got: ${MODE}`);
	}

	const cwd = await mkdtemp(join(tmpdir(), 'ghasum-'));
	exec(["mkdir", "-p", cwd]);
	exec(["gh", "release", "download", VERSION, "--repo", REPOSITORY, "--pattern", CHECKSUM_FILE], { cwd });
	exec(["shasum", "-a", "256", "-c", "-"], { cwd, input: `${CHECKSUM}  ${CHECKSUM_FILE}` });
	exec(["gh", "release", "download", VERSION, "--repo", REPOSITORY, "--pattern", archive], { cwd });
	exec(["shasum", "--check", "--ignore-missing", CHECKSUM_FILE], { cwd });
	exec(["tar", "-xf", archive], { cwd });

	switch (MODE) {
	case "install":
		await appendFile(env.GITHUB_PATH, cwd);
		break;
	case "update":
		exec(
			[join(cwd, "ghasum"), "update", "-cache", cache, "-no-evict"],
			{ cwd: join(cache, OWNER, PROJECT, SHA) },
		);
		break;
	case "verify":
		exec(
			[join(cwd, "ghasum"), "verify", "-cache", cache, "-no-evict", "-offline", `${WORKFLOW}:${JOB}`],
			{ cwd: join(cache, OWNER, PROJECT, SHA) },
		);
		break;
	}

	// TODO: expose

	exit(0);
} catch (error) {
	console.error(`::error::${error}`);
	nuke();
	exit(1);
}

// --- Functions ---------------------------------------------------------------
function exec(command, opts) {
	console.info(command.join(" "));

	const cmd = command[0];
	const args = command.slice(1, command.length);
	const { status } = spawnSync(cmd, args, { stdio: ["pipe", "inherit", "inherit"], ...opts });
	if (status !== 0) {
		throw new Error("Command failed");
	}
}

function nuke() {
	exec(["rm", "-rf", cache]);
}
