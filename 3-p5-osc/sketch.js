// choreography logic, updated 08/24:
// 0: Fixed interval mode: fixed interval looping btw 4s, 4.5s, 6s and 10s
// 1: Manual 1 mode: manual mode controlling the number of frames to delay using 1 interval;
// 2: Speed mode: based on the joint distance, calcualte the amount of delay;
// 3: Plateau mode: based on current class, pick one plateau with the same class; if no corresponding plateaus found, just play current frame;
// - If one plateau finishes and we're still in the same class, pick another plateau with the same class;
// - If we receive a new class in the middle of a plateau playback, jump to a new plateau that matches the new class;
// - Added code and modes for plateau-based control and speed-based control and manual
// 4: Bookmark mode: Q to save the current time as a bookmark, W to jump to bookmark

let w = 600;
let h = 500;

//---------------modes config---------------------
let mode = 0; // 0: fixed interval, 1: manual 1 interval, 2: speed-based, 3:plateau-based, 4: bookmark
let modePrev = 0;
let delayFrameIdxPrev = 0;
let fixedIntervalIdx = 0;
let fixedIntervals = [4, 4.5, 6, 10];
let manualCount1 = 0;
let manualCount1Thres = 6000;
let blackoutLeft = false; //key A to blackout / un-blackout left half
let blackoutRight = false; //key S to blackout / un-blackout right half

//--------------sockets config-----------------------
let socket;
let socketPort = 8081;

//--------------OBS & TD config-------------
let recordingFPS = 30;
let recordingLength = 60; //length of each OBS recording clip in seconds
let framesPerRecording = recordingFPS * recordingLength;
let camFPS = 30; //should be the same as recording FPS
let TDCacheLength = 60; //length of cache in TD in seconds. Ideally this should match with recording length so that there won't be gaps between recordings and TD cache.
let TDCacheFrames = camFPS * TDCacheLength; //this should match the size of the Cache TOP in TD

//-------------show settings--------------
let btnStart, btnStartVideo, btnStop;
let started = false;
let startTime = 0;
let isRecording = false;
let recordIntervalID;
let recordedSeconds;

//-------------------mode 0: fixed interval stuff-------------------
let fixedFrame = 0;

//-------------------mode 2: speed-based delay stuff-----------------------
let jointDist = 0;
let maxJointDist = w / 20; //an arbitrary guess of the maximum distance of joint position between two frames
let framesToCache = 600; //caching 10 seconds for testing, so 10 * 60 = 600 frames
let cachedFrames = [];
let mappedFrames = [];
let avgFrame = 0;

//-------------------mode 3: clasification plateau stuff----------------
let plateauOn = false;
let plateaus = new Map();
let currentClass;
let haveNewClass = false;
let currentClipFinished = true;
let lastPlateauFrameIdx;

//-------------------mode 4: bookmark stuff-----------------------
let bookmarkTime = -99;
let haveNewJump = false;
let lastJumpedFrameIdx;

//-------------------other------------
let OBSRecordingGap = 1000; //in milli secs. KNOWN ISSUE: some time is required to finish saving the current recording to disk before we can start recording the next clip, especially with high CPU.

function setup() {
	createCanvas(w, h);
	setupOsc(12000, 12001, 13000, 13001); //ports for OBS In / Out, TD In / Out

	btnStart = createButton('START'); //master control: start performance 
	btnStart.position(0, 0);
	btnStart.mousePressed(startPerformance);
	btnStartVideo = createButton('START VIDEO'); //master control: start performance in video mode (in progress)
	btnStartVideo.position(80, 0);
	btnStartVideo.mousePressed(()=>{startVideo(); startPerformance();});
	btnStop = createButton('STOP'); //master control: stop performance 
	btnStop.position(200, 0);
	btnStop.mousePressed(stopPerformance);

	textSize(14);
}

