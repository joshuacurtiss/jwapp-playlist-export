/* eslint-disable no-console */

const fs = require('fs');
const sqlite = require('sqlite-sync');

const savepath = 'saved.json';
const path =
    '/Users/josh/OneDrive/Documents/WatchtowerBibleandTractSo.JWLibrarySignLanguage_5rz59y55nfz3e/LocalState/UserData/userData.db';
const id = 2;

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
        TagMap: []
    };
    sqlite.connect(dbPath);
    sqlite.run(`select * from Tag where TagId=${tagId}`, res => {
        if (res.error) console.error(res.error);
        saved.Tag = res;
    });
    sqlite.run(`select * from TagMap where TagId=${tagId}`, res => {
        if (res.error) console.error(res.error);
        saved.TagMap = res;
        playlistItemIds = res.map(item => item.PlaylistItemId);
    });
    sqlite.run(`select * from PlaylistItem where PlaylistItemId in (${playlistItemIds})`, res => {
        if (res.error) console.error(res.error);
        saved.PlaylistItem = res;
        playlistMediaIds = res.map(item => item.PlaylistMediaId);
    });
    sqlite.run(`select * from PlaylistItemChild where PlaylistItemId in (${playlistItemIds})`, res => {
        if (res.error) console.error(res.error);
        saved.PlaylistItemChild = res;
    });
    sqlite.run(`select * from PlaylistMedia where PlaylistMediaId in (${playlistMediaIds})`, res => {
        if (res.error) console.error(res.error);
        saved.PlaylistMedia = res;
        locationIds = res.map(item => item.LocationId);
    });
    sqlite.run(`select * from Location where LocationId in (${locationIds})`, res => {
        if (res.error) console.error(res.error);
        saved.Location = res;
    });
    sqlite.close();
    return saved;
}

let data = exportPlaylist(path, id);
fs.writeFileSync(savepath, JSON.stringify(data));
console.log('Saved data.\n\n');
