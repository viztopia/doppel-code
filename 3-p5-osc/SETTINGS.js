// display
const W = 600;
const H = 500;
const INFOX = W/2 - 250;
const INFOY = H/2;

const VIDEOPATH = 'https://player.vimeo.com/external/591790914.hd.mp4?s=5423196882ed55a554896959f602c265d48c0af4&profile_id=175';


const PERFORM = true;
const PRESETDELAYS = [4, 4.5, 6, 10];

// Names Mode indices
const PRESET = 0;
const MANUAL = 1;
const SPEED = 2;
const PLATEAU = 3;
const BOOKMARK = 4;
// Mode names
const MODENAMES = ['PRESET', 'MANUAL', 'SPEED', 'PLATEAU', 'BOOKMARK'];
const MODEBGS =  [[140, 226, 238], [147, 186, 225], [137, 132, 214], [114, 81, 178], [164, 188, 188]];

// COMMUNICATIONS
const PORT = 8081;

// //--------------OBS & TD config-------------
let RECORDINGFPS = 30;
let RECORDINGSECONDS = 60; //length of each OBS recording clip in seconds
let RECORDINGFRAMES = RECORDINGFPS * RECORDINGSECONDS;
let CAMFPS = 30; //should be the same as recording FPS
let TDCACHELENGTH = 60; //length of cache in TD in seconds. Ideally this should match with recording length so that there won't be gaps between recordings and TD cache.
let TDCACHEFRAMES = CAMFPS * TDCACHELENGTH; //this should match the size of the Cache TOP in TD
