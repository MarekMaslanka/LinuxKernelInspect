import * as vscode from "vscode";
import { EventEmitter, Event } from "vscode";
import * as path from 'path';
import { InspectFunction } from "./DekuIntegration";
import { Ftrace, TracedFunction } from "./Ftrace";

export class LensInspectionTrial {
	trialId!: number;
	time!: number;
	textTime!: string;
	fun: LensInspectionFunction;
	lines: Map<number, string[]> = new Map<number, string[]>();
	stacktrace: string[] = [];
	stacktraceSum = 0;
	returnAtLine = 0;
	returnTime!: number;
	timeDiff = 0;
	calledFrom = "";
	procName = "";

	public constructor(trialId: number, fun: LensInspectionFunction, time: number, textTime: string) {
		this.trialId = trialId;
		this.fun = fun;
		this.time = time;
		this.textTime = textTime;
	}
}

class LensInspectionFunction {
	name!: string;
	range: number[] = [];
	trials: LensInspectionTrial[] = [];
	showInspectFor!: LensInspectionTrial;

	public getTrial(trialId: number)
	{
		let trial = this.trials.find(it => it.trialId === trialId);
		if (trial) {
			return trial;
		}
		console.log("ERROR: Can't find trial by id: " + trialId);
		return undefined;
	}
}

class LensInspectionFile {
	file!: string;
	functions: LensInspectionFunction[] = [];

	public constructor(path: string, fun: LensInspectionFunction) {
		this.file = path;
		this.functions.push(fun);
	}
}

class ReturnItem {
	public constructor(public time: LensInspectionTrial) {}
}

class StacktraceItem {
	public constructor(public time: LensInspectionTrial, public index: number) {}
}

// class HistogramItem {
// 	public constructor(public name: string, public trace: TracedFunction) {}
// }

export class LensInspectionRoot {
	files: LensInspectionFile[] = [];

	public findFunction(filePath: string, line: number): LensInspectionFunction | undefined {
		let result;
		this.files.forEach(file => {
			if (file.file == filePath) {
				file.functions.forEach(func => {
					if (func.range[0] <= line && func.range[1] >= line) {
						result = func;
						return;
					}
				});
			}
		});
		return result;
	}

	public getFunction(filePath: string, name: string): LensInspectionFunction | undefined {
		let result;
		this.files.forEach(file => {
			if (file.file == filePath) {
				file.functions.forEach(func => {
					if (func.name == name) {
						result = func;
						return;
					}
				});
			}
		});
		return result;
	}

	public getOrCreateFunc(trialId: number, filePath: string, funName: string, lineStart: number, lineEnd: number): LensInspectionFunction {
		let inspectFunc: LensInspectionFunction | undefined = undefined;
		this.files.forEach(file => {
			if (file.file === filePath) {
				file.functions.forEach(func => {
					if (func.name === funName && func.range[0] === lineStart && func.range[1] === lineEnd) {
						inspectFunc = func;
						return;
					}
				});
			}
		});
		if (inspectFunc !== undefined) {
			return inspectFunc;
		}

		inspectFunc = new LensInspectionFunction();
		inspectFunc.name = funName;
		inspectFunc.range = [lineStart, lineEnd];
		inspectFunc.showInspectFor = new LensInspectionTrial(trialId, inspectFunc, 0, "");

		this.files.forEach(file => {
			if (file.file == filePath) {
				file.functions.push(inspectFunc!);
				return inspectFunc;
			}
		});
		this.files.push(new LensInspectionFile(filePath, inspectFunc));

		return inspectFunc;
	}

	public findTrial(filePath: string, time: number): LensInspectionTrial | undefined {
		let result;
		this.files.forEach(file => {
			if (file.file == filePath) {
				file.functions.forEach(func => {
					for (let i = 0; i < func.trials.length; i++) {
						if (func.trials[i].time === time) {
							result = func.trials[i];
							return;
						}
					}
				});
			}
		});
		return result;
	}
}

export class InspectOutlineProvider implements vscode.TreeDataProvider<any> {

	private changeEvent = new EventEmitter<void>();

	constructor(private inspections: LensInspectionFile | undefined) {
	}

	public get onDidChangeTreeData(): Event<void> {
		return this.changeEvent.event;
	}
	public refresh(inspectsForFile: LensInspectionFile | undefined): any {
		this.inspections = inspectsForFile;
		this.changeEvent.fire();
	}