function draw() {

	if (!started) {
		background(255, 0, 255);

		text("Please clean all recording files first except record.mp4 before START", width / 2 - 225, height / 2);
		text("The first recording file will be named 'recording(2).mp4', then 3, 4, ...", width / 2 - 225, height / 2 + 25);
		sendOscTD("/fileIdx", 0);
	} else {

		//--------draw backgrounds in different color---------------
		if (mode == 0) background(140, 226, 238);
		else if (mode == 1) background(147, 186, 225);
		else if (mode == 2) background(137, 132, 214);
		else if (mode == 3) background(114, 81, 178);
		else if (mode == 4) background(164, 188, 188);

		//--------display show time------------------
		recordedSeconds = floor((Date.now() - startTime) / 1000);
		text("Performance & recording started for " + recordedSeconds + " seconds, " + recordedSeconds * recordingFPS + " frames", width / 2 - 250, height / 2 - 75);

		//----------------------1. first we calculate how many cached/recorded content is available-----------
		let availableRecordingNum = floor(recordedSeconds / recordingLength);
		let availableTDCacheSeconds = recordedSeconds > TDCacheLength ? TDCacheLength : recordedSeconds;
		text(availableRecordingNum + " recording clips and " + availableTDCacheSeconds + " seconds in TD cache available", width / 2 - 250, height / 2 - 50);

		//----------------------2. then we calculate how many frames to delay based on the current mode------------
		let delayFrameIdx;

		if (mode == 0) {//------------fixed interval--------------------------
			if (modePrev != mode) { modePrev = mode; }

			textSize(40);
			text("mode: fixed intervals", width / 2 - 200, height / 2 - 150);
			textSize(14);

			if (fixedFrame < fixedIntervals[fixedIntervalIdx] * recordingFPS) fixedFrame++;
			else if (fixedFrame > fixedIntervals[fixedIntervalIdx] * recordingFPS) fixedFrame--;
			// delayFrameIdx = fixedIntervals[fixedIntervalIdx] * recordingFPS;
			delayFrameIdx = fixedFrame;

			text("Current interval is: " + fixedIntervals[fixedIntervalIdx] + " seconds", width / 2 - 250, height / 2 + 25);

			delayFrameIdxPrev = delayFrameIdx; //cache the previous delay frame. used for manual 1 interval mode.

		} else if (mode == 1) {//------------manual 1 interval--------------------------
			if (modePrev != mode) { manualCount1 = delayFrameIdxPrev; modePrev = mode; } //keep the current delay from other modes if there's one already

			textSize(40);
			text("mode: manual 1", width / 2 - 150, height / 2 - 150);
			textSize(14);

			delayFrameIdx = manualCount1;

			text("Manual Count: " + manualCount1, width / 2 - 250, height / 2 + 25);

			if (delayFrameIdx > recordedSeconds * recordingFPS) {
				delayFrameIdx = recordedSeconds * recordingFPS;
				text("Maximum delay reached based on available recorded content.", width / 2 - 250, height / 2 + 50);
				text("Capping it to recordedSeconds * recordingFPS.", width / 2 - 250, height / 2 + 75);
			}

		} else if (mode == 2) { //------------speed-based--------------------------
			if (modePrev != mode) { modePrev = mode; }

			textSize(40);
			text("mode: speed", width / 2 - 150, height / 2 - 150);
			textSize(14);

			//map the jointDist amount to a frame index between 0 and framesToCache
			let mappedFrame = constrain(map(jointDist, 0, maxJointDist, 0, TDCacheFrames - 1), 0, TDCacheFrames - 1); //currently using only TD cache for performance considerations
			// console.log(mappedFrame);

			//save the mapped frame into an array to get avg frame
			mappedFrames.push(mappedFrame);
			if (mappedFrames.length > framesToCache) {
				mappedFrames.splice(0, 1);
			}

			if (mappedFrames.length > 0) {
				delayFrameIdx = floor(getAvg1d(mappedFrames));
				text("Current joint dist is: " + jointDist, width / 2 - 250, height / 2 + 25);
				text("Averaged delay frame is: " + delayFrameIdx, width / 2 - 250, height / 2 + 50);
			}

			delayFrameIdxPrev = delayFrameIdx; //cache the previous delay frame. used for manual 1 interval mode.

		} else if (mode == 3) { //-------------plateau-based----------------
			if (modePrev != mode) { modePrev = mode; }

			textSize(40);
			text("mode: plateau", width / 2 - 150, height / 2 - 150);
			textSize(14);

			text("Plateau classification is: " + (plateauOn ? "On." : "Off."), width / 2 - 250, height / 2 - 25);

			//-----------------------if plateau classification is on, we calculate the number of frames to be delayed either automatically or manually
			if (plateauOn) {
				if (!currentClass) socket.emit("queryClass");
				//----------------------auto controlling TD using plateau data------------------------
				// console.log(haveNewClass, currentClipFinished);
				if (haveNewClass || currentClipFinished) {
					//pick a plateau whenever there's a new class or the current clip is finished
					let [pStartTime, pLength] = getStartTimeAndLengthRandom(plateaus, currentClass);

					if (pStartTime && pLength) {
						delayFrameIdx = floor((Date.now() - startTime - pStartTime) / 1000 * camFPS); //convert plateau start time to how many frames we should go back from the present
						lastPlateauFrameIdx = delayFrameIdx;
						haveNewClass = false;
						currentClipFinished = false;

						setTimeout(() => { currentClipFinished = true }, pLength);
					}

				} else {
					//otherwise continue on the current clip
					delayFrameIdx = lastPlateauFrameIdx;
				}

				text("Current class is: " + currentClass, width / 2 - 250, height / 2 + 25);
				text("We need at least one complated plateau record to pull from the recording.", width / 2 - 250, height / 2 + 50);
				text("Current pulling method is: Random", width / 2 - 250, height / 2 + 75);

			} else {
				// //----------------------manual controlling TD using mouse as a fall back------------------------
				// fill(0);
				// ellipse(mouseX, mouseY, 50, 50);
				// //first calculate the number of frames available for manual srubbing
				// //dynamically allocating TD cached frames for scrubbing is too glitchy, so we assume TD is already fully cached.
				// let availableFrames = availableRecordingNum * framesPerRecording + TDCacheFrames;

				// //then we reversely map mouseX with available Frames
				// delayFrameIdx = constrain(floor(map(mouseX, 0, width, availableFrames - 1, 0)), 0, availableFrames - 1);
				delayFrameIdx = 0;
			}

			delayFrameIdxPrev = delayFrameIdx; //cache the previous delay frame. used for manual 1 interval mode.

		} else if (mode == 4) { //------------bookmark---------------------

			if (modePrev != mode) { modePrev = mode; }

			textSize(40);
			text("mode: bookmark", width / 2 - 150, height / 2 - 150);
			textSize(14);

			if (bookmarkTime < 0) {
				text("No bookmarks available yet. Press Q to save a bookmark.", width / 2 - 250, height / 2 + 25);
				delayFrameIdx = 0;
			} else {
				if (haveNewJump) { //if W is pressed
					delayFrameIdx = floor((Date.now() - startTime - bookmarkTime) / 1000 * camFPS);
					lastJumpedFrameIdx = delayFrameIdx;
					haveNewJump = false;
				} else { //otherwise stay on the last jump
					delayFrameIdx = lastJumpedFrameIdx;
				}

				text("Current bookmark is:" + bookmarkTime / 1000 + " seconds", width / 2 - 250, height / 2 + 25);
				text("Press W to jump, press Q to overwrite the current.", width / 2 - 250, height / 2 + 50);
			}

			delayFrameIdxPrev = delayFrameIdx; //cache the previous delay frame. used for manual 1 interval mode.
		}

		//-----------------------3. then control TD using delay frame----------------------------
		// console.log(delayFrameIdx);
		if (delayFrameIdx) {

			let cueFileIdx;
			let cuePoint;
			if (delayFrameIdx <= TDCacheFrames) {
				sendOscTD("/mode", 1); //mode 1: load frame from TD cache memory
				cueFileIdx = -99;
				cuePoint = 1 - delayFrameIdx / framesPerRecording;
				sendOscTD("/frameIdx", delayFrameIdx);

			} else {
				sendOscTD("/mode", 0); //mode 0: load frame from recordings
				let idxOfRecordingFromTD = floor((delayFrameIdx - TDCacheFrames) / framesPerRecording)
				cueFileIdx = availableRecordingNum - (idxOfRecordingFromTD + 1) + 2; // 2 is the offset for getting the correct recording file name idx in Windows. May need a different value for Mac.
				cuePoint = 1 - (delayFrameIdx - TDCacheFrames - idxOfRecordingFromTD * framesPerRecording) / framesPerRecording;
				sendOscTD("/fileIdx", cueFileIdx);
				sendOscTD("/cuePoint", cuePoint);
			}

			text("showing delayed frame:" + delayFrameIdx, width / 2 - 250, height / 2 + 125);
			text("showing file:" + cueFileIdx + " cuePoint: " + cuePoint, width / 2 - 250, height / 2 + 150);

		} else {
			text("No available delay frames yet. Showing TD current frame", width / 2 - 250, height / 2 + 125);
			sendOscTD("/mode", 1); //mode 1: load frame from TD cache memory
			sendOscTD("/frameIdx", 0);
		}

		//-----------------To-do: video mode--------------------
		//1. tell pose estimation & classification sketch to scrub to a specific time
		//2. tell TD to srub movie file in to a specific time
		//3. scrubbing method: TBD


	}
}
//----------------------Mode Select--------------------------
function keyPressed() {
	// console.log(keyCode);
	switch (keyCode) {
		case 48: //----0------
			mode = 0;
			break;
		case 49: //----1------
			mode = 1;
			break;
		case 50: //----2------
			mode = 2;
			break;
		case 51: //----3------
			mode = 3;
			break;
		case 52: //----4------
			mode = 4;
			haveNewJump = true;
			break;
		case LEFT_ARROW: //arrow left
			fixedIntervalIdx > 0 ? fixedIntervalIdx-- : fixedIntervalIdx = 0;
			manualCount1--;
			break;
		case RIGHT_ARROW: //arrow right
			fixedIntervalIdx < fixedIntervals.length - 1 ? fixedIntervalIdx++ : fixedIntervalIdx = fixedIntervals.length - 1;
			manualCount1++;
			break;
		case 81: //-----------Q: bookmark a time 
			bookmarkTime = Date.now() - startTime;
			break;
		case 87: //-----------W: jump to bookmark
			haveNewJump = true;
			break;
		case 65: //-----------A: toggle blackout left
			blackoutLeft = !blackoutLeft;
			sendOscTD("/blackoutLeft", blackoutLeft ? 1 : 0);
			break;
		case 83: //-----------S: blackout right
			blackoutRight = !blackoutRight;
			sendOscTD("/blackoutRight", blackoutRight ? 1 : 0);
			break;
	}

	// if (manualCount1 > manualCount1Thres) manualCount1 = manualCount1Thres;
	// if (manualCount1 < 0) manualCount1 = 0;
}


