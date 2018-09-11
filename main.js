#!/usr/bin/env node

/* eslint-disable no-console */

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
  const home = process.platform === 'darwin' ? `${os.homedir()}/Library/Preferences` : path.join(process.env.APPDATA, '..', 'Local', 'Packages');
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
  return playlists;
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

program.parse(process.argv);
