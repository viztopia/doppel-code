let osc = require('node-osc');
let io = require('socket.io')(8081);

//for OBS
let oscServer1, oscClient1;
let isConnected1 = false;

//for TouchDesigner
let oscServer2, oscClient2;
let isConnected2 = false;

let plateauStatus = false;


io.sockets.on('connection', function (socket) {
	console.log('connection: ' + socket.id);
	setTimeout(() => {
		console.log("broadcasting on/off");
		socket.emit("plateauOn", plateauStatus);
	}, 1000);

	//---OBS---
	socket.on("config1", function (obj) {
		isConnected1 = true;
		oscServer1 = new osc.Server(obj.server.port, obj.server.host);
		oscClient1 = new osc.Client(obj.client.host, obj.client.port);
		oscClient1.send('/status', socket.sessionId + ' connected');
		oscServer1.on('message', function (msg, rinfo) {
			socket.emit("message1", msg);
		});
		socket.emit("connected", 1);
	});
	socket.on("message1", function (obj) {
		// console.log("got message 1");
		oscClient1.send.apply(oscClient1, obj);
	});

	//---TouchDesigner---
	socket.on("config2", function (obj) {
		isConnected2 = true;
		oscServer2 = new osc.Server(obj.server.port, obj.server.host);
		oscClient2 = new osc.Client(obj.client.host, obj.client.port);
		oscClient2.send('/status', socket.sessionId + ' connected');
		oscServer2.on('message', function (msg, rinfo) {
			socket.emit("message2", msg);
		});
		socket.emit("connected", 1);
	});
	socket.on("message2", function (obj) {
		// console.log("got message 2");
		oscClient2.send.apply(oscClient2, obj);
	});

	socket.on('disconnect', function () {
		if (isConnected1) {
			oscServer1.kill();
			oscClient1.kill();
			isConnected1 = false;
		}
		if (isConnected2) {
			oscServer2.kill();
			oscClient2.kill();
			isConnected2 = false;
		}
		console.log('disconnected');
	});

	//-----------------broadcast classification plateau stuff-----------------
	//broadcast plateau stuff
	socket.on('plateauOn', function (msg) {
		socket.broadcast.emit("plateauOn", msg);
		// socket.broadcast.emit("message1", 1234);
		console.log("plateau classification is: " + (msg ? "On" : "Off"));
		plateauStatus = msg;
	});
	socket.on('plateauNew', function (msg) {
		socket.broadcast.emit("plateauNew", msg);
		// socket.broadcast.emit("message1", 1234);
		console.log("new plateau class: " + msg);
	})
});