import * as vscode from "vscode";

import fs = require("fs");
import axios from "axios";

import { updateStatusBarItem } from "./statusbar";

export class DEKUConfig
{
	public static path = "~/chromeos/lp/deku/";
	public static workdir = this.path+"workdir/";
	public static address = "localhost";
	public static port = 2233;
}

export class InspectFunction {
	constructor(public file: string, public fun: string, public pattern: string) {
	}
}

export class InspectFiles {
	private file = DEKUConfig.workdir+"tracefile";
	public inspections: InspectFunction[] = [];

	public read() {
		if (!fs.existsSync(this.file))
			return;
		const buffer = fs.readFileSync(this.file, "utf-8");
		buffer.split("\n").forEach((line) => {
			console.log(line);
			const regexp = new RegExp("^([\\w/\\.-]+):(\\w+):(.+)$", "g");
			const match = regexp.exec(line);
			if (match != null) {
				this.inspections.push({ file: match[1], fun: match[2], pattern: match[3] });
			}
		});
	}
	public save() {
		let content = "";
		this.inspections.forEach((val) => {
			content += val.file + ":" + val.fun + ":" + val.pattern + "\n";
		});
		fs.writeFileSync(this.file, content);
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

export async function execDekuDeploy() {
	updateStatusBarItem(true);

	vscode.window.withProgress({
		location: vscode.ProgressLocation.Notification,
		title: "Applying inspection...",
		cancellable: false
	}, (progress, token) => {
		// setTimeout(() => {
		// 	progress.report({ increment: 10, message: "long running! - still going..." });
		// }, 1000);

		const p = new Promise<void>(resolve => {
			try {
				axios
				.get("http://localhost:8090")
				.then(function (response) {
					resolve();
					updateStatusBarItem(false);
					const text = response.data;
					console.log("DEKU reponse:\n" + text);
					const lines = text.split('\n');
					let result: string = lines[lines.length - 1];
					if (result == "" && lines.length > 1)
						result = lines[lines.length - 2];
					if (result.indexOf("[0;") == 1)
						result = result.substring(7, result.length - 4);
					if (result.includes("successfully") || result.includes("done"))
						vscode.window.showInformationMessage(result);
					else if (result.includes("No modules need to upload"))
						vscode.window.showInformationMessage("No changes detected since last run");
					else
						vscode.window.showErrorMessage("An error has occurred when performed DEKU Apply. See the logs for details.");
				});
			} catch (error) {
				resolve();
				updateStatusBarItem(false);
				console.error(error);
			}
		});
		return p;
	});
}