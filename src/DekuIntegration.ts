import * as vscode from "vscode";
import * as CRC32 from "crc-32";

import fs = require("fs");
import axios from "axios";

import { Database } from "./db";
import * as outline from "./outline";
import { updateStatusBarItem } from "./statusbar";

export class DEKUConfig
{
	public path = "";
	public board = "";
	public workdir = "";
	public address = "";
	public port = 0;

	public constructor()
	{
		this.loadConfig();
	}

	private loadConfig()
	{
		let configuration = vscode.workspace.getConfiguration("dekuinspect");
		if (configuration.get("path") != "") {
			this.path = configuration.get("path") + "/";
		}
		this.workdir = this.path + "workdir" + "/";
		this.board = configuration.get("board") || "";
		if (this.board != null)
			this.workdir = this.path + "workdir_" + this.board + "/";
		this.address = configuration.get("target")!;
		this.port = Number.parseInt(configuration.get<string>("sshPort")!);
	}
}

export class InspectFunction {
	constructor(public file: string, public fun: string, public pattern: string) {
	}
}

export class InspectFiles {
	public inspections: InspectFunction[] = [];

	public inspectFile(): string {
		const conf = new DEKUConfig();
		return conf.workdir+"tracefile";
	}

	public read() {
		const file = this.inspectFile();
		if (!fs.existsSync(file))
			return;
		const buffer = fs.readFileSync(file, "utf-8");
		buffer.split("\n").forEach((line) => {
			const regexp = new RegExp("^([\\w/\\.-]+):(\\w+):(.+)$", "g");
			const match = regexp.exec(line);
			if (match != null) {
				this.inspections.push({ file: match[1], fun: match[2], pattern: match[3] });
			}
		});
	}
	public save() {
		const file = this.inspectFile();
		let content = "";
		this.inspections.forEach((val) => {
			content += val.file + ":" + val.fun + ":" + val.pattern + "\n";
		});
		fs.writeFileSync(file, content);
	}

	public addInspect(file: string, fun: string, pattern: string) {
		this.inspections.push({ file, fun, pattern });
		this.save();
	}

	public removeInspect(file: string, fun: string) {
		const idx = this.inspections.findIndex((inspect) => {
			return inspect.file == file && inspect.fun == fun;
		});
		if (idx)
			this.inspections.splice(idx, 1);
		else
			console.log("Error: Can't find inspection for " + file + ":" + fun);
		this.save();
	}

	public isInspected(file: string, fun: string) {
		const idx = this.inspections.findIndex((inspect) => {
			return inspect.file == file && inspect.fun == fun;
		});
		return idx != -1;
	}
}

export class Deku
{
	private DB!: Database;
	public showInspectsForCurrentEditor = () =>{};
	public refreshSideViews = () =>{};
	public inspects!: outline.LensInspectionRoot;

	public async init(DB: Database) {
		this.DB = DB;
		const conf = new DEKUConfig();
		const configuration = vscode.workspace.getConfiguration("dekuinspect");
		if (conf.path == "" || conf.board == "")
		{
			vscode.window.showInformationMessage("Please provide path to the DEKU in the settings.");

			if (true)
				return;
			const options: vscode.OpenDialogOptions = {
				canSelectFiles: false,
				canSelectFolders: true,
				canSelectMany: false,
				openLabel: 'Select',
				title: 'Please select the path to the DEKU'
			};

			vscode.window.showOpenDialog(options).then(fileUri => {
				if (fileUri && fileUri[0]) {
					configuration.update('path', fileUri[0].fsPath);
					this.runListenenServer(0);
				} else {
					vscode.window.showWarningMessage("DEKU is not initialized.");
				}
			});
		}
		else if (conf.board == "")
		{
			vscode.window.showInformationMessage("Please provide Chromebook board name in the settings.");
		}
		else if (conf.address == "")
		{
			vscode.window.showInformationMessage("Please provide address to the device.");
		}
		else
		{
			this.runListenenServer(0);
		}
	}

	public reload() {
		vscode.window.showInformationMessage("Please reload VSCode to apply new settings.");
	}

