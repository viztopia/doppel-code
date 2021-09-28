// Display
const W = 600;
const H = 500;
const INFOX = W/2 - 250;
const INFOY = H/2;

const VIDEOPATH = 'https://player.vimeo.com/external/591790914.hd.mp4?s=5423196882ed55a554896959f602c265d48c0af4&profile_id=175';


const PERFORM = true;

// Names Mode indices
const PRESET = 0;
const MANUAL = 1;
const SPEED = 2;
const PLATEAU = 3;
const BOOKMARK = 4;
const FLASHING = 5;
// Mode names
const MODENAMES = ['PRESET', 'MANUAL', 'SPEED', 'PLATEAU', 'BOOKMARK','FLASHING'];
const MODEBGS =  [[140, 226, 238], [147, 186, 225], [137, 132, 214], [114, 81, 178], [164, 188, 188]];

const PRESETS = [4, 4.5, 6, 10];

// Speed mapping
const MAXJOINTDIST = W / 20;

// Sockets
const SOCKETPORT = 8081;

// //--------------TD config-------------
const CACHE = 0;
const RECORDINGS = 1;

const RECORDINGFPS = 30;
const RECORDINGSECONDS = 30; //length of each OBS recording clip in seconds
const RECORDINGFRAMES = RECORDINGFPS * RECORDINGSECONDS;
//-------------------other------------
let RECORDINGGAP = 1000; //in milli secs. KNOWN ISSUE: some time is required to finish saving the current recording to disk before we can start recording the next clip, especially with high CPU.

// How long to wait to play new recorded file
const PULSEDELAY = 100;

const CAMFPS = 30; //should be the same as recording FPS
const CACHELENGTH = 30; //length of cache in TD in seconds. Ideally this should match with recording length so that there won't be gaps between recordings and TD cache.
const CACHEFRAMES = CAMFPS * CACHELENGTH; //this should match the size of the Cache TOP in TD
