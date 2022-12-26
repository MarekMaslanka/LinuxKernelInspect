import {
    Disposable,
    EventEmitter,
    FileDecoration,
    FileDecorationProvider,
    ThemeColor,
    Uri,
    window,
} from 'vscode';
// import Config from '../Config'
// import NodeType from '../StashNode/NodeType'
// import UriGenerator from '../uriGenerator'

export default class implements FileDecorationProvider, Disposable {
    private readonly onDidChangeDecorationEmitter = new EventEmitter<undefined | Uri | Uri[]>();
    readonly onDidChangeFileDecorations = this.onDidChangeDecorationEmitter.event;
    private readonly disposable: Disposable;

    constructor() {
        this.disposable = Disposable.from(window.registerFileDecorationProvider(this));
    }

    dispose(): void {
        this.disposable.dispose();
    }

    provideFileDecoration(uri: Uri): FileDecoration | undefined {
	if (uri.toString().includes("AAA"))
		return this.getDecorator(uri.query.substring(0, 6), 'gitDecoration.untrackedResourceForeground');
	return undefined;
    }

    /**
     * Create a decorator.
     *
     * @param badge the string with the badge content
     * @param color the string with the theme color key
     */
    private getDecorator(badge: string, color: string): FileDecoration {
        return {
            badge: badge,
            // color: new ThemeColor(color),
            propagate: false,
        };
    }
}