//----------------------Performance Start/Stop Control------------------------------

//-----used only for video mode------------- 
//Tell pose estimation & classification sketch and TD to start playting the video at the same time
//Need to change the source from VideoCaptureIn to MovieFileIn in TD first
function startVideo() { 
	socket.emit("startPlayingVideo", videoPath);
	sendOscTD();
}

//------start & stop performance----------------
function startPerformance() {
	//---clear plateau data
	plateaus.clear();

	//---record start time---
	startTime = Date.now();

	//start OBS recording
	toggleOBSRecording();

	recordIntervalID = setInterval(() => { // record a new clip every for every recordingLength seconds, so that both TD cache and hard drive recording latency is managable.
		console.log("Recording stopped at:" + (Date.now() - startTime));
		toggleOBSRecording();

		setTimeout(() => {
			console.log("Recording started at:" + (Date.now() - startTime));
			toggleOBSRecording();
		}, OBSRecordingGap); //KNOWN ISSUE--> seems that OBS will take a little bit of time to save a video file (less than 600ms for a 5min video). NEED TO FIX THIS!

	}, recordingLength * 1000);

	started = true;
	console.log("Show and recording started at: " + startTime);
}

function stopPerformance() {
	//---record stop time---
	started = false;
	clearInterval(recordIntervalID);
	sendOsc("/stopRecording", "");
	isRecording = false;
	console.log("Show and recording stopped at: " + (Date.now() - startTime));
	manualCount1 = 0;
	mode = 0;
	bookmarkTime = -99;

}

