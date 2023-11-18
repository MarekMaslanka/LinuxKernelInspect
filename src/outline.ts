import * as vscode from "vscode";
import { EventEmitter, Event } from "vscode";
import * as path from 'path';
import { Ftrace, TracedFunction } from "./Ftrace";
import { Database } from "./db";

function genItemForTrial(time: number, returnTime: number, procName: string, trialId: number, funId: number): vscode.TreeItem {
	const strTime = (time / 1000000000).toFixed(6);
	const item = new vscode.TreeItem(
		"["+procName+"] "+strTime, vscode.TreeItemCollapsibleState.None
	);
	item.command = {
		command: 'kernelinspect.show_inspect_for_trial',
		arguments: [funId, trialId],
		title: 'Open FTP Resource',
		tooltip: 'Open FTP Resource1'
	};
	item.iconPath = path.join(__filename, '..', '..', 'resources', 'time.png');
	item.iconPath = new vscode.ThemeIcon('history');
	item.description = ((returnTime - time) / 1000000).toFixed(3)+"ms";
	// item.resourceUri = vscode.Uri.parse(item.fun.name+item.stacktraceSum+item.fun.name+"_AAA?"+item.timeDiff+"ms");

	return item;
}

export class InspectsTreeProvider implements vscode.TreeDataProvider<any> {

	private changeEvent = new EventEmitter<void>();
	private file = "";

	constructor(private db: Database) {
	}

	public get onDidChangeTreeData(): Event<void> {
		return this.changeEvent.event;
	}

	public refresh(file: string): any {
		this.file = file;
		this.changeEvent.fire();
	}

	getTreeItem(item: any): vscode.TreeItem {
		return item;
	}

	genTreeItem(funName: string, funId: string): vscode.TreeItem {
		const item = new vscode.TreeItem(
			funName,
			vscode.TreeItemCollapsibleState.Collapsed
		);
		item.id = "fun."+funName+"."+funId;
		item.iconPath = path.join(__filename, '..', '..', 'resources', 'func.png');
		item.iconPath = new vscode.ThemeIcon('json');
		return item;
	}

	getChildren(element?: any): Thenable<vscode.TreeItem[]> {
		return new Promise(resolve => {
			const list :vscode.TreeItem[] = [];
			const done = (_err: Error | null): void => {
				resolve(list);
			};
			if (element instanceof vscode.TreeItem && element.id?.startsWith("fun.")) {
				this.db.getTrials(element.id.split(".")[2], row => {
					list.push(genItemForTrial(row.time, row.return_time, row.proc_name, row.id, row.function_id));
				}, done);
			} else {
				this.db.getFuncs(this.file, row => {
					list.push(this.genTreeItem(row.name, row.fun_id));
				}, done);
			}
		});
	}
}

export class RegisteredInspectTreeProvider implements vscode.TreeDataProvider<any> {

	private changeEvent = new EventEmitter<void>();

	constructor(private db: Database) {
	}

	public get onDidChangeTreeData(): Event<void> {
		return this.changeEvent.event;
	}

	public refresh(): any {
		this.changeEvent.fire();
	}

	getTreeItem(item: any): vscode.TreeItem {
		return item;
	}

	genItemForFile(path: string): vscode.TreeItem {
		return new vscode.TreeItem(
			path,
			vscode.TreeItemCollapsibleState.Collapsed
		);
	}

	genItemForFunction(path: string, fun: string): vscode.TreeItem {
		const item = new vscode.TreeItem(path + " " + fun);
		item.command = {
			command: 'kernelinspect.open_file_fun',
			arguments: [path, fun],
			title: 'Open inspected function',
		};
		item.iconPath = new vscode.ThemeIcon('circle-outline');
		item.contextValue = "functionInspect";
		// item.resourceUri = vscode.Uri.parse(item.file+"_AAA?"+item.trials.length);
		return item;
	}

	getChildren(element?: any): Thenable<vscode.TreeItem[]> {
		return new Promise(resolve => {
			const list :vscode.TreeItem[] = [];
			const done = (_err: Error | null): void => {
				resolve(list);
			};
			if (element instanceof vscode.TreeItem) {
				this.db.getFuncs(element.label!.toString(), row => {
					list.push(this.genItemForFunction(row.path, row.name));
				}, done);
			} else {
				this.db.getFiles(row => {
					list.push(this.genItemForFile(row.path));
				}, done);
			}
		});
	}
}

export class ReturnsTreeProvider implements vscode.TreeDataProvider<any> {

	private changeEvent = new EventEmitter<void>();
	private file = "";

	constructor(private db: Database) {
	}

	public get onDidChangeTreeData(): Event<void> {
		return this.changeEvent.event;
	}

	public refresh(file: string): any {
		this.file = file;
		this.changeEvent.fire();
	}

	getTreeItem(item: any): vscode.TreeItem {
		return item;
	}

