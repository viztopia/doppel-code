const io = require('socket.io-client');
const {
  exec
} = require("child_process");
const nrc = require('node-run-cmd');


//------------------socket--------------------
let socket;
//let ip = "10.18.244.193"
//let ip = "192.168.1.2"; //the IP of the machine that runs server.js
let ip = "127.0.0.1"; //or local host
let port = 8081; //the port of the machine that runs server.js


//---------------------socket stuff------------------------------
function setupSocket() {
  console.log("connectting to server...")
  socket = io.connect("http://" + ip + ":" + port, {
    port: port,
    rememberTransport: false,
  });
  socket.on("connect", function() {
    console.log("connected to server")
  });

  function sendCommand(command) {
    cmd.run(command, (error, stdout, stderr) => {
      if (error) {
        console.log(`error: ${error.message}`);
        return;
      }
      if (stderr) {
        console.log(`stderr: ${stderr}`);
        return;
      }
      console.log(`stdout: ${stdout}`);
    });
  }
  //-----------play sound----------------
  socket.on("playsound", function(msg) {
    const PLAY = msg.play;
    const SECS = msg.secs;
    console.log(msg, PLAY, SECS);
    let command1 = "killall -9 VLC";
    nrc.run(command1).then(function(exitCodes) {
      if(!PLAY) return;
      let command2 = "/Applications/VLC.app/Contents/MacOS/VLC --fullscreen /Users/mimi/Desktop/test.mov --start-time " + SECS;
      nrc.run(command2);
    }, function(err) {
      console.log('Command failed to run with error: ', err);
    });
  });
}


setupSocket();