//----------OBS controls---------------
function toggleOBSRecording() {
	if (isRecording) {
		sendOsc("/stopRecording", "");
	} else {
		sendOsc("/startRecording", "");
	}
	isRecording = !isRecording;
}

//----------send a pulse to cue the recording for delay playback. currently used in plateau mode.
//might be useful for video mode too?
function mouseClicked() {
	sendOscTD("/cuePulse", 1);
	setTimeout(() => { sendOscTD("/cuePulse", 0) }, 20);
}

//-------------------------p5 OSC & Socket Setup--------------------------------------
function setupOsc(oscPortIn, oscPortOut, oscPortIn2, oscPortOut2) {
	socket = io.connect('http://127.0.0.1:' + socketPort, { port: socketPort, rememberTransport: false });
	socket.on('connect', function () {

		//---Setup OBS OSC---
		socket.emit('config1', {
			server: { port: oscPortIn, host: '127.0.0.1' },
			client: { port: oscPortOut, host: '127.0.0.1' }
		});

		//---Setup TD OSC---
		socket.emit('config2', {
			server: { port: oscPortIn2, host: '127.0.0.1' },
			client: { port: oscPortOut2, host: '127.0.0.1' }
		});
	});

	//---OBS---
	socket.on('message1', function (msg) {
		console.log("message1");
		if (msg[0] == '#bundle') {
			for (var i = 2; i < msg.length; i++) {
				receiveOsc(msg[i][0], msg[i].splice(1));
			}
		} else {
			receiveOsc(msg[0], msg.splice(1));
		}
	});

	//---TD---
	socket.on('message2', function (msg) {
		console.log("message2");
		if (msg[0] == '#bundle') {
			for (var i = 2; i < msg.length; i++) {
				receiveOsc(msg[i][0], msg[i].splice(1));
			}
		} else {
			receiveOsc(msg[0], msg.splice(1));
		}
	});

	//---socket msg from part 2 classification sketch------------------
	socket.on('plateauOn', function (msg) {
		console.log("plateau classification is: " + (msg ? "On" : "Off"));
		plateauOn = msg;
	});

	socket.on('plateauNew', function (p) {
		console.log("got a new plateau: ");
		console.log(p);

		//for each plateau, record its start time relative to the show's start time, i.e., how many milli seconds after the show starts.
		let st = p.start - startTime > 0 ? p.start - startTime : 0;

		if (!plateaus.has(p.className)) {
			plateaus.set(p.className, [{ start: st, length: p.end - p.start }]); // if plateau of this class never exists, add one.
		} else {
			plateaus.get(p.className).push({ start: st, length: p.end - p.start }); // if plateau of this class already exists, add data to array.
		}
		// console.log(plateaus);
		// plateaus.push({ className: p.className, start: p.start - startTime, length: p.end - p.start }); //save plateaus with timestamps in relation to recording start time 
	});

	socket.on('classNew', (c) => {
		if (currentClass != c) {
			haveNewClass = true;
			currentClass = c;
		};
	});

	socket.on('jointDist', (jd) => {
		jointDist = jd;
	});
}

function sendOsc(address, value) {
	socket.emit('message1', [address].concat(value));
}

function sendOscTD(address, value) {
	socket.emit('message2', [address].concat(value));
}

function receiveOsc(address, value) {
	console.log("received OSC: " + address + ", " + value);

	if (address == '/test') {
		x = value[0];
		y = value[1];
	}
}


//------------helper functions to get delay frame in TD-----------------------
function getStartTimeAndLengthFirstMatch(_plateaus) {
	let pltData = _plateaus.get(_currentClass);
	if (pltData.length > 0) {
		const foundPlateau = pltData[0];

		//converting from milli seconds to frames
		const delayFrame = floor(foundPlateau.start / 1000 * camFPS);
		return delayFrame;
	} else {
		return undefined;
	}
}

function getStartTimeAndLengthRandom(_plateaus, _currentClass) {
	let pltData = _plateaus.get(_currentClass);

	if (pltData) {
		const foundPlateau = chance.pickone(pltData);

		return [foundPlateau.start, foundPlateau.length];
	} else {
		return [undefined, undefined];
	}
}