	genTreeItem(funName: string, funId: number): vscode.TreeItem {
		const item = new vscode.TreeItem(
			funName,
			vscode.TreeItemCollapsibleState.Collapsed
		);
		item.id = "fun."+funName+"."+funId;
		item.iconPath = path.join(__filename, '..', '..', 'resources', 'func.png');
		item.iconPath = new vscode.ThemeIcon('json');
		return item;
	}

	genItemForReturn(retLine: number, funId: number): vscode.TreeItem {
		const item = new vscode.TreeItem(
			"return at line: " + retLine,
			vscode.TreeItemCollapsibleState.Collapsed
		);
		item.iconPath = new vscode.ThemeIcon('indent');
		item.id = "ret."+retLine+"."+funId;
		return item;
	}

	getChildren(element?: any): Thenable<vscode.TreeItem[]> {
		return new Promise(resolve => {
			const list :vscode.TreeItem[] = [];
			const done = (_err: Error | null): void => {
				resolve(list);
			};
			if (element instanceof vscode.TreeItem && element.id?.startsWith("ret.")) {
				const returnLine = Number.parseInt(element.id.split(".")[1]);
				const funId = Number.parseInt(element.id.split(".")[2]);
				this.db.getTrialsForReturnLine(funId, returnLine, row => {
					list.push(genItemForTrial(row.time, row.return_time, row.proc_name, row.id, row.function_id));
				}, done);
			} else if (element instanceof vscode.TreeItem && element.id?.startsWith("fun.")) {
				const funId = Number.parseInt(element.id.split(".")[2]);
				this.db.getReturnsForFun(funId, row => {
					list.push(this.genItemForReturn(row.return_line, funId));
				}, done);
			} else {
				this.db.getFuncsWithReturns(this.file, row => {
					list.push(this.genTreeItem(row.name, row.function_id));
				}, done);
			}
		});
	}
}


export class StacktraceTreeProvider implements vscode.TreeDataProvider<any> {

	private changeEvent = new EventEmitter<void>();
	private file = "";

	constructor(private db: Database) {
	}

	public get onDidChangeTreeData(): Event<void> {
		return this.changeEvent.event;
	}

	public refresh(file: string): any {
		this.file = file;
		this.changeEvent.fire();
	}

	getTreeItem(item: any): vscode.TreeItem {
		return item;
	}

	genTreeItem(funName: string, funId: string): vscode.TreeItem {
		const item = new vscode.TreeItem(
			funName,
			vscode.TreeItemCollapsibleState.Collapsed
		);
		item.id = "fun."+funName+"."+funId;
		item.iconPath = new vscode.ThemeIcon('json');
		return item;
	}

	genItemForStacktrace(index: number, sum: number, stacktrace: string, funId: number): vscode.TreeItem {
		const item = new vscode.TreeItem(
			"#"+index, vscode.TreeItemCollapsibleState.Collapsed
		);
		item.tooltip = "";
		item.description = "";
		stacktrace.split(",").forEach(line => {
			item.tooltip += line + "\n";
		});
		let cnt = 0;
		stacktrace.split(",").forEach(fun => {
			if (cnt < 4 && fun.indexOf("+") > 0) {
				item.description += fun.split("+")[0]+", ";
				cnt++;
			}
		});
		item.description += "...";
		item.iconPath = new vscode.ThemeIcon('layers');
		item.id = "stack."+sum+"."+funId;
		return item;
	}

	getChildren(element?: any): Thenable<vscode.TreeItem[]> {
		return new Promise(resolve => {
			const list :vscode.TreeItem[] = [];
			const done = (_err: Error | null): void => {
				resolve(list);
			};
			if (element instanceof vscode.TreeItem && element.id?.startsWith("stack.")) {
				const sum = Number.parseInt(element.id.split(".")[1]);
				const funId = Number.parseInt(element.id.split(".")[2]);
				this.db.getTrialsWithStacktace(funId, sum, row => {
					list.push(genItemForTrial(row.time, row.return_time, row.proc_name, row.id, row.function_id));
				}, done);
			} else if (element instanceof vscode.TreeItem && element.id?.startsWith("fun.")) {
				const funId = Number.parseInt(element.id.split(".")[2]);
				this.db.getStacktracesForFun(funId, row => {
					list.push(this.genItemForStacktrace(list.length + 1, row.sum, row.stacktrace, row.function_id));
				}, done);
			} else {
				this.db.getFuncsWithReturns(this.file, row => {
					list.push(this.genTreeItem(row.name, row.function_id));
				}, done);
			}
		});
	}
}

export class HistogramTreeProvider implements vscode.TreeDataProvider<any> {

	public changeEvent = new EventEmitter<void>();
	private path = "";
	private funcsInFile: string[] = [];
	private items: vscode.TreeItem[] = [];

	constructor(private ftrace: Ftrace | undefined) {
	}

