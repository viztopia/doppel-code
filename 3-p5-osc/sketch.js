// choreography logic, updated 08/07:
// 1. Based on current class, pick one plateau with the same class; if no corresponding plateaus found, just play current frame;
// 2. If one plateau finishes and we're still in the same class, pick another plateau with the same class;
// 3. If we receive a new class in the middle of a plateau playback, jump to a new plateau that matches the new class;

let socket;
let socketPort = 8081; 

let isRecording = false;
let btnStart, btnStop;

let recordingFPS = 30;
let recordingLength = 60; //length of each OBS recording clip in seconds
let framesPerRecording = recordingFPS * recordingLength;
let camFPS = 30; //should be the same as recording FPS
let TDCacheLength = 60; //length of cache in TD in seconds. Ideally this should match with recording length so that there won't be gaps between recordings and TD cache.
let TDCacheFrames = camFPS * TDCacheLength; //this should match the size of the Cache TOP in TD

//------------------TD control----------------------
let recordIntervalID;
let started = false;
let startTime = 0;
let recordedSeconds;
let lastAvailableFrames = 0; // used to refresh the controlling timeline

//-------------------clasification plateau stuff----------------
let plateauOn = false;
let plateaus = new Map();
let currentClass;
let haveNewClass = false;
let currentClipFinished = true;
let lastDelayedFrameIdx;

//-------------------other------------
let OBSRecordingGap = 1000; //in milli secs. KNOWN ISSUE: some time is required to finish saving the current recording to disk before we can start recording the next clip, especially with high CPU.

function setup() {
	createCanvas(600, 500);
	setupOsc(12000, 12001, 13000, 13001); //OBS In / Out, TD In / Out
	btnStart = createButton('START');
	btnStart.position(0, 0);
	btnStart.mousePressed(startPerformance);
	btnStop = createButton('STOP');
	btnStop.position(100, 0);
	btnStop.mousePressed(stopPerformance);

	textSize(14);
}

function draw() {
	background(255, 0, 255);
	fill(0);
	ellipse(mouseX, mouseY, 50, 50);
	if (!started) {
		text("Please clean all recording files first except record.mp4 before START", width / 2 - 225, height / 2);
		text("The first recording file will be named 'recording(2).mp4', then 3, 4, ...", width / 2 - 225, height / 2 + 25);
		sendOscTD("/fileIdx", 0);
	} else {

		recordedSeconds = floor((Date.now() - startTime) / 1000);
		text("Performance & recording started for " + recordedSeconds + " seconds, " + recordedSeconds * recordingFPS + " frames", width / 2 - 250, height / 2 - 75);
		text("Plateau classification is: " + (plateauOn ? "On, auto controlling TD" : "Off, manual controlling TD."), width / 2 - 250, height / 2 - 50);

		//----------------------auto-controlling TD using plateau data------------------------

		//----------------------1. first we calculate how many cached/recorded content is available
		let availableRecordingNum = floor(recordedSeconds / recordingLength);
		let availableTDCacheSeconds = recordedSeconds > TDCacheLength ? TDCacheLength : recordedSeconds;
		text(availableRecordingNum + " recording clips and " + availableTDCacheSeconds + " seconds in TD cache available", width / 2 - 250, height / 2 - 25);

		let delayFrameIdx;

		//-----------------------2. then based on if plateau classification is on, we calculate the number of frames to be delayed either automatically or manually
		if (plateauOn) {
			//----------------------auto controlling TD using plateau data------------------------
			// console.log(haveNewClass, currentClipFinished);
			if (haveNewClass || currentClipFinished) {
				//pick a plateau whenever there's a new class or the current clip is finished
				let [pStartTime, pLength] = getStartTimeAndLengthRandom(plateaus, currentClass);

				if (pStartTime && pLength){
					delayFrameIdx = floor((Date.now() - startTime - pStartTime) / 1000 * camFPS); //convert plateau start time to how many frames we should go back from the present
					lastDelayedFrameIdx = delayFrameIdx;
					haveNewClass = false;
					currentClipFinished = false;
	
					setTimeout(() => { currentClipFinished = true }, pLength);
				}

			} else {
				//otherwise continue on the current clip
				delayFrameIdx = lastDelayedFrameIdx;
			}

			text("current class is:" + currentClass, width / 2 - 150, height / 2 + 25);


		} else {
			//----------------------manual controlling TD using mouse------------------------

			//first calculate the number of frames available for manual srubbing
			//dynamically allocating TD cached frames for scrubbing is too glitchy, so we assume TD is already fully cached.
			let availableFrames = availableRecordingNum * framesPerRecording + TDCacheFrames;

			//then we reversely map mouseX with available Frames
			delayFrameIdx = constrain(floor(map(mouseX, 0, width, availableFrames, 0)), 0, availableFrames);

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

			text("showing delayed frame:" + delayFrameIdx, width / 2 - 250, height / 2 + 50);
			text("showing file:" + cueFileIdx + " cuePoint: " + cuePoint, width / 2 - 250, height / 2 + 75);

		} else {
			text("No available delay frames yet. Showing TD current frame", width / 2 - 250, height / 2 + 50);
			sendOscTD("/mode", 1); //mode 1: load frame from TD cache memory
			sendOscTD("/frameIdx", 0);
		}

	}
}

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

}

function toggleOBSRecording() {
	if (isRecording) {
		sendOsc("/stopRecording", "");
	} else {
		sendOsc("/startRecording", "");
	}
	isRecording = !isRecording;
}

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
