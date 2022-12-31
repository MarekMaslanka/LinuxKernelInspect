import * as sqlite from "sqlite3";

export class Database
{
	private db = new sqlite.Database('kernel_sources/inspect.sqlite');
	// private db = new sqlite.Database(':memory:');

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
		// this.db.serialize(() => {
		this.db.serialize();
			this.db.run('DROP TABLE file;', this.insertCb);
			this.db.run('DROP TABLE function;', this.insertCb);
			this.db.run('DROP TABLE trial;', this.insertCb);
			this.db.run('DROP TABLE stacktrace;', this.insertCb);
			this.db.run('DROP TABLE inspect;', this.insertCb);

			this.db.run('CREATE TABLE "file" (\
				"id"	INTEGER NOT NULL UNIQUE,\
				"path"	TEXT NOT NULL,\
				"source"	TEXT NOT NULL,\
				"commit_hash"	TEXT NOT NULL,\
				PRIMARY KEY("id" AUTOINCREMENT)\
				UNIQUE(path, source, commit_hash)\
				)', this.insertCb);
			this.db.run('CREATE TABLE "function" (\
				"id"	INTEGER NOT NULL UNIQUE,\
				"file_id"	INTEGER NOT NULL,\
				"name"	TEXT NOT NULL,\
				"line_start"	INTEGER NOT NULL,\
				"line_end"	INTEGER NOT NULL,\
				FOREIGN KEY("file_id") REFERENCES "file"("id") ON UPDATE CASCADE ON DELETE CASCADE,\
				PRIMARY KEY("id" AUTOINCREMENT)\
				UNIQUE(file_id, name)\
				)', this.insertCb);
			this.db.run('CREATE TABLE "trial" (\
				"id"	INTEGER NOT NULL UNIQUE,\
				"time"	INTEGER NOT NULL,\
				"return_time"	INTEGER NOT NULL,\
				"return_line"	INTEGER NOT NULL,\
				"function_id"	INTEGER NOT NULL,\
				FOREIGN KEY("function_id") REFERENCES "function"("id"),\
				PRIMARY KEY("id" AUTOINCREMENT)\
				)', this.insertCb);
			this.db.run('CREATE TABLE "stacktrace" (\
				"id"	INTEGER NOT NULL UNIQUE,\
				"trial_id"	INTEGER NOT NULL,\
				"stacktrace"	TEXT NOT NULL,\
				"sum"	INTEGER NOT NULL,\
				FOREIGN KEY("trial_id") REFERENCES "trial"("id"),\
				PRIMARY KEY("id" AUTOINCREMENT)\
				)', this.insertCb);
			this.db.run('CREATE TABLE "inspect" (\
				"id"	INTEGER NOT NULL UNIQUE,\
				"trial_id"	INTEGER NOT NULL,\
				"line"	INTEGER NOT NULL,\
				"var_name"	TEXT,\
				"var_value"	TEXT,\
				"msg"	TEXT,\
				FOREIGN KEY("trial_id") REFERENCES "trial"("id"),\
				PRIMARY KEY("id" AUTOINCREMENT)\
				)', this.insertCb);
			this.db.run('CREATE VIEW variables AS\
				SELECT time/1000000.0 AS time, var_name, var_value, line, path FROM inspect\
				INNER JOIN trial ON trial.id = inspect.trial_id\
				INNER JOIN function ON function.id = trial.function_id\
				INNER JOIN file ON file.id = function.file_id',
				this.insertCb);
		// });

	}

	public getAllTrials(callbackfn: (row: any) => void)
	{
		// this.db.each("SELECT * FROM stacktrace INNER JOIN trial ON trial.id = stacktrace.trial_id INNER JOIN function ON function.id = trial.function_id INNER JOIN file ON file.id = function.file_id", (err, row) => {
		// 	callbackfn(row);
		// });
	}

	public getInspects(trialId: number, callbackfn: (row: any) => void)
	{
		this.db.each("SELECT * FROM inspect INNER JOIN trial ON trial.id = inspect.trial_id INNER JOIN function ON function.id = trial.function_id INNER JOIN file ON file.id = function.file_id WHERE inspect.trial_id = " + trialId, (err, row) => {
			callbackfn(row);
		});
	}

	public execSelectQuery(query: string, callbackfn: (row: any) => void)
	{
		this.db.each(query, (err, row) => {
			if (err)
				callbackfn(err);
			else
				callbackfn(row);
		});
	}

	public startTrial(file: string, line: number, endLine: number, funName: string, time: number, calledFrom: string): void
	{
		this.db.serialize(() => {
			this.db.run("INSERT INTO file (path, source, commit_hash) VALUES ($path, $source, $commit)", {
					$path: file,
					$source: "",
					$commit: ""
				}, this.insertCb);
			this.db.run("INSERT INTO function (name, line_start, line_end, file_id) VALUES ($name, $lineStart, $lineEnd, (SELECT id FROM file WHERE path = $path LIMIT 1))", {
				$name: funName,
				$lineStart: line,
				$lineEnd: endLine,
				$path: file
			}, this.insertCb);
			this.db.run("INSERT INTO trial (time, return_time, return_line, function_id) VALUES ($time, 0, 0, (SELECT id FROM function WHERE name = $funName AND file_id = (SELECT id FROM file WHERE path = $path LIMIT 1) ORDER BY id DESC LIMIT 1))", {
				$time: (time * 1000000).toFixed(0),
				$funName: funName,
				$path: file
			}, this.insertCb);
		});
	}

	public addStacktrace(file: string, funName: string, stacktrace: string, sum: number)
	{
		this.db.serialize(() => {
			this.db.run("INSERT INTO stacktrace (stacktrace, sum, trial_id) VALUES ($stacktrace, $sum, (SELECT id FROM trial WHERE function_id = (SELECT id FROM function WHERE name = $funName AND file_id = (SELECT id FROM file WHERE path = $path LIMIT 1) ORDER BY id DESC LIMIT 1) ORDER BY id DESC LIMIT 1))", {
				$stacktrace: stacktrace,
				$sum: sum,
				$funName: funName,
				$path: file
			}, this.insertCb);
		});
	}

	public addLineInspect(file: string, line: number, key: string, value?: string)
	{
		let varName = key;
		let varValue = "";
		let msg = "";
		if (value) {
			varValue = value;
		} else {
			msg = varName;
			varName = "";
		}

		this.db.serialize(() => {
			this.db.run("INSERT INTO inspect (line, var_name, var_value, msg, trial_id) VALUES ($line, $varName, $varValue, $msg, (SELECT id FROM trial WHERE function_id = (SELECT id FROM function WHERE line_start <= $line AND line_end >= $line AND file_id = (SELECT id FROM file WHERE path = $path LIMIT 1) ORDER BY id DESC LIMIT 1) ORDER BY id DESC LIMIT 1))", {
				$line: line,
				$varName: varName,
				$varValue: varValue,
				$msg: msg,
				$path: file
			}, this.insertCb);
		});
	}

	public functionReturn(file: string, funName: string, time: number, line?: number, key?: string, value?: string)
	{
		if (!line)
			line = 0;
		this.db.serialize(() => {
			this.db.run("UPDATE trial SET return_time = $time, return_line = $line WHERE function_id = (SELECT id FROM function WHERE name = $funName AND file_id = (SELECT id FROM file WHERE path = $path LIMIT 1) ORDER BY id DESC LIMIT 1)", {
				$time: (time * 1000000).toFixed(0),
				$line: line,
				$funName: funName,
				$path: file
			}, this.insertCb);
		});
		if (key)
			this.addLineInspect(file, line, key, value);
	}

	private insertCb(err: Error | null)
	{
		if (err)
			this.error(err.message);
	}

	private error(err: string) {
		console.log(err);
	}
}