	public get onDidChangeTreeData(): Event<void> {
		return this.changeEvent.event;
	}
	public updatePath(path: string, funcsInFile: string[]): any {
		this.path = path;
		this.funcsInFile = funcsInFile;
		this.items = [];
		this.refresh();
	}

	public refresh(): any {
		this.changeEvent.fire();
	}

	private updateTreeItem(item: vscode.TreeItem, trace: TracedFunction) {
		item.resourceUri = vscode.Uri.parse("deku.histogram?"+trace.funName+"#"+trace.count);
		if (trace.count > 0)
			item.description = `(called: ${trace.count})`;
	}

	getTreeItem(item: any): vscode.TreeItem {
		if (typeof item == 'string') {
			return new vscode.TreeItem(
				item,
				vscode.TreeItemCollapsibleState.None
			);
		}

		if (item instanceof TracedFunction) {
			let count = 0;
			const trace = this.ftrace!.histogram.get(item.funName)!;
			if (trace == undefined)
				count = -1;
			else
				count = trace.count;
			let titem = this.items.find(it => it.label == item.funName);
			if (titem) {
				this.updateTreeItem(titem, item);
				return titem;
			}

			titem = new vscode.TreeItem(
				item.funName,
				vscode.TreeItemCollapsibleState.None
			);
			titem.command = {
				command: 'deku.gotoFunction',
				arguments: [this.path, item.funName],
				title: 'getTreeItem Title',
				tooltip: 'getTreeItem Tooltip'
			};
			titem.iconPath = new vscode.ThemeIcon('json');
			let tooltip = "";
			if (count == -1) {
				tooltip = "Can't track this function. This function might be inlined.";
			} else if (count == 0){
				tooltip = "Function hasn't been called yet"
			} else {
				tooltip = "**Function called from:**\n";
				item.parents.forEach((count, parentFun) => {
					tooltip += `* ${parentFun} (${count} times)\n`;
				});
			}
			titem.tooltip = new vscode.MarkdownString(tooltip, false);
			this.items.push(titem);
			this.updateTreeItem(titem, item);
			return titem;
		}
		else
			return new vscode.TreeItem("Unknown");
	}

	getChildren(_element?: any): vscode.ProviderResult<[]> {
		let childs: any;
		if (this.path != "") {
			childs = [];
			let temp: TracedFunction[] = [];
			this.ftrace!.histogram.forEach((trace, fun) => {
				if (this.funcsInFile.includes(fun))
					temp.push(trace);
			});
			childs = temp.sort((a, b) => b.count - a.count);
			this.funcsInFile.forEach(fun => {
				if (!this.ftrace!.histogram.has(fun))
					childs.push(new TracedFunction(fun, -1));
			});
			if (childs.length == 0)
				childs.push("Loading...");
		}
		return Promise.resolve(childs);
	}
}
const decorationType = vscode.window.createTextEditorDecorationType({
	backgroundColor: "#007acc33",
	isWholeLine: true,
});

export function decorateChanges(editor: vscode.TextEditor)
{
	const { exec } = require("child_process");
	const path = vscode.workspace.asRelativePath(editor.document.uri);
	const folder = vscode.workspace.workspaceFolders![0];
	const kernelSrc = folder.uri.path;
	exec("git -C " + kernelSrc + " diff -U0 " + path, (error: any, stdout: any, stderr: any) => {
		if (error) {
			console.log(`error: ${error.message}`);
			return [];
		}
		if (stderr) {
			console.log(`stderr: ${stderr}`);
			return [];
		}
		var re;
		var regex;
		var chunks: number[][] = [];
		let chunk = [-1, -1];
		var lineNo = -1;
		stdout.split("\n").forEach((line: string) => {
			regex = /\+\+\+\ (b\/)?(.+)/g;
			if ((re = regex.exec(line)) !== null) {
				return;
			}
			regex = /@@\ -[0-9]+(,[0-9]+)?\ \+([0-9]+)(,[0-9]+)?\ @@.*/g;
			if ((re = regex.exec(line)) !== null) {
				lineNo = Number.parseInt(re[2]);
				chunk = [lineNo, -1];
				chunks.push(chunk);
				return;
			}
			if (lineNo != -1) {
				regex = /^(\[[0-9;]*m)*([\ +-])/g;
				if ((re = regex.exec(line)) !== null) {
					if (re[2] === '+') {
						chunk[1] = lineNo;
						lineNo++;
					}
				} else {
					lineNo = -1;
				}
			}
		});

		const decorationsArray: vscode.DecorationOptions[] = [];
		chunks.forEach(chunk => {
			if (chunk[1] != -1) {
				const range = new vscode.Range(chunk[0] - 1, 0, chunk[1] - 1, 0);
				decorationsArray.push({ range });
			}
		});
		editor.setDecorations(decorationType, decorationsArray);
	});
}
