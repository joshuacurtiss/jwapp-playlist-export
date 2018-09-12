#!/usr/bin/env node

/* eslint-disable no-console,max-len,eqeqeq,no-param-reassign */

const fs = require('fs');
const os = require('os');
const path = require('path');
const program = require('commander');
const sqlite = require('sqlite-sync');
const walkSync = require('walk-sync');

/**
 * Finds JW app databases.
 */
function findDatabases() {
  const home = process.platform === 'darwin'
    ? `${os.homedir()}/Library/Preferences`
    : path.join(process.env.APPDATA, '..', 'Local', 'Packages');
  const paths = walkSync(home, {
    basedir: home,
    globs: ['**/WatchtowerBibleandTractSo.JWLibrarySignLanguage*/**/userData.db'],
  });
  return paths.map(item => path.join(home, item));
}

/**
 * Finds the JW database. Returns error if it can't find a single database.
 */
function findDatabase() {
  const paths = findDatabases();
  if (paths.length === 1) return paths[0];
  if (paths.length) console.error('More than one JW App database found!');
  else console.error('No JW App database was found.');
  return '';
}

/**
 * Finds the playlists in a given database.
 * @param {string} dbPath The path to the database.
 */
function findPlaylists(dbPath) {
  let playlists = [];
  sqlite.connect(dbPath);
  sqlite.run('select TagId, Name from Tag where Type=2', (res) => {
    if (res.error) console.error(res.error);
    playlists = res;
  });
  sqlite.close();
  return playlists;
}

function sanitizePlaylistName(dbPath, name) {
  const playlists = findPlaylists(dbPath);
  const playlistNames = playlists.map(item => item.Name);
  let newname = name;
  while (playlistNames.includes(newname)) {
    const words = newname.split(' ');
    let inc = words.pop();
    if (!/^\d+$/.test(inc)) {
      words.push(inc);
      inc = 2;
    } else {
      inc = Number(inc) + 1;
    }
    words.push(inc);
    newname = words.join(' ');
  }
  return newname;
}

function isError(desc, item) {
  if (typeof item === 'object') console.error(`While trying to save ${desc}:\n${item.error.toString().split('\n')[0]}`);
  return typeof item === 'object';
}

/**
 * Will load JSON and import into a given database. Returns true/false for success.
 * @param {string} dbPath The path to the database.
 * @param {string} json The json to be deserialized and loaded.
 * @returns {boolean} Whether successful or not.
 */
function importPlaylist(dbPath, json) {
  const data = JSON.parse(json);
  const tag = data.Tag[0];
  tag.Name = sanitizePlaylistName(dbPath, tag.Name);
  sqlite.connect(dbPath);
  sqlite.run('PRAGMA journal_mode=OFF');
  sqlite.run('PRAGMA locking_mode=EXCLUSIVE');
  // Tag -> Update TagId in TagMap
  if (tag) {
    const obj = Object.assign({}, tag);
    delete obj.TagId;
    const newId = sqlite.insert('Tag', obj);
    if (isError('Tag', newId)) return false;
    tag.TagId = newId;
    data.TagMap.forEach((item) => {
      item.TagId = newId;
    });
  }
  // Location -> Update LocationId in PlaylistMedia, TagMap
  data.Location.forEach((location) => {
    const oldId = location.LocationId;
    const obj = Object.assign({}, location);
    delete obj.LocationId;
    // First, check if an idential Location record exists.
    const chk = sqlite.run(
      `
        select LocationId
        from Location
        where BookNumber ${obj.BookNumber === null ? 'is null' : `=${obj.BookNumber}`} and
        ChapterNumber ${obj.ChapterNumber === null ? 'is null' : `=${obj.ChapterNumber}`} and
        DocumentId ${obj.DocumentId === null ? 'is null' : `=${obj.DocumentId}`} and
        Track ${obj.Track === null ? 'is null' : `=${obj.Track}`} and
        IssueTagNumber ${obj.IssueTagNumber === null ? 'is null' : `=${obj.IssueTagNumber}`} and
        KeySymbol ${obj.KeySymbol === null ? 'is null' : `='${obj.KeySymbol}'`} and
        MepsLanguage ${obj.MepsLanguage === null ? 'is null' : `=${obj.MepsLanguage}`} and
        Type ${obj.Type === null ? 'is null' : `=${obj.Type}`}
      `,
    );
    const chkresult = chk[0].values[0];
    // If the record exists, just use its ID. Otherwise, insert new rec.
    let newId = 0;
    if (chkresult.length) {
      newId = chkresult[0]; // eslint-disable-line prefer-destructuring
    } else {
      newId = sqlite.insert('Location', obj);
    }
    if (isError('Location', newId)) return;
    data.PlaylistMedia.forEach((item) => {
      if (item.LocationId == oldId) item.LocationId = newId;
    });
    data.TagMap.forEach((item) => {
      if (item.LocationId == oldId) item.LocationId = newId;
    });
  });
  // PlaylistMedia -> Update PlaylistMediaId in PlaylistItem
  data.PlaylistMedia.forEach((playlistmedia) => {
    const oldId = playlistmedia.PlaylistMediaId;
    const obj = Object.assign({}, playlistmedia);
    delete obj.PlaylistMediaId;
    // First, check if an idential Location record exists.
    const chk = sqlite.run(
      `
        select PlaylistMediaId
        from PlaylistMedia
        where MediaType ${obj.MediaType === null ? 'is null' : `=${obj.MediaType}`} and
        LocationId ${obj.LocationId === null ? 'is null' : `=${obj.LocationId}`}
      `,
    );
    const chkresult = chk[0].values[0];
    // If the record exists, just use its ID. Otherwise, insert new rec.
    let newId = 0;
    if (chkresult.length) {
      newId = chkresult[0]; // eslint-disable-line prefer-destructuring
    } else {
      newId = sqlite.insert('PlaylistMedia', obj);
    }
    if (isError('PlaylistMedia', newId)) return;
    data.PlaylistItem.forEach((item) => {
      if (item.PlaylistMediaId == oldId) item.PlaylistMediaId = newId;
    });
  });
  // PlaylistItem -> Update PlaylistItemId in PlaylistItemChild, TagMap
  data.PlaylistItem.forEach((playlistitem) => {
    const oldId = playlistitem.PlaylistItemId;
    const obj = Object.assign({}, playlistitem);
    delete obj.PlaylistItemId;
    const newId = sqlite.insert('PlaylistItem', obj);
    if (isError('PlaylistItem', newId)) return;
    data.PlaylistItemChild.forEach((item) => {
      if (item.PlaylistItemId == oldId) item.PlaylistItemId = newId;
    });
    data.TagMap.forEach((item) => {
      if (item.PlaylistItemId == oldId) item.PlaylistItemId = newId;
    });
  });
  // TagMap
  data.TagMap.forEach((tagmap) => {
    const obj = Object.assign({}, tagmap);
    delete obj.TagMapId;
    const newId = sqlite.insert('TagMap', obj);
    isError('TagMap', newId);
  });
  // PlaylistItemChild
  data.PlaylistItemChild.forEach((playlistitemchild) => {
    const obj = Object.assign({}, playlistitemchild);
    delete obj.PlaylistItemChildId;
    const newId = sqlite.insert('PlaylistItemChild', obj);
    isError('PlaylistItemChild', newId);
  });
  sqlite.run('PRAGMA journal_mode=WAL');
  sqlite.run('PRAGMA locking_mode=NORMAL');
  sqlite.close();
  return true;
}

