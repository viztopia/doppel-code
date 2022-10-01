// Display
const W = 600;
const H = 600;
const INFOX = W / 2 - 250;
const INFOY = H / 2;

const VIDEOPATH = 'https://player.vimeo.com/external/591790914.hd.mp4?s=5423196882ed55a554896959f602c265d48c0af4&profile_id=175';


const PERFORM = true;

// Names Mode indices
const PRESET = 0;
const MANUAL = 1;
const SPEED = 2;
const PLATEAU = 3;
const BOOKMARK = 4;
const OTHER = 5;

// Mode names
const MODENAMES = ['PRESET', 'MANUAL', 'SPEED', 'PLATEAU', 'BOOKMARK', 'OTHER'];
const MODEBGS = [[140, 226, 238], [147, 186, 225], [137, 132, 214], [114, 81, 178], [164, 188, 188], [200, 200, 200]];

// Delay presets
const PRESETS = [0, 4, 4.5, 6, 10, 20, 55];

// Sockets
const SOCKETPORT = 8081;

// //--------------TD config-------------
const CACHE = 0;
const RECORDINGS = 1;
const VIDEO = 2;

const RECORDINGFPS = 30;
const RECORDINGSECONDS = 30; //length of each OBS recording clip in seconds
const RECORDINGFRAMES = RECORDINGFPS * RECORDINGSECONDS;
//-------------------other------------
let RECORDINGGAP = 1000; //in milli secs. KNOWN ISSUE: some time is required to finish saving the current recording to disk before we can start recording the next clip, especially with high CPU.

// How long to wait to play new recorded file
const PULSEDELAY = 100;

const CAMFPS = RECORDINGFPS; //should be the same as recording FPS
const CACHELENGTH = 30; //length of cache in TD in seconds. Ideally this should match with recording length so that there won't be gaps between recordings and TD cache.
const CACHEFRAMES = CAMFPS * CACHELENGTH; //this should match the size of the Cache TOP in TD

// FFREW
const FFREW_INTERVAL = 50;

// DMX
const DMXSendInterval = 50; // how fast to send DMX commands, in milli secs (to prevent flooding)
const DMXPRESETS = {
    //using a, b, c as light IDs to not confused with their actual channel number

    "setup": { a: { channel: 4, level: 255, duration: 0.1 }, b: { channel: 10, level: 255, duration: 0.1 }, c: { channel: 16, level: 255, duration: 0.1 } },

    //joke should turn off back stage light. TBD
    "jokecut": { a: { channel: 4, level: 255, duration: 0.1 }, b: { channel: 10, level: 255, duration: 0.1 }, c: { channel: 16, level: 255, duration: 0.1 } },

    "normalcut": { a: { channel: 4, level: 128, duration: 0.1 }, b: { channel: 10, level: 128, duration: 0.1 }, c: { channel: 16, level: 128, duration: 0.1 } },

    "normalfade": { a: { channel: 4, level: 128, duration: 5 }, b: { channel: 10, level: 128, duration: 5 }, c: { channel: 16, level: 128, duration: 5 } },

    "stripe" : { a: { channel: 4, level: 0, duration: 0.1 }, b: { channel: 10, level: 0, duration: 0.1 }, c: { channel: 16, level: 64, duration: 0.1 } },

    "cut" : { a: { channel: 4, level: 0, duration: 0.1 }, b: { channel: 10, level: 0, duration: 0.1 }, c: { channel: 16, level: 0, duration: 0.1 } },

    "fadeout" : { a: { channel: 4, level: 0, duration: 5 }, b: { channel: 10, level: 0, duration: 5 }, c: { channel: 16, level: 0, duration: 5 } },

    "jokefade": { a: { channel: 4, level: 255, duration: 5 }, b: { channel: 10, level: 255, duration: 5 }, c: { channel: 16, level: 255, duration: 5 } },

    "solo": { a: { channel: 4, level: 0, duration: 0.1 }, b: { channel: 10, level: 96, duration: 10 }, c: { channel: 16, level: 96, duration: 10 } },

}


//-------------cueing sound--------------
const SOUNDCUEDELAY = 2500;