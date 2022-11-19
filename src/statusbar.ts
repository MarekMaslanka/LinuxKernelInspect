import * as vscode from "vscode";
import { execDekuDeploy } from "./DekuIntegration";

let myStatusBarItem: vscode.StatusBarItem;

export function setupStatusbar(subscriptions: vscode.Disposable[], editor: vscode.TextEditor | undefined) {
	// register a command that is invoked when the status bar
	// item is selected
	const myCommandId = 'sample.showSelectionCount';
	subscriptions.push(vscode.commands.registerCommand(myCommandId, () => {
		execDekuDeploy();
	}));

	// create a new status bar item that we can now manage
	myStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
	myStatusBarItem.command = myCommandId;
	subscriptions.push(myStatusBarItem);

	updateStatusBarItem(false);
}

export function updateStatusBarItem(inprogress: boolean): void {
	myStatusBarItem.text = inprogress ? `$(sync~spin) DEKU Applying` : `$(sync) DEKU Apply`;
	myStatusBarItem.show();
}

