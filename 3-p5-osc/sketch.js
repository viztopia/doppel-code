let socket;

let isRecording = false;
let btnStart, btnStop;

let recordingFPS = 30;
let clipLength = 60; //length of each OBS recording clip in seconds
let framesPerClip = recordingFPS * clipLength;
let camFPS = 30;
let TDCacheLength = 60; //length of cache in TD in seconds
let TDCacheFrames = camFPS * TDCacheLength; //this should match the size of the Cache TOP in TD

let recordIntervalID;
let started = false;
let startTime = 0;
let recordedSeconds;

//-------------------clasification plateau stuff----------------
let plateauOn = false;
let plateaus = [];
let currentClass;

function setup() {
	createCanvas(500, 500);
	setupOsc(12000, 12001, 13000, 13001);
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
		text("please clean all recording files first except record.mp4 before START", width / 2 - 200, height / 2);
		sendOscTD("/fileIdx", 0);
	} else {

		recordedSeconds = floor((Date.now() - startTime) / 1000);
		text("recording stared for " + recordedSeconds + " seconds, " + recordedSeconds * recordingFPS + " frames", width / 2 - 150, height / 2 - 50);

		text("plateau classification is: " + (plateauOn ? "On, auto controlling TD" : "Off, manual controlling TD"), width / 2 - 150, height / 2 - 25);

		if (plateauOn) {
			// let delayFrameIdx = getDelayFrameFirstMatch(plateaus);
			let delayFrameIdx = getDelayFrameRandom(plateaus);

			// console.log(delayFrameIdx);
			if (delayFrameIdx) {
				if (delayFrameIdx < 600) {
					sendOscTD("/mode", 1); //mode 1: load frame from memory
					sendOscTD("/frameIdx", delayFrameIdx);
					text("showing delayed frame:" + delayFrameIdx, width / 2 - 150, height / 2);
				} else {
					text("the match is beyond 20 seconds.", width / 2 - 150, height / 2);
				}
			} else {
				text("no delay frames from plateau yet", width / 2 - 150, height / 2);
			}



		} else {
			let delayFrameIdx = floor(map(mouseX, 0, width, TDCacheFrames, 0));
			let cueFileIdx;
			let cuePoint;
			if (delayFrameIdx > 1200) {

				sendOscTD("/mode", 0); //mode 0: load frame from recordings
				cueFileIdx = 2;
				cuePoint = 1 - (delayFrameIdx - 1200) / framesPerClip;
				sendOscTD("/fileIdx", cueFileIdx);
				sendOscTD("/cuePoint", cuePoint);
			} else if (delayFrameIdx > 600) {
				sendOscTD("/mode", 0);
				cueFileIdx = 3;
				cuePoint = 1 - (delayFrameIdx - 600) / framesPerClip;
				sendOscTD("/fileIdx", cueFileIdx);
				sendOscTD("/cuePoint", cuePoint);
			} else {
				sendOscTD("/mode", 1); //mode 1: load frame from memory
				cueFileIdx = -99;
				cuePoint = 1 - delayFrameIdx / framesPerClip;
			}
			sendOscTD("/frameIdx", delayFrameIdx);
			text("showing delayed frame:" + delayFrameIdx, width / 2 - 150, height / 2);
			text("showing file:" + cueFileIdx + " cuePoint: " + cuePoint, width / 2 - 150, height / 2 + 25);
		}



	}
}

function startPerformance() {
	//---clear plateau
	plateaus = [];

	//---record start time---
	startTime = Date.now();

	//start OBS recording
	toggleOBSRecording();

	recordIntervalID = setInterval(() => {
		console.log("Stopping at:" + (Date.now() - startTime));
		toggleOBSRecording();

		setTimeout(() => {
			console.log("Starting at:" + (Date.now() - startTime));
			toggleOBSRecording();
		}, 500); //KNOWN ISSUE--> seems that OBS will take a little bit of time to save a video file (less than 500ms for a 5min video)

	}, clipLength * 1000);

	started = true;
	console.log("Show begins at: " + startTime);
}

function stopPerformance() {
	//---record stop time---
	started = false;
	clearInterval(recordIntervalID);
	sendOsc("/stopRecording", "");
	isRecording = false;
	console.log("Show stopped at: " + (Date.now() - startTime));

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
	socket = io.connect('http://127.0.0.1:8081', { port: 8081, rememberTransport: false });
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

	//---socket msg from classification sketch
	socket.on('plateauOn', function (msg) {
		console.log("plateau classification is: " + (msg ? "On" : "Off"));
		plateauOn = msg;
	});

	socket.on('plateauNew', function (c) {
		console.log("got new plateau class: ");
		console.log(c);
		plateaus.push({ className: c, time: Date.now() - startTime });
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


//------------methods to get delay frame in TD
function getDelayFrameFirstMatch(_plateaus) {
	if (_plateaus.length > 0) {
		const currentClass = _plateaus[_plateaus.length - 1].className;
		// console.log(currentClass);
		const foundPlateau = _plateaus.find(({ className }) => className === currentClass);

		//converting from seconds to frames
		const delayFrame = floor(foundPlateau.time / 1000 * camFPS);
		return delayFrame;
	} else {
		return undefined;
	}
}

function getDelayFrameRandom(_plateaus) {
	if (_plateaus.length > 0) {
		const currentClass = _plateaus[_plateaus.length - 1].className;
		// console.log(currentClass);
		const foundPlateau = chance.pickone(_plateaus.filter(({ className }) => className === currentClass));

		//converting from seconds to frames
		const delayFrame = floor(foundPlateau.time / 1000 * camFPS);
		return delayFrame;
	} else {
		return undefined;
	}
}
