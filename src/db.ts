import * as sqlite from "sqlite3";

export class Database
{
	private file!: string;
	private line!: number;
	private endLine!: number;
	private funName!: string;
	private startTime!: number;
	private stacktrace!: string;

	// private db = new sqlite.Database('/usr/local/google/home/mmaslanka/chromeos/src/third_party/kernel/v5.10/inspect.sqlite');
	private db = new sqlite.Database(':memory:');

	public constructor()
	{
		// this.db.serialize(() => {
		// 	db.run("CREATE TABLE lorem (info TEXT)");
		// 	const stmt = db.prepare("INSERT INTO lorem VALUES (?)");
		// 	for (let i = 0; i < 10; i++) {
		// 		stmt.run("Ipsum " + i);
		// 	}
		// 	stmt.finalize();
		// 	db.each("SELECT rowid AS id, info FROM lorem", (err, row) => {
		// 		console.log(row.id + ": " + row.info);
		// 	});
		//     });
		this.db.serialize(() => {
			this.db.run('DROP TABLE file;', (err: any, err1: any) => {
				if (err)
					console.log(err);
			});
			this.db.run('DROP TABLE function;', (err: any, err1: any) => {
				if (err)
					console.log(err);
			});
			this.db.run('DROP TABLE trial;', (err: any, err1: any) => {
				if (err)
					console.log(err);
			});
			this.db.run('DROP TABLE stacktrace;', (err: any, err1: any) => {
				if (err)
					console.log(err);
			});
			this.db.run('DROP TABLE line;', (err: any, err1: any) => {
				if (err)
					console.log(err);
			});

			this.db.run('CREATE TABLE "file" (\
				"id"	INTEGER NOT NULL UNIQUE,\
				"path"	TEXT NOT NULL,\
				"source"	TEXT NOT NULL,\
				"commit_hash"	TEXT NOT NULL,\
				PRIMARY KEY("id" AUTOINCREMENT)\
			)', (a: any, err: any) => {
				console.log(a+err);
			});
			this.db.run('CREATE TABLE "function" (\
				"id"	INTEGER NOT NULL UNIQUE,\
				"file_id"	INTEGER NOT NULL,\
				"name"	TEXT NOT NULL,\
				FOREIGN KEY("file_id") REFERENCES "file"("id") ON UPDATE CASCADE ON DELETE CASCADE,\
				PRIMARY KEY("id" AUTOINCREMENT)\
			)');
			this.db.run('CREATE TABLE "trial" (\
				"id"	INTEGER NOT NULL UNIQUE,\
				"time"	INTEGER NOT NULL,\
				"return_time"	INTEGER NOT NULL,\
				"return_line"	INTEGER NOT NULL,\
				"function_id"	INTEGER NOT NULL,\
				FOREIGN KEY("function_id") REFERENCES "function"("id"),\
				PRIMARY KEY("id" AUTOINCREMENT)\
			)');
			this.db.run('CREATE TABLE "stacktrace" (\
				"id"	INTEGER NOT NULL UNIQUE,\
				"trial_id"	INTEGER NOT NULL,\
				"stacktrace"	TEXT NOT NULL,\
				"sum"	INTEGER NOT NULL,\
				FOREIGN KEY("trial_id") REFERENCES "trial"("id"),\
				PRIMARY KEY("id" AUTOINCREMENT)\
			)');
			this.db.run('CREATE TABLE "line" (\
				"id"	INTEGER NOT NULL UNIQUE,\
				"trial_id"	INTEGER NOT NULL,\
				"number"	INTEGER NOT NULL,\
				"var_name"	TEXT,\
				"var_value"	TEXT,\
				"msg"	TEXT,\
				FOREIGN KEY("trial_id") REFERENCES "trial"("id"),\
				PRIMARY KEY("id" AUTOINCREMENT)\
			)');
		});
	}

	public startTrial(file: string, line: number, endLine: number, funName: string, time: number): void
	{
		this.file = file;
		this.line = line;
		this.endLine = endLine;
		this.funName = funName;
		this.startTime = time;

		let fileExists = false;
		this.db.serialize(() => {
			this.db.each(`SELECT * FROM file WHERE path = "${file}" LIMIT 1`, (err:any, row:any) => {
				fileExists = true;
			});
			if (!fileExists) {
				this.db.run("INSERT INTO file (path, source, commit_hash) VALUES ($path, $source, $commit)", {
					$path: file,
					$source: "",
					$commit: ""
				}, (err: any, row: any) => {
					if (err)
						console.log(err);
				});
			}
			this.db.wait();
		});
		this.db.wait();
	}

	public addStacktrace(file: string, funName: string, stacktrace: string)
	{
		this.stacktrace = stacktrace;
	}

	public addLineInspect(file: string, funName: string, line: number, name: string, value?: string)
	// eslint-disable-next-line @typescript-eslint/no-empty-function
	{

	}

	// public addLineInspect(line: number, msg: string) {

	// }

	public functionReturn(time: number, funName: string, line?: number, key?: string, value?: string)
	// eslint-disable-next-line @typescript-eslint/no-empty-function
	{

	}
}