	getTreeItem(item: any): vscode.TreeItem {
		if (item instanceof LensInspectionFunction) {
			const titem = new vscode.TreeItem(
				item.name,
				item.trials.length > 1
					? vscode.TreeItemCollapsibleState.Collapsed
					: vscode.TreeItemCollapsibleState.None
			);
			if (item.trials.length === 1)
				titem.command = {
					command: 'kernelinspect.show_inspect_for',
					arguments: [item.trials[0]],
					title: 'getTreeItem Title',
					tooltip: 'getTreeItem Tooltip'
				};
			titem.iconPath = path.join(__filename, '..', '..', 'resources', 'func.png');
			titem.iconPath = new vscode.ThemeIcon('json');
			titem.resourceUri = vscode.Uri.parse(item.name+item.trials[0].time+"_AAA?"+item.trials.length);
			return titem;
		} else if (item instanceof LensInspectionTrial) {
			const titem = new vscode.TreeItem(
				"["+item.procName+"] "+item.textTime, vscode.TreeItemCollapsibleState.None
			);
			titem.command = {
				command: 'kernelinspect.show_inspect_for',
				arguments: [item],
				title: 'Open FTP Resource',
				tooltip: 'Open FTP Resource1'
			};
			titem.iconPath = path.join(__filename, '..', '..', 'resources', 'time.png');
			titem.iconPath = new vscode.ThemeIcon('history');
			titem.description = ((item.returnTime - item.time) / 1000000).toFixed(3)+"ms";
			titem.resourceUri = vscode.Uri.parse(item.fun.name+item.stacktraceSum+item.fun.name+"_AAA?"+item.timeDiff+"ms");

			return titem;
		}
		else
			return new vscode.TreeItem("Unknown");
	}

	getChildren(element?: any): Thenable<[]> {
		let childs: any;
		if (element instanceof LensInspectionFile)
			childs = element.functions;
		else if (element instanceof LensInspectionFunction)
			childs = element.trials;
		else
			childs = this.inspections?.functions;
		return Promise.resolve(childs);
	}
}

export class KernelInspectTreeProvider implements vscode.TreeDataProvider<any> {

	private changeEvent = new EventEmitter<void>();

	constructor(private inspections: InspectFunction[] | undefined) {
	}

	public get onDidChangeTreeData(): Event<void> {
		return this.changeEvent.event;
	}
	public refresh(inspectsForFile: InspectFunction[] | undefined): any {
		this.inspections = inspectsForFile;
		this.changeEvent.fire();
	}

	getTreeItem(item: any): vscode.TreeItem {
		if (item instanceof InspectFunction) {
			const titem = new vscode.TreeItem(
				item.file,
				vscode.TreeItemCollapsibleState.Collapsed
			);
			return titem;
		}
		const titem = new vscode.TreeItem(item.file + " " + item.fun);
		titem.command = {
			command: 'kernelinspect.open_file_fun',
			arguments: [item.file, item.fun],
			title: 'Open inspected function',
		};
		titem.iconPath = new vscode.ThemeIcon('circle-outline');
		titem.contextValue = "functionInspect"
		// titem.resourceUri = vscode.Uri.parse(item.file+"_AAA?"+item.trials.length);
		return titem;
	}

	getChildren(element?: any): Thenable<[]> {
		let childs: any;
		if (element instanceof InspectFunction)
			childs = element.file;
		else
			childs = this.inspections;
		return Promise.resolve(childs);
	}
}

export class ReturnsOutlineProvider implements vscode.TreeDataProvider<any> {

	private changeEvent = new EventEmitter<void>();

	constructor(private inspections: LensInspectionFile | undefined) {
	}

	public get onDidChangeTreeData(): Event<void> {
		return this.changeEvent.event;
	}
	public refresh(inspectsForFile: LensInspectionFile | undefined): any {
		this.inspections = inspectsForFile;
		this.changeEvent.fire();
	}

	getTreeItem(item: any): vscode.TreeItem {
		if (item instanceof LensInspectionFunction) {
			const titem = new vscode.TreeItem(
				item.name,
				item.trials.length > 1
					? vscode.TreeItemCollapsibleState.Collapsed
					: vscode.TreeItemCollapsibleState.None
			);
			titem.iconPath = path.join(__filename, '..', '..', 'resources', 'func.png');
			titem.iconPath = new vscode.ThemeIcon('code');
			return titem;
		} else if (item instanceof ReturnItem) {
			const titem = new vscode.TreeItem(
				"return at line: "+item.time.returnAtLine, vscode.TreeItemCollapsibleState.Collapsed
			);
			titem.iconPath = new vscode.ThemeIcon('indent');
			return titem;
		} else if (item instanceof LensInspectionTrial) {
			const titem = new vscode.TreeItem(
				"["+item.procName+"] "+item.textTime, vscode.TreeItemCollapsibleState.None
			);
			titem.command = {
				command: 'kernelinspect.show_inspect_for',
				arguments: [item],
				title: 'Open FTP Resource',
				tooltip: 'Open FTP Resource1'
			};
			titem.iconPath = path.join(__filename, '..', '..', 'resources', 'time.png');
			titem.iconPath = new vscode.ThemeIcon('history');
			return titem;
		}
		else
			return new vscode.TreeItem("Unknown");
	}

