import * as vscode from "vscode";
import { EventEmitter, Event } from "vscode";
import * as path from 'path';
import { InspectFunction } from "./DekuIntegration";
import { time } from "console";

export class LensInspectionAtTime {
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

	public constructor(fun: LensInspectionFunction, time: number, textTime: string) {
		this.fun = fun;
		this.time = time;
		this.textTime = textTime;
	}
}

class LensInspectionFunction {
	name!: string;
	range: number[] = [];
	times: LensInspectionAtTime[] = [];
	showInspectFor!: LensInspectionAtTime;

	public currentTime()
	{
		return this.times[this.times.length - 1];
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
	public constructor(public time: LensInspectionAtTime) {}
}

class StacktraceItem {
	public constructor(public time: LensInspectionAtTime, public index: number) {}
}

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

	public getOrCreateFunc(filePath: string, funName: string, lineStart: number, lineEnd: number): LensInspectionFunction {
		let inspectFunc: LensInspectionFunction | undefined = undefined;
		this.files.forEach(file => {
			if (file.file == filePath) {
				file.functions.forEach(func => {
					if (func.name == funName && func.range[0] == lineStart && func.range[1] == lineEnd) {
						inspectFunc = func;
						return;
					}
				});
			}
		});
		if (inspectFunc != undefined)
			return inspectFunc;

		inspectFunc = new LensInspectionFunction();
		inspectFunc.name = funName;
		inspectFunc.range = [lineStart, lineEnd];
		inspectFunc.showInspectFor = new LensInspectionAtTime(inspectFunc, 0, "");

		this.files.forEach(file => {
			if (file.file == filePath) {
				file.functions.push(inspectFunc!);
				return inspectFunc;
			}
		});
		this.files.push(new LensInspectionFile(filePath, inspectFunc));

		return inspectFunc;
	}

	public findTrial(filePath: string, time: number): LensInspectionAtTime | undefined {
		let result;
		this.files.forEach(file => {
			if (file.file == filePath) {
				file.functions.forEach(func => {
					for (let i = 0; i < func.times.length; i++) {
						if (func.times[i].time == time) {
							result = func.times[i];
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
				item.times.length > 1
					? vscode.TreeItemCollapsibleState.Collapsed
					: vscode.TreeItemCollapsibleState.None
			);
			if (item.times.length == 1)
				titem.command = {
					command: 'kernelinspect.show_inspect_for',
					arguments: [item.times[0]],
					title: 'getTreeItem Title',
					tooltip: 'getTreeItem Tooltip'
				};
			titem.iconPath = path.join(__filename, '..', '..', 'resources', 'func.png');
			titem.iconPath = new vscode.ThemeIcon('json');
			titem.resourceUri = vscode.Uri.parse(item.name+item.currentTime+"_AAA?"+item.times.length);
			return titem;
		} else if (item instanceof LensInspectionAtTime) {
			const titem = new vscode.TreeItem(
				item.textTime, vscode.TreeItemCollapsibleState.None
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
			childs = element.times;
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
		// titem.resourceUri = vscode.Uri.parse(item.file+"_AAA?"+item.times.length);
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
				item.times.length > 1
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
		} else if (item instanceof LensInspectionAtTime) {
			const titem = new vscode.TreeItem(
				item.textTime, vscode.TreeItemCollapsibleState.None
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
			element.times.forEach(time => {
				if (!retLines.includes(time.returnAtLine)) {
					retLines.push(time.returnAtLine);
					items.push(new ReturnItem(time));
				}
			});
			if (retLines.length > 1) {
				childs = items;
			}
		} else if (element instanceof ReturnItem) {
			const items: LensInspectionAtTime[] = [];
			element.time.fun.times.forEach(time => {
				if (time.returnAtLine == element.time.returnAtLine) {
					items.push(time);
				}
			});
			childs = items;
		} else if (this.inspections) {
			const items: LensInspectionFunction[] = [];
			this.inspections?.functions.forEach(func => {
				const firstRet = func.times[0].returnAtLine;
				for (let i = 1; i < func.times.length; i++) {
					if (func.times[i].returnAtLine != firstRet) {
						items.push(func);
						break;
					}
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
				item.times.length > 1
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
			for (let i = 0; i < 4; i++)
				titem.description += item.time.stacktrace[i].split("+")[0]+", ";
			titem.description += "...";
			titem.iconPath = new vscode.ThemeIcon('layers');
			return titem;
		} else if (item instanceof LensInspectionAtTime) {
			const titem = new vscode.TreeItem(
				item.textTime, vscode.TreeItemCollapsibleState.None
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
			element.times.forEach(time => {
				if (!stackSum.includes(time.stacktraceSum)) {
					stackSum.push(time.stacktraceSum);
					items.push(new StacktraceItem(time, items.length+1));
				}
			});
			if (stackSum.length > 1) {
				childs = items;
			}
		} else if (element instanceof StacktraceItem) {
			const items: LensInspectionAtTime[] = [];
			element.time.fun.times.forEach(time => {
				if (time.stacktraceSum == element.time.stacktraceSum) {
					items.push(time);
				}
			});
			childs = items;
		} else if (this.inspections) {
			const items: LensInspectionFunction[] = [];
			this.inspections?.functions.forEach(func => {
				const firstSum = func.times[0].stacktraceSum;
				for (let i = 1; i < func.times.length; i++) {
					if (func.times[i].stacktraceSum != firstSum) {
						items.push(func);
						break;
					}
				}
			});
			childs = items;
		}
		return Promise.resolve(childs);
	}
}

export function addInspectInformation(inspects: LensInspectionRoot, file: string, line: number, value: string, name?: string) {
	const func = inspects.findFunction(file, line);
	const linesMap = func?.times[func.times.length - 1].lines;
	if (linesMap!.get(line) == undefined) // TODO: check
		linesMap!.set(line, []);
	linesMap!.get(line)?.push(value);
}
