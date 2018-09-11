/* eslint-disable no-console */

const fs = require('fs');
const os = require('os');
const path = require('path');
const sqlite = require('sqlite-sync');
const walkSync = require('walk-sync');

const savepath = 'saved.json';

/**
 * Finds JW app databases.
 */
function findDatabases() {
  const home = process.env.APPDATA
    || (process.platform == 'darwin' ? `${os.homedir()}/Library/Preferences` : '/var/local');
  const paths = walkSync(home, {
    basedir: home,
    globs: ['**/WatchtowerBibleandTractSo.JWLibrarySignLanguage*/**/userData.db'],
  });
  return paths.map(item => path.join(home, item));
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

const paths = findDatabases();
if (paths.length == 1) {
  const dbPath = paths[0];
  console.log(`Using database: ${dbPath}`);
  const playlists = findPlaylists(dbPath);
  const playlist = playlists.length ? playlists[0] : { TagId: 0, Name: 'Not Found' };
  console.log(`Exporting playlist #${playlist.TagId}: "${playlist.Name}".`);
  const data = exportPlaylist(dbPath, playlist.TagId);
  fs.writeFileSync(savepath, JSON.stringify(data));
  console.log(`Saved data at ${savepath}.`);
} else if (paths.length) {
  console.log('More than one JW App database found!');
} else {
  console.log('No JW App database was found.');
}
