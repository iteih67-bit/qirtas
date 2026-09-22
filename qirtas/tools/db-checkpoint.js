// Checkpoint the WAL so the tracked qirtas.db is self-contained before a commit.
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync(path.resolve(__dirname, '..', 'data', 'qirtas.db'));
db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
console.log('wal checkpointed: books=' + db.prepare('select count(*) c from books').get().c);
db.close();
