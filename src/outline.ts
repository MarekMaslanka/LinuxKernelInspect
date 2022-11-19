import * as vscode from "vscode";
import { EventEmitter, Event } from "vscode";
import * as path from 'path';
import { InspectFunction } from "./DekuIntegration";

export class LensInspectionAtTime {
	time!: string;
	lines: Map<number, string[]> = new Map<number, string[]>();

	public constructor(time: string) {
		this.time = time;
	}
}

class LensInspectionFunction {
	name!: string;
	range: number[] = [];
	times: LensInspectionAtTime[] = [];
}

class LensInspectionFile {
	file!: string;
	functions: LensInspectionFunction[] = [];

	public constructor(path: string, fun: LensInspectionFunction) {
		this.file = path;
		this.functions.push(fun);
	}
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

		this.files.forEach(file => {
			if (file.file == filePath) {
				file.functions.push(inspectFunc!);
				return inspectFunc;
			}
		});
		this.files.push(new LensInspectionFile(filePath, inspectFunc));

		return inspectFunc;
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
					? vscode.TreeItemCollapsibleState.Expanded
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
			return titem;
		} else if (item instanceof LensInspectionAtTime) {
			const titem = new vscode.TreeItem(
				item.time, vscode.TreeItemCollapsibleState.None
			);
			titem.command = {
				command: 'kernelinspect.show_inspect_for',
				arguments: [item],
				title: 'Open FTP Resource',
				tooltip: 'Open FTP Resource1'
			};
			titem.iconPath = path.join(__filename, '..', '..', 'resources', 'time.png');
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
				vscode.TreeItemCollapsibleState.Expanded
			);
			return titem;
		}
		const titem = new vscode.TreeItem(item.file + " " + item.fun);
		titem.command = {
			command: 'kernelinspect.open_file_fun',
			arguments: [item.file, item.fun],
			title: 'Open inspected function',
		};
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

export function addInspectInformation(inspects: LensInspectionRoot, file: string, line: number, value: string, name?: string) {
	const func = inspects.findFunction(file, line);
	const linesMap = func?.times[func.times.length - 1].lines;
	if (linesMap!.get(line) == undefined) // TODO: check
		linesMap!.set(line, []);
	linesMap!.get(line)?.push(value);
}
