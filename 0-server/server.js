let port = process.env.PORT || 8081;
// Get the express web application framework
let express = require('express');
// Create an express app
let app = express();
// Make a web application server!
let server = require('http').createServer(app).listen(port, function () {
  console.log('Server listening at port: ', port);
});


let io = require('socket.io')(server, {
  cors: {
    origin: "http://0.0.0.0:8000",
    methods: ["GET", "POST"],
    credentials: false
  }
});


//------------used to maintain plateau classification status-------------
let classifying = false;
const PLATEAUS = 0;
const CLASSES = 1;
let sending = -1;
let currentClass = undefined;


io.sockets.on('connection', function(socket) {
  console.log('connection: ' + socket.id);
  setTimeout(() => {
    console.log("broadcasting platuea / class status.");
    socket.emit("classifying", classifying);
    socket.emit("sending", sending);
  }, 1000);


  socket.on('disconnect', function() {
    console.log('disconnected');
  });

  //-----------------broadcast stage managing events-----------------
  socket.on('source', function(msg) {
    console.log("source is: " + msg);
    socket.broadcast.emit("source", msg);
  });
  socket.on('frameIdx', function(msg) {
    console.log("frameIdx is: " + msg);
    socket.broadcast.emit("frameIdx", msg);
  });
  socket.on('fileIdx', function(msg) {
    console.log("fileIdx is: " + msg);
    socket.broadcast.emit("fileIdx", msg);
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


  //-----------------broadcast classification plateau stuff-----------------

  //update classification window
  socket.on('updateWindow', function(msg) {
    socket.broadcast.emit("updateWindow", msg);
    // socket.broadcast.emit("message1", 1234);
    console.log("update window to to: " + msg);
  });

  //update classification confidence
  socket.on('updateConfidence', function(msg) {
    socket.broadcast.emit("updateConfidence", msg);
    // socket.broadcast.emit("message1", 1234);
    console.log("update confidence to to: " + msg);
  });

  //control classification
  socket.on('setclassifier', function(msg) {
    socket.broadcast.emit("setclassifier", msg);
    // socket.broadcast.emit("message1", 1234);
    console.log("set classifier to: " + msg);
  });

  socket.on('setsender', function(msg) {
    socket.broadcast.emit("setsender", msg);
    // socket.broadcast.emit("message1", 1234);
    console.log("set send class to: " + msg == CLASSES ? "Plateaus" : "Classes");
  });

  //broadcast plateau stuff
  socket.on('classifying', function(msg) {
    socket.broadcast.emit("classifying", msg);
    // socket.broadcast.emit("message1", 1234);
    console.log("classification is: " + (msg ? "On" : "Off"));
    plateauStatus = msg;
  });
  socket.on('plateauNew', function(msg) {
    socket.broadcast.emit("plateauNew", msg);
    // socket.broadcast.emit("message1", 1234);
    console.log("new plateau data: " + msg);
  });
  socket.on('sending', function(msg) {
    socket.broadcast.emit("sending", msg);
    // socket.broadcast.emit("message1", 1234);
    console.log("sending: " + msg == 0 ? "Plateaus" : "Classes");
    classStatus = msg;
  });
  socket.on('classNew', function(msg) {
    socket.broadcast.emit("classNew", msg);
    // socket.broadcast.emit("message1", 1234);
    currentClass = msg;
    console.log("new class: " + msg);
  });
  socket.on('queryClass', function() {
    socket.emit("queriedClass", currentClass);
    // socket.broadcast.emit("message1", 1234);
    console.log("queried class: " + currentClass);
  });
  socket.on('jointDist', function(msg) {
    socket.broadcast.emit("jointDist", msg);
  });
});

console.log("waiting for socket connections...");