	getChildren(element?: any): Thenable<[]> {
		let childs: any;
		if (element instanceof LensInspectionFunction) {
			const retLines: number[] = [];
			const items: ReturnItem[] = [];
			element.trials.forEach(trial => {
				if (!retLines.includes(trial.returnAtLine)) {
					retLines.push(trial.returnAtLine);
					items.push(new ReturnItem(trial));
				}
			});
			childs = items;
		} else if (element instanceof ReturnItem) {
			const items: LensInspectionTrial[] = [];
			element.time.fun.trials.forEach(trial => {
				if (trial.returnAtLine === element.time.returnAtLine) {
					items.push(trial);
				}
			});
			childs = items;
		} else if (this.inspections) {
			const items: LensInspectionFunction[] = [];
			this.inspections?.functions.forEach(func => {
				let found = false;
				for (let i = 0; i < items.length; i++) {
					if (func.name === items[i].name) {
						found = true;
						break;
					}
				}
				if (!found)	{
					items.push(func);
				}
			});
			childs = items;
		}
		return Promise.resolve(childs);
	}
}

export class StacktraceTreeProvider implements vscode.TreeDataProvider<any> {

	private changeEvent = new EventEmitter<void>();

	constructor(private inspections: LensInspectionFile | undefined) {
	}

	public get onDidChangeTreeData(): Event<void> {
		return this.changeEvent.event;
	}
	public refresh(inspectsForFile: LensInspectionFile | undefined): any {
		this.inspections = inspectsForFile;
		this.changeEvent.fire();
	}

	getTreeItem(item: any): vscode.TreeItem {
		if (item instanceof LensInspectionFunction) {
			const titem = new vscode.TreeItem(
				item.name,
				item.trials.length > 1
					? vscode.TreeItemCollapsibleState.Collapsed
					: vscode.TreeItemCollapsibleState.None
			);
			titem.iconPath = path.join(__filename, '..', '..', 'resources', 'func.png');
			titem.iconPath = new vscode.ThemeIcon('json');
			return titem;
		} else if (item instanceof StacktraceItem) {
			const titem = new vscode.TreeItem(
				"#"+item.index, vscode.TreeItemCollapsibleState.Collapsed
			);
			titem.tooltip = "";
			titem.description = "";
			item.time.stacktrace.forEach(line => {
				titem.tooltip += line + "\n";
			});
			let cnt = 0;
			item.time.stacktrace.forEach(fun => {
				if (cnt < 4 && fun.indexOf("+") > 0) {
					titem.description += fun.split("+")[0]+", ";
					cnt++;
				}
			});
			titem.description += "...";
			titem.iconPath = new vscode.ThemeIcon('layers');
			return titem;
		} else if (item instanceof LensInspectionTrial) {
			const titem = new vscode.TreeItem(
				"["+item.procName+"] "+item.textTime, vscode.TreeItemCollapsibleState.None
			);
			titem.command = {
				command: 'kernelinspect.show_inspect_for',
				arguments: [item],
				title: 'Open FTP Resource',
				tooltip: 'Open FTP Resource1'
			};
			titem.iconPath = path.join(__filename, '..', '..', 'resources', 'time.png');
			titem.iconPath = new vscode.ThemeIcon('history');
			return titem;
		}
		else
			return new vscode.TreeItem("Unknown");
	}

	getChildren(element?: any): Thenable<[]> {
		let childs: any;
		if (element instanceof LensInspectionFunction) {
			const stackSum: number[] = [];
			const items: StacktraceItem[] = [];
			element.trials.forEach(time => {
				if (!stackSum.includes(time.stacktraceSum)) {
					stackSum.push(time.stacktraceSum);
					items.push(new StacktraceItem(time, items.length+1));
				}
			});
			childs = items;
		} else if (element instanceof StacktraceItem) {
			const items: LensInspectionTrial[] = [];
			element.time.fun.trials.forEach(time => {
				if (time.stacktraceSum == element.time.stacktraceSum) {
					items.push(time);
				}
			});
			childs = items;
		} else if (this.inspections) {
			const items: LensInspectionFunction[] = [];
			this.inspections?.functions.forEach(func => {
				let found = false;
				for (let i = 0; i < items.length; i++) {
					if (func.name === items[i].name) {
						found = true;
						break;
					}
				}
				if (!found)	{
					items.push(func);
				}
			});
			childs = items;
		}
		return Promise.resolve(childs);
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

export function addInspectInformation(inspects: LensInspectionRoot, trialId: number, file: string, line: number, value: string, name?: string) {
	const func = inspects.findFunction(file, line);
	const trial = func?.getTrial(trialId);
	if (trial === undefined) {
		return;
	}
	const linesMap = trial.lines;
	if (linesMap!.get(line) === undefined) { // TODO: check
		linesMap!.set(line, []);
	}
	linesMap!.get(line)?.push(value);
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
