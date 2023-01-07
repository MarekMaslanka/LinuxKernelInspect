import * as vscode from "vscode";
import { Deku } from "./DekuIntegration";

let deployStatusBarItem: vscode.StatusBarItem;

export function setupStatusbar(deku: Deku, subscriptions: vscode.Disposable[], editor: vscode.TextEditor | undefined) {
	const myCommandId = 'sample.showSelectionCount';
	subscriptions.push(vscode.commands.registerCommand(myCommandId, () => {
		deku.execDekuDeploy();
	}));

	deployStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
	deployStatusBarItem.command = myCommandId;
	subscriptions.push(deployStatusBarItem);

	updateStatusBarItem(false);
}

export function updateStatusBarItem(inprogress: boolean): void {
	deployStatusBarItem.text = inprogress ? `$(sync~spin) DEKU Applying` : `$(sync) DEKU Apply`;
	deployStatusBarItem.show();
}

