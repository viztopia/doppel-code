let osc = require('node-osc');
let httpServer = require("http").createServer().listen(8081);
let io = require('socket.io')(httpServer, {
  cors: {
    origin: "*"
  }
});

//for OBS
let oscServer1, oscClient1;
let isConnected1 = false;
let obsSocketID;

//for TouchDesigner
let oscServer2, oscClient2;
let isConnected2 = false;
let tdSocketID;

//------------used to maintain plateau classification status-------------
let plateauStatus = false;
let currentClass;


io.sockets.on('connection', function(socket) {
  console.log('connection: ' + socket.id);
  setTimeout(() => {
    console.log("broadcasting on/off");
    socket.emit("plateauOn", plateauStatus);
  }, 1000);

  //---OBS---
  socket.on("config1", function(obj) {
    isConnected1 = true;
    oscServer1 = new osc.Server(obj.server.port, obj.server.host);
    oscClient1 = new osc.Client(obj.client.host, obj.client.port);
    oscClient1.send('/status', socket.sessionId + ' connected');
    oscServer1.on('message', function(msg, rinfo) {
      socket.emit("message1", msg);
    });
    socket.emit("connected", 1);
    obsSocketID = socket.id;
    console.log("OBS OSC client opened.");
  });
  socket.on("message1", function(obj) {
    if (oscClient1) {
      oscClient1.send.apply(oscClient1, obj);
    } else {
      console.log("OBS OSC client not open.");
    }

  });

  //---TouchDesigner---
  socket.on("config2", function(obj) {
    isConnected2 = true;
    oscServer2 = new osc.Server(obj.server.port, obj.server.host);
    oscClient2 = new osc.Client(obj.client.host, obj.client.port);
    oscClient2.send('/status', socket.sessionId + ' connected');
    oscServer2.on('message', function(msg, rinfo) {
      socket.emit("message2", msg);
    });
    socket.emit("connected", 1);
    tdSocketID = socket.id;
    console.log("TD OSC client opened.");
  });
  socket.on("message2", function(obj) {
    if (oscClient2) {
      oscClient2.send.apply(oscClient2, obj);
    } else {
      console.log("TD OSC client not open.");
    }
  });

  socket.on('disconnect', function() {
    if (isConnected1 && socket.id == obsSocketID) {
      oscServer1.kill();
      oscClient1.kill();
      isConnected1 = false;
      console.log("OBS OSC client closed.");
    }
    if (isConnected2 && socket.id == obsSocketID) {
      oscServer2.kill();
      oscClient2.kill();
      isConnected2 = false;
      console.log("TD OSC client closed.");
    }
    console.log('disconnected');
  });

  //-----------------broadcast stage managing events-----------------
  socket.on('source', function(msg) {
    socket.broadcast.emit("source", msg);
    // socket.broadcast.emit("message1", 1234);
    console.log("source is: " + msg);
  });
  socket.on('frameIdx', function(msg) {
    socket.broadcast.emit("frameIdx", msg);
    // socket.broadcast.emit("message1", 1234);
    console.log("frameIdx is: " + msg);
  });
  socket.on('fileIdx', function(msg) {
    socket.broadcast.emit("fileIdx", msg);
    // socket.broadcast.emit("message1", 1234);
    console.log("fileIdx is: " + msg);
  });
  socket.on('cuePoint', function(msg) {
    socket.broadcast.emit("cuePoint", msg);
    // socket.broadcast.emit("message1", 1234);
    console.log("cuePoint is: " + msg);
  });
  socket.on('cuePulse', function(msg) {
    socket.broadcast.emit("cuePulse", msg);
    // socket.broadcast.emit("message1", 1234);
    console.log("cuePulse is: " + msg);
  });
  socket.on('blackoutleft', function(msg) {
    socket.broadcast.emit("blackoutleft", msg);
    // socket.broadcast.emit("message1", 1234);
    console.log("blackoutleft is: " + msg);
  });
  socket.on('blackoutright', function(msg) {
    socket.broadcast.emit("blackoutright", msg);
    // socket.broadcast.emit("message1", 1234);
    console.log("blackoutright is: " + msg);
  });
  socket.on('fadeinleft', function() {
    socket.broadcast.emit("fadeinleft");
    // socket.broadcast.emit("message1", 1234);
    console.log("fadeinleft");
  });
  socket.on('record', function(msg) {
    socket.broadcast.emit("record", msg);
    // socket.broadcast.emit("message1", 1234);
    console.log("record is: " + msg);
  });
  socket.on('resumerecord', function(msg) {
    socket.broadcast.emit("resumerecord", msg);
    // socket.broadcast.emit("message1", 1234);
    console.log("resume recording starting from: " + msg);
  });
  socket.on('showdoppel', function(msg) {
    socket.broadcast.emit("showdoppel", msg);
    // socket.broadcast.emit("message1", 1234);
    console.log("show doppel: " + msg);
  });
  socket.on('playsound', function(msg) {
    socket.broadcast.emit("playsound", msg);
    // socket.broadcast.emit("message1", 1234);
    console.log("playing sound: " + msg);
  });
  socket.on('cuesound', function(msg) {
    socket.broadcast.emit("cuesound", msg);
    // socket.broadcast.emit("message1", 1234);
    console.log("cue sound at: " + msg);
  });



  //-----------------broadcast classification plateau stuff-----------------

  //control classification
  socket.on('toggleclassifier', function() {
    socket.broadcast.emit("toggleclassifier");
    // socket.broadcast.emit("message1", 1234);
    console.log("toggle classifier");
  });

  socket.on('togglesendclass', function() {
    socket.broadcast.emit("togglesendclass");
    // socket.broadcast.emit("message1", 1234);
    console.log("toggle send class");
  });
  
  //broadcast plateau stuff
  socket.on('plateauOn', function(msg) {
    socket.broadcast.emit("plateauOn", msg);
    // socket.broadcast.emit("message1", 1234);
    console.log("plateau classification is: " + (msg ? "On" : "Off"));
    plateauStatus = msg;
  });
  //broadcast plateau stuff
  socket.on('plateauOn', function(msg) {
    socket.broadcast.emit("plateauOn", msg);
    // socket.broadcast.emit("message1", 1234);
    console.log("plateau classification is: " + (msg ? "On" : "Off"));
    plateauStatus = msg;
  });
  socket.on('plateauNew', function(msg) {
    socket.broadcast.emit("plateauNew", msg);
    // socket.broadcast.emit("message1", 1234);
    console.log("new plateau data: " + msg);
  });
  socket.on('classNew', function(msg) {
    socket.broadcast.emit("classNew", msg);
    // socket.broadcast.emit("message1", 1234);
    currentClass = msg;
    console.log("new class: " + msg);
  });
  socket.on('queryClass', function() {
    if (currentClass) socket.emit("queriedClass", currentClass);
    // socket.broadcast.emit("message1", 1234);
    console.log("queried class: " + currentClass);
  });
  socket.on('jointDist', function(msg) {
    socket.broadcast.emit("jointDist", msg);
  });
});

console.log("waiting for socket connections...");