	public async execDekuDeploy(isInspection: boolean) {
		updateStatusBarItem(true);
		const conf = new DEKUConfig();

		vscode.window.withProgress({
			location: vscode.ProgressLocation.Notification,
			title: "Applying inspection...",
			cancellable: false
		}, () => {
			const p = new Promise<void>(resolve => {
				axios
				.get("http://localhost:8090/deploy?board="+conf.board+"&target=localhost&port="+conf.port, { timeout: 15000 })
				.then(function (response) {
					const text = response.data;
					console.log("Response from inspectd:\n" + text);
					const lines = text.split('\n');
					let result: string = lines[lines.length - 1];
					if (result == "" && lines.length > 1)
						result = lines[lines.length - 2];
					if (result.indexOf("[0;") == 1)
						result = result.substring(7, result.length - 4);
					if (result.includes("successfully") || result.includes("done")) {
						if (isInspection)
							vscode.window.showInformationMessage("Inspection applied successfuly");
						else
							vscode.window.showInformationMessage(result);
					} else if (result.includes("No modules need to upload"))
						vscode.window.showInformationMessage("No changes detected since last run");
					else
						vscode.window.showErrorMessage("An error has occurred when performed DEKU Apply. See the logs for details.");
				}).catch(reason => {
						vscode.window.showErrorMessage(`Cannot connect to DEKU Daemon (${reason}).`);
						console.error(`Cannot connect to DEKU Daemon (${reason}).`);
				})
				.finally(() => {
					resolve();
					updateStatusBarItem(false);
				});
			});
			return p;
		});
	}

	private parseInspectLine(line: string) : [boolean, boolean]{
		let refreshInspects = false;
		let refreshOutlineTree = false;
		// console.log(line);
		let regexp = new RegExp("^\\[(\\d+)\\] DEKU Inspect: (.+):(\\d+) (.+ =)? (.+)$", "g");
		let match = regexp.exec(line);
		if (match != null) {
			let key = "";
			let msg = "";
			const file = match[2];
			const line = Number.parseInt(match[3]);
			if (match.length == 6) {
				key = match[4];
				msg = match[5];
				key = key.substring(0, key.length - 2);
				this.DB.addLineInspect(file, line, key, msg);
				if (msg == "0x0000000000000000")
					msg = "NULL";
				msg = key + ": " + msg;
			}
			else {
				msg = match[4];
				this.DB.addLineInspect(file, line, msg);
			}
			outline.addInspectInformation(this.inspects, file, line, msg);
			refreshInspects = true;
			return [refreshInspects, refreshOutlineTree];
		}
		regexp = new RegExp("^\\[(\\d+)\\] DEKU Inspect: Function: (.+):(.+):(\\d+):(\\d+):(.+)$", "g");
		match = regexp.exec(line);
		if (match != null) {
			const time = Number.parseInt(match[1]);
			const file = match[2];
			const funName = match[3];
			const line = Number.parseInt(match[4]);
			const lineEnd = Number.parseInt(match[5]);
			const calledFrom = match[6];
			const func = this.inspects.getOrCreateFunc(file, funName, line, lineEnd);
			const timeStr = (time/1000000000.0).toFixed(6);
			func.times.push(new outline.LensInspectionAtTime(func, time, timeStr));
			if (func.showInspectFor.time == 0)
				func.showInspectFor = func.times[0];
			else
				func.times[func.times.length - 1].timeDiff = func.times[func.times.length - 2].time - time;
			func.times[func.times.length - 1].calledFrom = calledFrom;
			this.DB.startTrial(file, line, lineEnd, funName, time, calledFrom);
			return [refreshInspects, refreshOutlineTree];
		}
		regexp = new RegExp("^\\[(\\d+)\\] DEKU Inspect: Function Pointer: (.+):(\\d+):(.+):(.+)$", "g");
		match = regexp.exec(line);
		if (match != null) {
			const file = match[2];
			const line = Number.parseInt(match[3]);
			const varName = match[4];
			const val = match[5];
			const msg = varName + ": " + val;
			outline.addInspectInformation(this.inspects, file, line, msg);
			this.DB.addLineInspect(file, line, varName, val);
			refreshInspects = true;
			return [refreshInspects, refreshOutlineTree];
		}
		regexp = new RegExp("^\\[(\\d+)\\] DEKU Inspect: Function return value: (.+):(\\d+):(.+) (.+) = (.+)$", "g");
		match = regexp.exec(line);
		if (match != null) {
			let time = Number.parseInt(match[1]);
			const file = match[2];
			const line = Number.parseInt(match[3]);
			const funName = match[4];
			let msg = "return " + match[5] + ": " + match[6];
			if (match[5] == "true" || match[5] == "false")
				msg = "return " + match[5];
			outline.addInspectInformation(this.inspects, file, line, msg);
			const func = this.inspects.getFunction(file, funName);
			const currFunTime = func!.currentTime();
			currFunTime.returnAtLine = line;
			currFunTime.returnTime = time;
			const t1 = currFunTime.time;
			time -= t1;
			let textTime = (time / 1000).toFixed(0) + "µs";
			if (time > 1000000000)
				textTime = (time / 1000000000).toFixed(3) + "s";
			else if (time > 1000000)
				textTime = (time / 1000000).toFixed(3) + "ms";

			outline.addInspectInformation(this.inspects, file, func!.range[0], "execute time: "+textTime);
			this.DB.functionReturn(file, funName, time, line, match[5], match[6]);
			refreshInspects = true;
			return [refreshInspects, refreshOutlineTree];
		}
		regexp = new RegExp("^\\[(\\d+)\\] DEKU Inspect: Function (return|end): (.+):(\\d+):(.+)$", "g");
		match = regexp.exec(line);
		if (match != null) {
			let time = Number.parseInt(match[1]);
			const file = match[3];
			const funName = match[5];
			const func = this.inspects.getFunction(file, funName);
			const currFunTime = func!.currentTime();
			let line = undefined;
			if (match[2] == "return") {
				line = Number.parseInt(match[4]);
				outline.addInspectInformation(this.inspects, file, line, "return here");
				currFunTime.returnAtLine = line;
			}
			currFunTime.returnTime = time;
			const t1 = currFunTime.time;
			time -= t1;
			let textTime = (time / 1000).toFixed(0) + "µs";
			if (time > 1000000000)
				textTime = (time / 1000000000).toFixed(3) + "s";
			else if (time > 1000000)
				textTime = (time / 1000000).toFixed(3) + "ms";

			outline.addInspectInformation(this.inspects, file, func!.range[0], "execute time: "+textTime);
			this.DB.functionReturn(file, funName, time, line);
			refreshInspects = true;
			return [refreshInspects, refreshOutlineTree];
		}
		regexp = new RegExp("^\\[(\\d+)\\] DEKU Inspect: Function stacktrace:(.+):(\\w+) (.+)$", "g");
		match = regexp.exec(line);
		if (match != null) {
			const file = match[2];
			const funName = match[3];
			const func = this.inspects.getFunction(file, funName);
			const text = match[4];
			const currFunTime = func!.currentTime();
			currFunTime!.stacktraceSum = CRC32.str(text);
			text.substring(0, text.length - 2).split(',').forEach(line => {
				line = line.split(" ")[0];
				if (currFunTime!.stacktrace.length != 0 || line.split("+")[0] != funName)
					currFunTime!.stacktrace.push(line);
			});
			this.DB.addStacktrace(file, funName, text, currFunTime!.stacktraceSum);
			refreshOutlineTree = true;
			return [refreshInspects, refreshOutlineTree];
		}
		console.log("Invalid DEKU Inspect line: " + line);
		return [refreshInspects, refreshOutlineTree];
	}