/**
 * Will load the data for a given playlist in a given database. Returns object with data.
 * @param {string} dbPath The path to the database.
 * @param {number} tagId The tag ID, or basically, the playlist ID.
 */
function exportPlaylist(dbPath, tagId) {
  let playlistItemIds = [];
  let playlistMediaIds = [];
  let locationIds = [];
  const saved = {
    Location: [],
    PlaylistItem: [],
    PlaylistItemChild: [],
    PlaylistMedia: [],
    Tag: [],
    TagMap: [],
  };
  sqlite.connect(dbPath);
  sqlite.run(`select * from Tag where TagId=${tagId}`, (res) => {
    if (res.error) console.error(res.error);
    saved.Tag = res;
  });
  sqlite.run(`select * from TagMap where TagId=${tagId}`, (res) => {
    if (res.error) console.error(res.error);
    saved.TagMap = res;
    playlistItemIds = res.map(item => item.PlaylistItemId);
  });
  sqlite.run(`select * from PlaylistItem where PlaylistItemId in (${playlistItemIds})`, (res) => {
    if (res.error) console.error(res.error);
    saved.PlaylistItem = res;
    playlistMediaIds = res.map(item => item.PlaylistMediaId);
  });
  sqlite.run(
    `select * from PlaylistItemChild where PlaylistItemId in (${playlistItemIds})`,
    (res) => {
      if (res.error) console.error(res.error);
      saved.PlaylistItemChild = res;
    },
  );
  sqlite.run(`select * from PlaylistMedia where PlaylistMediaId in (${playlistMediaIds})`, (res) => {
    if (res.error) console.error(res.error);
    saved.PlaylistMedia = res;
    locationIds = res.map(item => item.LocationId);
  });
  sqlite.run(`select * from Location where LocationId in (${locationIds})`, (res) => {
    if (res.error) console.error(res.error);
    saved.Location = res;
  });
  sqlite.close();
  return saved;
}

program
  .command('list')
  .alias('ls')
  .description('List playlists')
  .action(() => {
    const dbPath = findDatabase();
    if (dbPath.length) {
      const playlists = findPlaylists(dbPath);
      console.log(`Found ${playlists.length} playlist(s).`);
      if (playlists.length) {
        console.log('\nID\tName');
        playlists.forEach((item) => {
          console.log(`${item.TagId}\t${item.Name}`);
        });
        console.log('');
      }
    }
  });

program
  .command('export')
  .alias('exp')
  .description('Export playlist.')
  .option('-p, --playlist <id>', 'Playlist name or number to save')
  .option('-f, --file <path>', 'File to save to')
  .action((options) => {
    const dbPath = findDatabase();
    if (!dbPath.length) return;
    const playlists = findPlaylists(dbPath);
    let playlist = 0;
    if (options.playlist) {
      playlist = playlists.find(
        // eslint-disable-next-line eqeqeq
        item => options.playlist == item.TagId
          || options.playlist.toLowerCase() === item.Name.toLowerCase(),
      );
    }
    if (!playlist) {
      console.error('Could not find your playlist.');
      return;
    }
    const data = exportPlaylist(dbPath, playlist.TagId);
    const dataJson = JSON.stringify(data);
    if (options.file) fs.writeFileSync(options.file, dataJson);
    else console.log(dataJson);
  });

program
  .command('import')
  .alias('imp')
  .description('Import playlist.')
  .option('-f, --file <path>', 'File with playlist to import')
  .action((options) => {
    const dbPath = findDatabase();
    if (!dbPath.length) return;
    if (!fs.existsSync(options.file)) {
      console.error('File does not exist!');
      return;
    }
    const json = fs.readFileSync(options.file, 'utf8');
    if (json.length) {
      const success = importPlaylist(dbPath, json);
      console.log(success ? 'Successfully imported!' : 'There was a problem.');
    } else {
      console.log('File did not have any data!');
    }
  });

program.parse(process.argv);
