import { spawnSync } from 'node:child_process';
import { arch, platform } from "node:os";
import { env, exit } from "node:process";

// --- Constants ---------------------------------------------------------------
const CHECKSUM_FILE = "checksums-sha512.txt";
const REPOSITORY = "chains-project/ghasum";

// --- Context -----------------------------------------------------------------
const ARCH = arch().toLowerCase();
const OS = platform().toLowerCase();

const WORKFLOW = env.GITHUB_WORKFLOW_REF.replace(`${env.GITHUB_REPOSITORY}/`, "").split("@")[0];
const JOB = env.GITHUB_JOB;

let TMP;
switch (`${OS}-${ARCH}`) {
case "linux-arm64":   TMP = "ghasum_linux_arm64.tar.gz";  break;
case "linux-x64":     TMP = "ghasum_linux_amd64.tar.gz";  break;
case "macos-arm64":   TMP = "ghasum_darwin_arm64.tar.gz"; break;
case "macos-x64":     TMP = "ghasum_darwin_amd64.tar.gz"; break;
case "windows-arm64": TMP = "ghasum_windows_arm64.zip";   break;
case "windows-x64":   TMP = "ghasum_windows_amd64.zip";   break;
}

// --- Inputs ------------------------------------------------------------------
const CHECKSUM = env.INPUT_CHECKSUM.replace(/^sha256:/, "");
const MODE = env.INPUT_MODE;
const VERSION = env.INPUT_VERSION;

// --- Script ------------------------------------------------------------------
try {
	if (MODE !== "install" && MODE !== "verify") {
		throw new Error(`mode must be 'install' or 'verify', got: ${MODE}`);
	}

	const cwd = "/tmp/ghasum";
	exec(["mkdir", "-p", cwd]);
	exec(["gh", "release", "download", VERSION, "--repo", REPOSITORY, "--pattern", CHECKSUM_FILE], { cwd });
	exec(["shasum", "-a", "256", "-c", "-"], { cwd, input: `${CHECKSUM}  ${CHECKSUM_FILE}` });
	exec(["gh", "release", "download", VERSION, "--repo", REPOSITORY, "--pattern", TMP], { cwd });
	exec(["shasum", "--check", "--ignore-missing", CHECKSUM_FILE], { cwd });
	exec(["tar", "-xf", TMP], { cwd });

	if (MODE === "verify") {
		exec(["./ghasum", "verify", "-cache", "/home/runner/work/_actions", "-no-evict", "-offline", `${WORKFLOW}:${JOB}`], { cwd });
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
	switch (OS) {
	case "linux":
		exec(["rm", "-rf", "/home/runner/work/_actions"]);
		break;
	case "macos":
		exec(["rm", "-rf", "/Users/runner/work/_actions"]);
		break;
	case "windows":
		exec(["rm", "-rf", "C:\\a\\_actions", "D:\\a\\_actions"]);
		break;
	}
}