	private async runListenenServer(iter: number) {
		const conf = new DEKUConfig();
		const cproc = await require('child_process');
		const spawn = cproc.spawn;

		const args = ["-i", conf.workdir + "/testing_rsa",
					"-o StrictHostKeyChecking no", "-o UserKnownHostsFile=/dev/null",
					"-o ControlPath=/tmp/ssh-deku-%r@%h:%p", "-o ControlMaster=auto",
					"-tt", conf.address, "-p", conf.port,
					"while true; do cat /sys/kernel/debug/deku/inspect; sleep 1; done"];
		const child = spawn("ssh", args);

		const buffer = Buffer.alloc(1024 * 100);
		let bufferIndex = 0;
		child.stdout.on('data', (data: Buffer) => {
			let refreshInspects = false;
			let refreshOutlineTree = false;
			for (let i = 0; i < data.length; i++) {
				if (data[i] == 10) {
					const line = buffer.slice(0, bufferIndex).toString().trim();
					[refreshInspects, refreshOutlineTree] = this.parseInspectLine(line);
					bufferIndex = 0;
					continue;
				}
				buffer[bufferIndex++] = data[i];
			}
			if (refreshInspects) {
				this.refreshSideViews();
				this.showInspectsForCurrentEditor();
			} else if (refreshOutlineTree) {
				this.refreshSideViews();
			}
		});

		child.stderr.on('data', function (data: string) {
			if (data.includes("Warning: Permanently added ")) {
				vscode.window.showInformationMessage("Connected to Chromebook succesfully");
				iter = 0;
				return;
			}
			console.log('stderr: ' + data);
		});

		child.on('close', function (code: string) {
			if (iter == 0) {
				vscode.window.showErrorMessage("Disconnected from Chromebook");
				console.log('exit code: ' + code);
			}
			// setTimeout(runListenenServer, 1000 * iter <= 3 ? 1 : 10, iter + 1);
		});
	}
}